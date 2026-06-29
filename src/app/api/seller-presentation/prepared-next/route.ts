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
import { extractBulletCandidates } from "@/lib/seller-presentation/prepared-next/bullets";
import { resolveConfidence } from "@/lib/seller-presentation/prepared-next/confidence";
import { generateFollowUpDraft } from "@/lib/seller-presentation/prepared-next/generate";
import { validatePreparedOutput } from "@/lib/seller-presentation/prepared-next/validate";
import { viewedSignalMoment } from "@/lib/seller-presentation/prepared-next/moment";
import {
  ensureEligibleWorkOrder,
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
    body.action === "dismiss"
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

  // ---- prepare / retry ----
  // A page the agent already dismissed for THIS version stays dismissed (no
  // re-nag) until the page materially changes (a new version supersedes above).
  if (wo.status === "dismissed") {
    return noStore({ ok: true, status: "dismissed" }, 200);
  }
  // Terminal failure: no retry button, no further action.
  if (wo.status === "failed_final") {
    return noStore({ ok: false, code: "failed-final", status: "failed_final" }, 200);
  }

  // Confidence (rule-derived) — needed for both the weak short-circuit and display.
  const payload = clampPublicPayload(record.data);
  const bullets = extractBulletCandidates(payload);
  const conf = resolveConfidence(payload, bullets, { sellerName: sellerNameOverride });
  // TEMP (remove before flag flip): PREPARED_NEXT walk verification — confirms
  // which sections fired on a given slug during the preview device walk.
  console.log("PREPARED_NEXT walk:", {
    slug,
    confidence: conf.confidence,
    sections: bullets.map((b) => b.section),
    count: bullets.length,
  });
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
        bullets,
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

  // Voice from the public payload (already public, honest material). Thin profile
  // → neutral Studio voice, no fake personalization.
  const agentName =
    (payload.agent?.name || payload.agentBranding?.name || "").trim() || "Your agent";
  const tagline = payload.agentTagline?.trim();
  const signatureLine = payload.signatureLine?.trim();
  const guarantee =
    payload.whyUs && typeof payload.whyUs.guarantee === "string"
      ? payload.whyUs.guarantee.trim()
      : undefined;
  const neutral = !tagline && !signatureLine && !guarantee && !payload.whyUs;

  // One capped generation call.
  wo = { ...wo, generationCount: wo.generationCount + 1 };
  const gen = await generateFollowUpDraft({
    bullets,
    sellerName: sellerNameOverride ?? payload.preparedFor?.trim() ?? undefined,
    voice: {
      agentName,
      brokerage: payload.agent?.brokerage?.trim() || undefined,
      tagline,
      signatureLine,
      guarantee,
      neutral,
    },
  });

  const failTo = (): "failed" | "failed_final" =>
    wo!.generationCount >= MAX_GENERATIONS_PER_WORK_ORDER ? "failed_final" : "failed";

  if (!gen.ok) {
    const status = failTo();
    // TEMP (remove before flag flip): WHY generation failed — gen_exception
    // (caught SDK error, with its name + first ~200 chars of the message) vs
    // parse (model returned unparseable / wrong-shape JSON).
    console.log("PREPARED_NEXT walk fail:", {
      slug,
      stage: "generate",
      reason: gen.reason === "malformed" ? "parse" : "gen_exception",
      genReason: gen.reason,
      ...(gen.reason !== "malformed"
        ? {
            errorName: gen.errorName,
            errorMessage: (gen.errorMessage ?? "").slice(0, 200),
          }
        : {}),
    });
    await saveWorkOrder(slug, { ...wo, status });
    return noStore(
      { ok: false, code: "generation-failed", status, reason: gen.reason },
      200,
    );
  }

  // Output validator (the gate). Build the dynamic denylist from payload values
  // outside the clip; allow the link + agent/seller identity + the bullet texts.
  const clippedText = bullets.map((b) => `${b.label} ${b.text}`).join("\n");
  const denyValues = buildDenyValues(payload, clippedText, [
    agentName,
    payload.agent?.brokerage ?? "",
    sellerNameOverride ?? payload.preparedFor ?? "",
    pageUrl,
    slug,
  ]);
  const verdict = validatePreparedOutput({
    textVariant: gen.draft.textVariant,
    emailVariant: gen.draft.emailVariant,
    denyValues,
    tokenCapHit: gen.tokenCapHit,
  });
  if (!verdict.ok) {
    const status = failTo();
    // TEMP (remove before flag flip): WHY the validator rejected — the gate name
    // plus a ~200-char excerpt of the rejected draft (the agent's OWN draft, on a
    // dark/preview build, so fine to log). em-dash gate normalized to em_dash.
    const gateToReason = {
      denylist: "denylist",
      "em-dash": "em_dash",
      truncated: "truncated",
      empty: "empty",
    } as const;
    console.log("PREPARED_NEXT walk fail:", {
      slug,
      stage: "validate",
      reason: gateToReason[verdict.reason],
      gate: verdict.reason,
      detail: verdict.detail,
      textExcerpt: gen.draft.textVariant.slice(0, 200),
      emailExcerpt: gen.draft.emailVariant.slice(0, 200),
    });
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
      bullets,
      pageUrl,
    },
    200,
  );
}
