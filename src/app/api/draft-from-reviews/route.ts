import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { auth } from "@/lib/auth";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements, resolveSkill } from "@/lib/entitlements/resolver";
import { dailyReviewDraftCap } from "@/lib/entitlements/usage-caps";
import { SELLER_PRESENTATION_SKILL } from "@/tools/seller-presentation/skill";
import {
  draftFromReviewsWithAI,
  buildReviewDraftCacheKey,
  type ReviewDraftSuggestions,
} from "@/lib/ai/review-draft-mapper";
import { MissingAnthropicKeyError } from "@/lib/ai/anthropic-client";

/**
 * POST /api/draft-from-reviews (B0a — second AI plug-point).
 *
 * The agent clicks "Draft from your reviews" in Settings; this runs Haiku over
 * the reviews they've ALREADY entered (plus any pasted) and returns editable
 * suggestions for bio / tagline / reviews-headline. The agent applies/edits —
 * nothing is auto-written, nothing is published here (B0a is data-IN only).
 *
 * Discipline mirrors /api/comp-import verbatim in pattern:
 *   - Auth + tier gate (aiAccess.state must be 'available').
 *   - Rate limit: rate_limit_review_draft:<email>, 10/hr.
 *   - Daily cap: ai_review_draft_count:<email>:<YYYY-MM-DD>, per access mode.
 *   - One AI call per distinct review-text (hash). 24h cache on the hash.
 *   - E2E_TESTING=1 → deterministic fixture, no network, offline + free.
 *   - maxDuration matches comp-import (60) so a slow Anthropic call trips its
 *     own 12s timeout and surfaces the calm fallback rather than a silent 502.
 *
 * COMPLIANCE: operates ONLY on the review text in the request body. It NEVER
 * fetches or scrapes a URL (Zillow/Google scraping is a standing landmine —
 * memory `sep-path-b-viability`).
 *
 * PRIVACY: the raw review text is hashed for the cache key and then dropped;
 * the cache stores ONLY the derived suggestions, never the review text.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX_PER_HOUR = 10;
const CACHE_TTL_SECONDS = 24 * 3600;
const MAX_REVIEW_CHARS = 20_000;

interface ReviewInput {
  body?: unknown;
  attributionName?: unknown;
  attributionYear?: unknown;
}

interface ApiOk {
  ok: true;
  suggestions: ReviewDraftSuggestions;
  cacheHit: boolean;
  /** Diagnostic — never PII. */
  ai?: { source: "live" | "fixture" | "cache"; latencyMs: number; retried: boolean };
}

interface ApiErr {
  ok: false;
  code:
    | "feature-disabled"
    | "not-authenticated"
    | "upgrade-required"
    | "rate-limited"
    | "daily-cap-hit"
    | "no-reviews"
    | "ai-unavailable"
    | "internal";
  message: string;
}

/**
 * Flatten the agent's reviews + any pasted text into a single stable string.
 * Order-preserving so the same reviews hash to the same cache key. Caps total
 * length defensively (the model only needs the gist, and the hash stays cheap).
 */
function buildReviewsText(reviews: ReviewInput[], pasted: string): string {
  const lines: string[] = [];
  for (const r of reviews) {
    const body = typeof r.body === "string" ? r.body.trim() : "";
    if (!body) continue;
    const name =
      typeof r.attributionName === "string" ? r.attributionName.trim() : "";
    const year =
      typeof r.attributionYear === "string" ? r.attributionYear.trim() : "";
    const attribution = [name, year].filter(Boolean).join(", ");
    lines.push(attribution ? `"${body}" — ${attribution}` : `"${body}"`);
  }
  const pastedTrimmed = pasted.trim();
  if (pastedTrimmed) lines.push(pastedTrimmed);
  return lines.join("\n").slice(0, MAX_REVIEW_CHARS);
}

