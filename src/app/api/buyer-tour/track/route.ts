import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isBuyerTourAnalyticsEnabled } from "@/lib/config/buyer-tour-analytics";
import {
  fetchHandout,
  getHandoutRecord,
} from "@/lib/share-urls";
import { BUYER_TOUR_HANDOUT_TYPE } from "@/tools/buyer-tour-brief/output/public-payload";
import {
  readTourEngagement,
  recordTourEngagement,
} from "@/lib/buyer-tour-brief/engagement-store";
import {
  summarizeEngagement,
  validateTrackPayload,
  type EngagementSummary,
} from "@/tools/buyer-tour-brief/engine/engagement";

/**
 * Buyer Tour Brief — first-party engagement endpoint (BUYER_TOUR_ANALYTICS).
 *
 * POST  → record ONE anonymous funnel event, fired fire-and-forget from the public
 *         `/tour/[slug]` page via sendBeacon/keepalive. NO auth (it's the buyer's
 *         public page), NO PII: the pure `validateTrackPayload` allow-list rejects any
 *         unknown field, malformed slug, or bad event name. Writes to our own KV
 *         aggregate (counters + last-seen), capped per tour. Always returns a tiny
 *         no-content-shaped response fast; never blocks, never 500s into the page.
 *
 * GET    → the agent readout. Owner-AUTHENTICATED per-tour summary (calm, factual).
 *         Only the tour's owner can read its engagement; anyone else gets 403/404.
 *
 * FLAG: when BUYER_TOUR_ANALYTICS is OFF, both verbs return feature-disabled with no
 * KV touch and no auth read — byte-identical to "this endpoint does nothing."
 *
 * PRIVACY: no IP, no user agent, no fingerprint is ever read or persisted. If the
 * platform attaches an IP at the edge, we never touch it. The tour is 1:1 with a known
 * buyer, so the anonymous per-tour aggregate IS that buyer — no per-user identity is
 * needed or wanted.
 */

export const runtime = "nodejs";
export const maxDuration = 10;

/** feature-disabled — a quiet 204 (no body). Flag-off callers must observe nothing. */
function disabled(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request): Promise<NextResponse> {
  // Flag gate FIRST — no auth read, no KV touch when analytics is dark.
  if (!isBuyerTourAnalyticsEnabled()) return disabled();

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    // A malformed/empty body is just a dropped beacon — never an error into the page.
    return NextResponse.json({ ok: false, reason: "bad-body" }, { status: 400 });
  }

  const result = validateTrackPayload(raw);
  if (!result.ok) {
    // Reject unknown event names / malformed payloads / stray (PII) fields.
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 400 },
    );
  }

  // Abuse guard: only record engagement for a tour that actually exists and is live
  // (a valid, non-revoked/non-expired buyer-tour handout). This bounds distinct-key
  // creation to real tours. Resilient: any lookup failure just drops the event.
  try {
    const record = await fetchHandout(result.payload.tourSlug);
    if (!record || record.type !== BUYER_TOUR_HANDOUT_TYPE) {
      // Unknown/invalid tour — accept the request shape but store nothing.
      return new NextResponse(null, { status: 204 });
    }
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  // Fire-and-forget: record best-effort, then return a fast no-content response. Even
  // on a KV hiccup the client sees success — tracking must never degrade the page.
  await recordTourEngagement(result.payload, new Date().toISOString());
  return new NextResponse(null, { status: 204 });
}

interface ReadoutOk {
  ok: true;
  summary: EngagementSummary;
}
interface ReadoutErr {
  ok: false;
  code: "feature-disabled" | "not-authenticated" | "not-found" | "forbidden";
}

export async function GET(
  req: Request,
): Promise<NextResponse<ReadoutOk | ReadoutErr>> {
  if (!isBuyerTourAnalyticsEnabled()) {
    return NextResponse.json(
      { ok: false, code: "feature-disabled" } satisfies ReadoutErr,
      { status: 503 },
    );
  }

  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json(
      { ok: false, code: "not-authenticated" } satisfies ReadoutErr,
      { status: 401 },
    );
  }

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  // Read the RAW record (owner check) — a revoked/archived tour still shows its owner
  // their engagement, so use getHandoutRecord, not the visitor-facing fetchHandout.
  const record = await getHandoutRecord(slug);
  if (!record || record.type !== BUYER_TOUR_HANDOUT_TYPE) {
    return NextResponse.json(
      { ok: false, code: "not-found" } satisfies ReadoutErr,
      { status: 404 },
    );
  }
  if (record.ownerEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { ok: false, code: "forbidden" } satisfies ReadoutErr,
      { status: 403 },
    );
  }

  const engagement = await readTourEngagement(slug);
  const summary = summarizeEngagement(engagement);
  return NextResponse.json(
    { ok: true, summary } satisfies ReadoutOk,
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
