import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { auth } from "@/lib/auth";
import { getHandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload } from "@/tools/seller-presentation/output/public-payload";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import { isPreparedNextEnabled } from "@/lib/seller-presentation/prepared-next/flag";
import {
  MAX_GENERATIONS_PER_WORK_ORDER,
  PER_ACCOUNT_DAILY_GEN_CEILING,
} from "@/lib/seller-presentation/prepared-next/constants";
import { composePreparedDraft } from "@/lib/seller-presentation/prepared-next/compose";
import { resolveConfidence } from "@/lib/seller-presentation/prepared-next/confidence";
import { generateFollowUpDraft } from "@/lib/seller-presentation/prepared-next/generate";
import { loadAgentVoice } from "@/lib/seller-presentation/prepared-next/voice-source";
import { validatePreparedOutput } from "@/lib/seller-presentation/prepared-next/validate";
import { viewedSignalMoment } from "@/lib/seller-presentation/prepared-next/moment";
import {
  ensureEligibleWorkOrder,
  newEligibleWorkOrder,
  getWorkOrder,
  saveWorkOrder,
  type FollowUpRecapWorkOrder,
} from "@/lib/seller-presentation/prepared-next/work-order";

/**
 * POST /api/seller-presentation/prepared-next (PREPARED_NEXT, Anticipation v0).
 *
 * The ONE explicit-click endpoint behind the "Prepare follow-up" upgrade of the
 * "Worth a follow-up" cockpit nudge. Generation happens ONLY here, only on a
 * deliberate agent action — never in the background, never auto. Review-first:
 * the drafted text + email are returned for the agent to review/edit/copy/
 * dismiss, and NOTHING is ever sent. `writeback` stays null (no CRM).
 *
 * Flag-gated: 503 when PREPARED_NEXT !== 'true', so the whole layer is dark and
 * the card is byte-identical to today's passive nudge.
 *
 * Actions (body `{ slug, action?, sellerName? }`):
 *   - "prepare" (default) → compute confidence; weak ⇒ no draft, zero spend;
 *     else generate + validate + cache the prepared draft (idempotent: a re-click
 *     on an already-prepared page returns the cached draft, no regenerate).
 *   - "retry"   → the ONE manual retry after a failure (two-generation cap).
 *   - "prepare_again" → the §8.1 manual escape from a dismissed page: resets the
 *     dismissed WO to a fresh eligible (current version) and generates. The ONLY
 *     path that reopens a dismiss; auto paths (view / republish) never do (v0.9).
 *   - "copy" / "dismiss" → quiet state marks (no model spend).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  slug?: unknown;
  action?: unknown;
  sellerName?: unknown;
}

function noStore(json: unknown, status: number): NextResponse {
  return NextResponse.json(json, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Collect string leaves of the payload NOT present in the clipped text — the
 *  dynamic verbatim-leak backstop (see validate.ts). Bounded + length-gated to
 *  avoid false positives; the input clip is the real guarantee. */
function buildDenyValues(
  payload: PublicPayload,
  clippedText: string,
  allow: string[],
): string[] {
  const clip = clippedText.toLowerCase();
  const allowSet = new Set(allow.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const out = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || out.size > 60) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length >= 8 && !clip.includes(s.toLowerCase()) && !allowSet.has(s.toLowerCase())) {
        out.add(s);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) visit(val, depth + 1);
    }
  };
  visit(payload, 0);
  return [...out];
}