export async function POST(req: Request): Promise<NextResponse<ApiOk | ApiErr>> {
  // 0) Feature flag — killable in prod without a redeploy (parity with
  //    COMP_IMPORT_ENABLED on /api/comp-import). Test-only override: in
  //    non-production, `X-Review-Draft-Test-Disable: 1` simulates
  //    REVIEW_DRAFT_ENABLED=false for a single request so the flag-off spec
  //    needn't restart the dev server. Production ignores the header.
  const testForceDisabled =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-review-draft-test-disable") === "1";
  if (process.env.REVIEW_DRAFT_ENABLED !== "true" || testForceDisabled) {
    return NextResponse.json(
      {
        ok: false,
        code: "feature-disabled",
        message:
          "Drafting from reviews isn't enabled. You can still write your bio, tagline, and headline by hand.",
      } satisfies ApiErr,
      { status: 503 },
    );
  }

  // 1) Auth — same pattern as comp-import. E2E bypass (non-prod only) lets
  //    Playwright reach the route without a session; loadAgentProfile gets
  //    null so KV is never touched, and ?testTier= chooses a tier.
  const e2eBypass =
    process.env.NODE_ENV !== "production" && process.env.E2E_TESTING === "1";
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email && !e2eBypass) {
    return NextResponse.json(
      {
        ok: false,
        code: "not-authenticated",
        message: "Please sign in to draft from your reviews.",
      } satisfies ApiErr,
      { status: 401 },
    );
  }
  const kvKeyEmail = email ?? "e2e-anonymous@example.test";

  // 2) Tier gate — resolve aiAccess via the same path as comp-import.
  const url = new URL(req.url);
  const testTier = url.searchParams.get("testTier");
  const agentProfile = await loadAgentProfile(email || null, { testTier });
  const ent = resolveEntitlements(agentProfile);
  const resolved = resolveSkill(SELLER_PRESENTATION_SKILL, ent);
  if (resolved.aiAccess.state !== "available") {
    return NextResponse.json(
      {
        ok: false,
        code: "upgrade-required",
        message:
          "Upgrade to Pro to draft from your reviews. You can also write these yourself.",
      } satisfies ApiErr,
      { status: 403 },
    );
  }

  // 3) Rate limit — 10/hr/email. Test-only header forces the 429 so the calm
  //    copy is e2e-asserted without a live KV that can be exhausted.
  const testForceRateLimit =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-review-draft-test-force-rate-limit") === "1";
  if (testForceRateLimit) {
    return NextResponse.json(
      {
        ok: false,
        code: "rate-limited",
        message: "Too many drafts — try again in a moment.",
      } satisfies ApiErr,
      { status: 429 },
    );
  }
  try {
    const rlKey = `rate_limit_review_draft:${kvKeyEmail}`;
    const count = (await kv.incr(rlKey)) as number;
    if (count === 1) await kv.expire(rlKey, RATE_LIMIT_WINDOW_SECONDS);
    if (count > RATE_LIMIT_MAX_PER_HOUR) {
      return NextResponse.json(
        {
          ok: false,
          code: "rate-limited",
          message: "Too many drafts — try again in a moment.",
        } satisfies ApiErr,
        { status: 429 },
      );
    }
  } catch (err) {
    if (!e2eBypass) console.warn("[review-draft] rate-limit KV unavailable:", err);
  }

  // 4) Daily cap — ai_review_draft_count:<email>:<YYYY-MM-DD>, per access mode.
  const dailyCap = dailyReviewDraftCap(ent.accessMode);
  const testForceDailyCap =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-review-draft-test-force-daily-cap") === "1";
  if (testForceDailyCap) {
    return NextResponse.json(
      {
        ok: false,
        code: "daily-cap-hit",
        message:
          "You've hit today's draft limit. Write these yourself or try again tomorrow.",
      } satisfies ApiErr,
      { status: 429 },
    );
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const capKey = `ai_review_draft_count:${kvKeyEmail}:${today}`;
    const used = (await kv.incr(capKey)) as number;
    if (used === 1) await kv.expire(capKey, 2 * 24 * 3600);
    if (used > dailyCap) {
      return NextResponse.json(
        {
          ok: false,
          code: "daily-cap-hit",
          message:
            "You've hit today's draft limit. Write these yourself or try again tomorrow.",
        } satisfies ApiErr,
        { status: 429 },
      );
    }
  } catch (err) {
    if (!e2eBypass) console.warn("[review-draft] daily-cap KV unavailable:", err);
  }

  // 5) Read the body — JSON { reviews: Review[], pastedReviews?: string }.
  let body: { reviews?: unknown; pastedReviews?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "no-reviews",
        message: "Add or paste a review or two first, then try drafting.",
      } satisfies ApiErr,
      { status: 400 },
    );
  }
  const reviews = Array.isArray(body.reviews) ? (body.reviews as ReviewInput[]) : [];
  const pasted = typeof body.pastedReviews === "string" ? body.pastedReviews : "";
  const reviewsText = buildReviewsText(reviews, pasted);
  if (!reviewsText.trim()) {
    return NextResponse.json(
      {
        ok: false,
        code: "no-reviews",
        message: "Add or paste a review or two first, then try drafting.",
      } satisfies ApiErr,
      { status: 400 },
    );
  }

  // 6) Cache on the review-text hash (PROMPT_VERSION folded into the key).
  //    The raw text is hashed then dropped — only the SUGGESTIONS are cached.
  const hash = createHash("sha256").update(reviewsText).digest("hex");
  const cacheKey = buildReviewDraftCacheKey(hash);

  let suggestions: ReviewDraftSuggestions | null = null;
  let cacheHit = false;
  try {
    const cached = (await kv.get(cacheKey)) as ReviewDraftSuggestions | null;
    if (cached) {
      suggestions = cached;
      cacheHit = true;
    }
  } catch (err) {
    if (!e2eBypass) console.warn("[review-draft] cache read failed:", err);
  }

  let aiSource: "live" | "fixture" | "cache" = "cache";
  let aiLatencyMs = 0;
  let aiRetried = false;

  if (!suggestions) {
    try {
      const ai = await draftFromReviewsWithAI(reviewsText);
      suggestions = ai.suggestions;
      aiSource = ai.source;
      aiLatencyMs = ai.latencyMs;
      aiRetried = ai.retried;
      try {
        await kv.set(cacheKey, suggestions, { ex: CACHE_TTL_SECONDS });
      } catch (err) {
        if (!e2eBypass) console.warn("[review-draft] cache write failed:", err);
      }
    } catch (err) {
      console.error("[review-draft] AI draft failure", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (err instanceof MissingAnthropicKeyError) {
        return NextResponse.json(
          {
            ok: false,
            code: "ai-unavailable",
            message:
              "Couldn't draft just now — you can write these yourself or try again.",
          } satisfies ApiErr,
          { status: 503 },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          code: "ai-unavailable",
          message:
            "Couldn't draft just now — you can write these yourself or try again.",
        } satisfies ApiErr,
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      suggestions,
      cacheHit,
      ai: { source: aiSource, latencyMs: aiLatencyMs, retried: aiRetried },
    } satisfies ApiOk,
    { status: 200 },
  );
}
