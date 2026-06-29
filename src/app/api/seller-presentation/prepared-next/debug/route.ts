// TEMP (remove before flag flip): PREPARED_NEXT diagnostic endpoint.
//
// A read-only twin of POST /api/seller-presentation/prepared-next that runs the
// SAME pipeline for a slug — load public payload → extractBulletCandidates →
// confidence → (if >= partial) the single capped generation → the output
// validator — but persists NOTHING: it never reads/writes a Work Order, never
// consumes the generation cap, never caches, never dedupes. So it can be called
// repeatedly and ALWAYS actually runs generate+validate, returning the result
// (and any failure detail) as JSON for the device walk to read directly.
//
// Same guards as the real route: PREPARED_NEXT must be on (else 503), the caller
// must be authenticated, and the page must be owned by the caller (else 404).
// Diagnostic only — the real flow, gates, thresholds, and prompt are untouched.
// Delete this whole route before the flag flips.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload } from "@/tools/seller-presentation/output/public-payload";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import { isPreparedNextEnabled } from "@/lib/seller-presentation/prepared-next/flag";
import { extractBulletCandidates } from "@/lib/seller-presentation/prepared-next/bullets";
import { resolveConfidence } from "@/lib/seller-presentation/prepared-next/confidence";
import { generateFollowUpDraft } from "@/lib/seller-presentation/prepared-next/generate";
import { validatePreparedOutput } from "@/lib/seller-presentation/prepared-next/validate";
import { composePreparedDraft } from "@/lib/seller-presentation/prepared-next/compose";

export const runtime = "nodejs";
export const maxDuration = 60;

function noStore(json: unknown, status: number): NextResponse {
  return NextResponse.json(json, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Identical to the real route's denylist builder (kept local so the real route
 *  is untouched): payload string leaves outside the clip, length-gated. */
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

const GATE_TO_REASON = {
  denylist: "denylist",
  "em-dash": "em_dash",
  truncated: "truncated",
  empty: "empty",
} as const;

export async function GET(req: Request): Promise<NextResponse> {
  // Flag-off: dark, like the real route.
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

  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return noStore({ ok: false, error: "Missing slug" }, 400);
  }

  // Owner-scoped read (no Work Order, no cap, no cache, no dedupe).
  const record = await getHandoutRecord(slug);
  if (!record || record.ownerEmail.toLowerCase() !== accountId) {
    return noStore({ ok: false, error: "Page not found or not owned by this agent" }, 404);
  }

  const payload = clampPublicPayload(record.data);
  const bullets = extractBulletCandidates(payload);
  const conf = resolveConfidence(payload, bullets);

  // Stable response shape — failure-detail keys default null.
  const base = {
    ok: true as const,
    slug,
    confidence: conf.confidence,
    sections: bullets.map((b) => b.section),
    count: bullets.length,
    generated: false,
    failed: false,
    reason: null as string | null,
    gate: null as string | null,
    genReason: null as string | null,
    errorName: null as string | null,
    errorMessage: null as string | null,
    // TEMP (v0.3): raw usage so the walk can verify length directly.
    outputTokens: null as number | null,
    stopReason: null as string | null,
    // On a gate rejection: a ~200-char RAW excerpt (where it tripped).
    textExcerpt: null as string | null,
    emailExcerpt: null as string | null,
    // On a PASS: the FULL composed variants (model text + appended link + CTA).
    textVariant: null as string | null,
    emailVariant: null as string | null,
  };

  // weak → the real route never generates (zero spend). Report and stop.
  if (conf.confidence === "weak") {
    return noStore({ ...base, reason: "weak" }, 200);
  }

  // Voice + page link, identical to the real route.
  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/h/${slug}`;
  const agentName =
    (payload.agent?.name || payload.agentBranding?.name || "").trim() || "Your agent";
  const tagline = payload.agentTagline?.trim();
  const signatureLine = payload.signatureLine?.trim();
  const guarantee =
    payload.whyUs && typeof payload.whyUs.guarantee === "string"
      ? payload.whyUs.guarantee.trim()
      : undefined;
  const neutral = !tagline && !signatureLine && !guarantee && !payload.whyUs;

  // The single capped generation (no persistence, no cap consumed).
  const gen = await generateFollowUpDraft({
    bullets,
    sellerName: payload.preparedFor?.trim() ?? undefined,
    voice: {
      agentName,
      brokerage: payload.agent?.brokerage?.trim() || undefined,
      tagline,
      signatureLine,
      guarantee,
      neutral,
    },
  });

  if (!gen.ok) {
    return noStore(
      {
        ...base,
        failed: true,
        reason: gen.reason === "malformed" ? "parse" : "gen_exception",
        genReason: gen.reason,
        errorName: gen.reason !== "malformed" ? gen.errorName ?? null : null,
        errorMessage:
          gen.reason !== "malformed" ? (gen.errorMessage ?? "").slice(0, 200) || null : null,
      },
      200,
    );
  }

  // The output validator (same denylist construction as the real route).
  const clippedText = bullets.map((b) => `${b.label} ${b.text}`).join("\n");
  const denyValues = buildDenyValues(payload, clippedText, [
    agentName,
    payload.agent?.brokerage ?? "",
    payload.preparedFor ?? "",
    pageUrl,
    slug,
  ]);
  const verdict = validatePreparedOutput({
    textVariant: gen.draft.textVariant,
    emailVariant: gen.draft.emailVariant,
    denyValues,
    tokenCapHit: gen.tokenCapHit,
  });

  // Usage is available whenever generation succeeded (validator pass OR fail).
  const usage = {
    outputTokens: gen.outputTokens ?? null,
    stopReason: gen.stopReason ?? null,
  };

  if (!verdict.ok) {
    // On a gate rejection, show the RAW model output (~200 chars) so the walk
    // sees where it tripped (e.g. a truncated tail).
    return noStore(
      {
        ...base,
        ...usage,
        generated: true,
        failed: true,
        reason: GATE_TO_REASON[verdict.reason],
        gate: verdict.reason,
        textExcerpt: gen.draft.textVariant.slice(0, 200),
        emailExcerpt: gen.draft.emailVariant.slice(0, 200),
      },
      200,
    );
  }

  // Passed generate + validate. Return the FINAL composed variants (model text +
  // the code-appended page link + CTA) in FULL so the walk can read the whole
  // thing and judge voice + length. Drafts are short by design; this is the
  // agent's own draft on a dark build.
  const composed = composePreparedDraft(gen.draft, pageUrl);
  return noStore(
    {
      ...base,
      ...usage,
      generated: true,
      failed: false,
      textVariant: composed.textVariant,
      emailVariant: composed.emailVariant,
    },
    200,
  );
}