export async function POST(req: Request): Promise<NextResponse> {
  // Flag-off: dark. No work, no spend, no KV touch.
  if (!isPreparedNextEnabled()) {
    return noStore(
      { ok: false, code: "feature-disabled", error: "Prepared follow-up is not enabled" },
      503,
    );
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return noStore({ ok: false, error: "Not authenticated" }, 401);
  }
  const accountId = email.toLowerCase();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return noStore({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (typeof body.slug !== "string" || !body.slug.trim()) {
    return noStore({ ok: false, error: "Missing slug" }, 400);
  }
  const slug = body.slug.trim();
  const action =
    body.action === "retry" ||
    body.action === "copy" ||
    body.action === "dismiss" ||
    body.action === "prepare_again"
      ? body.action
      : "prepare";
  const sellerNameOverride =
    typeof body.sellerName === "string" && body.sellerName.trim()
      ? body.sellerName.trim()
      : undefined;

  // Owner-scoped read of the raw record (data + ownerEmail + version).
  const record = await getHandoutRecord(slug);
  if (!record || record.ownerEmail.toLowerCase() !== accountId) {
    return noStore({ ok: false, error: "Page not found or not owned by this agent" }, 404);
  }
  const version = record.updatedAt ?? "initial";

  // Load or (resiliently) ensure the Work Order. ensureEligible supersedes on a
  // content-version change, so a stale prior WO never blocks a fresh prepare.
  let wo = await getWorkOrder(slug);
  if (!wo || wo.version !== version) {
    wo = await ensureEligibleWorkOrder({
      moment: viewedSignalMoment({
        slug,
        ownerEmail: accountId,
        handoutUpdatedAt: version,
        timestamp: new Date().toISOString(),
      }),
      accountId,
      version,
    });
  }

  // ---- Lightweight state marks (no model spend) ----
  if (action === "dismiss") {
    const next: FollowUpRecapWorkOrder = { ...wo, status: "dismissed", approvalAction: "dismiss" };
    await saveWorkOrder(slug, next);
    return noStore({ ok: true, status: "dismissed" }, 200);
  }
  if (action === "copy") {
    const next: FollowUpRecapWorkOrder = { ...wo, status: "copied", approvalAction: "approve" };
    await saveWorkOrder(slug, next);
    return noStore({ ok: true, status: "copied" }, 200);
  }

  // ---- prepare / retry / prepare_again ----
  // A dismissed page stays dismissed: ensureEligibleWorkOrder preserves dismiss
  // across version changes (the one terminal state a republish does not reopen),
  // so a dismissed agent is never re-nagged. Every OTHER terminal status (failed /
  // failed_final) was already reset to `eligible` above when the version changed.
  if (wo.status === "dismissed") {
    // v1.6: ONLY an explicit "Prepare again" reopens a dismissed Work Order (the
    // §8.1 manual-regenerate escape). A plain prepare / retry click, and every AUTO
    // path (a new seller view, a republish / new version), leaves it dismissed, so
    // the v0.9 anti-nag guarantee holds: a dismissed agent is never re-nagged.
    if (action !== "prepare_again") {
      return noStore({ ok: true, status: "dismissed" }, 200);
    }
    // Reset to a FRESH eligible for the CURRENT version (fresh generationCount) and
    // fall through to the normal capped generation (one initial + one manual retry,
    // the per-account daily ceiling, and the validator are all unchanged).
    wo = newEligibleWorkOrder({
      moment: viewedSignalMoment({
        slug,
        ownerEmail: accountId,
        handoutUpdatedAt: version,
        timestamp: new Date().toISOString(),
      }),
      accountId,
      version,
    });
  }
  // Terminal failure: no retry button, no further action.
  if (wo.status === "failed_final") {
    return noStore({ ok: false, code: "failed-final", status: "failed_final" }, 200);
  }

  // Confidence (rule-derived) — v0.5 minimal-claims recap: decided from the
  // payload alone (no bullet candidates). The page is preparable whenever it has
  // a property subject + agent identity.
  const payload = clampPublicPayload(record.data);
  const conf = resolveConfidence(payload, { sellerName: sellerNameOverride });
  wo = {
    ...wo,
    confidence: conf.confidence,
    availableContext: conf.availableContext,
    missingContext: conf.missingContext,
    whyNow:
      conf.confidence === "weak"
        ? "A seller opened this page, but there is not enough to prepare a useful draft yet."
        : "A seller recently engaged with this page.",
  };

  // weak → do NOT draft. Zero model spend.
  if (conf.confidence === "weak") {
    await saveWorkOrder(slug, wo);
    return noStore(
      { ok: true, status: "weak", confidence: "weak", reason: "not-enough-context" },
      200,
    );
  }

  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/h/${slug}`;

  // Cached prepared draft (same version): a re-render / re-click does NOT
  // regenerate. Only an explicit "retry" forces a new generation.
  if (action !== "retry" && wo.status === "prepared" && wo.draftOutput) {
    await saveWorkOrder(slug, wo);
    return noStore(
      {
        ok: true,
        status: "prepared",
        confidence: conf.confidence,
        askField: conf.askField,
        draft: wo.draftOutput,
        pageUrl,
      },
      200,
    );
  }

  // Two-generation cap (one initial + one manual retry). No more generations.
  if (wo.generationCount >= MAX_GENERATIONS_PER_WORK_ORDER) {
    const next: FollowUpRecapWorkOrder = { ...wo, status: "failed_final" };
    await saveWorkOrder(slug, next);
    return noStore({ ok: false, code: "failed-final", status: "failed_final" }, 200);
  }

  // Per-account daily generation ceiling (soft cap, even in dark launch). Mirrors
  // the comp-import counter; KV-unavailable degrades open (the flag + cap + the
  // per-WO two-generation cap still bound spend).
  try {
    const today = new Date().toISOString().slice(0, 10);
    const capKey = `prepared_next_gen:${accountId}:${today}`;
    const used = (await kv.incr(capKey)) as number;
    if (used === 1) await kv.expire(capKey, 2 * 24 * 3600);
    if (used > PER_ACCOUNT_DAILY_GEN_CEILING) {
      return noStore(
        {
          ok: false,
          code: "daily-cap-hit",
          error: "You have reached today's prepared follow-up limit. Try again tomorrow.",
        },
        429,
      );
    }
  } catch {
    // KV unavailable — skip the soft ceiling (other bounds still apply).
  }

  // v0.5 minimal-claims recap: generation gets ONLY the safe, factual fields —
  // no page data, no bullets — so there is nothing to overstate. `agentName` is
  // kept solely for the denylist allow-list below.
  const agentName =
    (payload.agent?.name || payload.agentBranding?.name || "").trim() || "Your agent";
  const propertyLabel =
    (payload.propertyAddress || payload.property?.address || "").trim() || "your home";
  // v0.6 §2 appointment-tense guard: only pass the appointment when it is actually
  // upcoming. The page stores a timezone-less local wall-clock, so this compares
  // against the server clock (good enough for the "upcoming" framing). A past
  // appointment is dropped, so the recap never references a date that has passed.
  const apptRaw = payload.appointmentAt?.trim() || undefined;
  const appointmentAt =
    apptRaw && Date.parse(apptRaw) > Date.now() ? apptRaw : undefined;
  const sellerName = sellerNameOverride ?? payload.preparedFor?.trim() ?? undefined;

  // v1.1: source the agent's VOICE from the LIVE brand Profile (tone cues only —
  // NOT page data), so a voice set in Settings takes effect on the next prepare
  // for every page with no republish, and an invitation page no longer falls to
  // neutral just because its frozen payload lacks the State-A voice snapshot.
  const voice = await loadAgentVoice(accountId, agentName);

  // One capped generation call.
  wo = { ...wo, generationCount: wo.generationCount + 1 };
  const gen = await generateFollowUpDraft({
    sellerName,
    propertyLabel,
    appointmentAt,
    voice,
  });

  const failTo = (): "failed" | "failed_final" =>
    wo!.generationCount >= MAX_GENERATIONS_PER_WORK_ORDER ? "failed_final" : "failed";

  if (!gen.ok) {
    const status = failTo();
    await saveWorkOrder(slug, { ...wo, status });
    return noStore(
      { ok: false, code: "generation-failed", status, reason: gen.reason },
      200,
    );
  }

  // Output validator (the gate). The model received ONLY the safe fields, so the
  // "clip" is those fields; the denylist is every OTHER payload string value
  // (comps, views, valuation, etc.) the model never saw and must not emit.
  const safeInput = [sellerName ?? "", propertyLabel, appointmentAt ?? ""]
    .filter(Boolean)
    .join(" ");
  const denyValues = buildDenyValues(payload, safeInput, [
    agentName,
    voice.agentName,
    payload.agent?.brokerage ?? "",
    voice.brokerage ?? "",
    pageUrl,
    slug,
    // v0.8: the agent's own voice cues are allowed (the model may channel their
    // tone); they are not market/data leaks. v1.1: sourced from the live Profile.
    voice.tagline ?? "",
    voice.signatureLine ?? "",
    voice.guarantee ?? "",
  ]);
  const verdict = validatePreparedOutput({
    textVariant: gen.draft.textVariant,
    emailVariant: gen.draft.emailVariant,
    denyValues,
    tokenCapHit: gen.tokenCapHit,
  });
  if (!verdict.ok) {
    const status = failTo();
    await saveWorkOrder(slug, { ...wo, status });
    return noStore(
      { ok: false, code: "validation-failed", status, reason: verdict.reason },
      200,
    );
  }

  // Append the code-constant page link + CTA (both exempt from the validator,
  // never model-made — the model is told to write no URL, v0.2 truncation fix).
  const draftOutput = composePreparedDraft(gen.draft, pageUrl);
  const prepared: FollowUpRecapWorkOrder = {
    ...wo,
    status: "prepared",
    draftOutput,
  };
  await saveWorkOrder(slug, prepared);

  return noStore(
    {
      ok: true,
      status: "prepared",
      confidence: conf.confidence,
      askField: conf.askField,
      draft: draftOutput,
      pageUrl,
    },
    200,
  );
}
