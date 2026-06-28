import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchHandout } from "@/lib/share-urls";
import {
  isViewedSignalEnabled,
  isViewedSignalEngagementEnabled,
  isViewedSignalOwnerExcludeEnabled,
} from "@/lib/seller-presentation/viewed-signal";
import {
  isBotUserAgent,
  isOwnerSelfView,
  recordEngagement,
  recordView,
} from "@/lib/seller-presentation/views-store";
import { isPreparedNextEnabled } from "@/lib/seller-presentation/prepared-next/flag";
import { viewedSignalMoment } from "@/lib/seller-presentation/prepared-next/moment";
import { ensureEligibleWorkOrder } from "@/lib/seller-presentation/prepared-next/work-order";

/**
 * POST /api/h/[slug]/view (viewed signal, Phase 1).
 *
 * The cheap, agent-only capture endpoint: the seller's published page fires one
 * fire-and-forget beacon per session (PresentationPageMotion island) on open,
 * and this appends to the page's `views:<slug>` record. It reads the page's
 * `revealedAt` to classify the open as before / after the reveal, then records.
 *
 * It is INERT and INVISIBLE to the seller:
 *   - returns 204 with no body in every case, so a probe learns nothing,
 *   - never affects the page render (the beacon is non-blocking and ignores
 *     this response),
 *   - flag-off (VIEWED_SIGNAL_ENABLED !== 'true') no-ops without a KV touch.
 *
 * Honest counts, cheaply:
 *   - per-session de-dupe is enforced in `recordView` (an in-session refresh
 *     writes nothing),
 *   - a bot / link-unfurl user-agent is dropped here as a backstop to the
 *     JS-beacon (non-JS crawlers never run the island in the first place),
 *   - a missing / revoked / archived / expired page (fetchHandout -> null)
 *     records nothing.
 *
 * Two beacon shapes hit this ONE route, distinguished by the body:
 *   - `{ sid }`                       -> OPEN beacon (Phase 1), on mount. Owns
 *                                        the count via `recordView`.
 *   - `{ sid, engagement: {...} }`    -> ENGAGEMENT summary (Phase 2), one per
 *                                        session on pagehide. Folds depth into
 *                                        the SAME session via `recordEngagement`;
 *                                        never creates a view. Honored ONLY when
 *                                        VIEWED_SIGNAL_ENGAGEMENT_ENABLED is on,
 *                                        so flag-off it is ignored (and the
 *                                        seller page never sends it anyway).
 *
 * No auth (the seller is anonymous) and no PII: only an opaque session id +
 * timestamps + coarse engagement flags reach KV. The signal is read back solely
 * through the auth-gated, owner-scoped pages route - never onto the seller's page.
 */
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** One shared 204 - no body, never cached, identical for every outcome. */
function noContent(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request, { params }: RouteContext) {
  // Flag-off: dark. No KV touch, byte-identical to today.
  if (!isViewedSignalEnabled()) return noContent();

  // Bot / link-unfurl backstop. A real mobile browser UA never matches; an
  // absent UA is treated as a bot.
  if (isBotUserAgent(req.headers.get("user-agent"))) return noContent();

  const { slug } = await params;
  if (!slug) return noContent();

  // Opaque per-session token + optional engagement summary from the beacon
  // body. Absent / malformed bodies drop to an empty sid, which the recorders
  // then ignore.
  let sid = "";
  let engagement:
    | { videoPlayed?: boolean; reachedEnd?: boolean; dwellMs?: unknown }
    | undefined;
  try {
    const body = (await req.json()) as {
      sid?: unknown;
      engagement?: unknown;
    };
    if (body && typeof body.sid === "string") sid = body.sid;
    if (
      body &&
      body.engagement &&
      typeof body.engagement === "object" &&
      !Array.isArray(body.engagement)
    ) {
      const e = body.engagement as Record<string, unknown>;
      engagement = {
        videoPlayed: e.videoPlayed === true,
        reachedEnd: e.reachedEnd === true,
        dwellMs: e.dwellMs,
      };
    }
  } catch {
    // Non-JSON / empty body - nothing to record.
  }
  if (!sid.trim()) return noContent();

  // Read the page to (a) confirm it is live and (b) get its reveal stamp for
  // the before/after-reveal classification. A dead page records nothing.
  const record = await fetchHandout(slug);
  if (!record) return noContent();

  // Owner self-view exclusion (Phase 1 correctness, default-on). The beacon
  // is same-origin, so sendBeacon/fetch carries the signed-in agent's session
  // cookie: when the OWNER opens their own published page we recognize the
  // session and record NOTHING — their own preview must never read as seller
  // engagement (it would pollute the "real seller engaged" follow-up signal).
  // An anonymous seller has no session, so `auth()` returns null and a real
  // (non-owner) view still counts. Rollback: VIEWED_SIGNAL_OWNER_EXCLUDE=false.
  if (isViewedSignalOwnerExcludeEnabled()) {
    const session = await auth();
    if (isOwnerSelfView(session?.user?.email, record.ownerEmail)) {
      return noContent();
    }
  }

  try {
    if (engagement && isViewedSignalEngagementEnabled()) {
      // Phase 2 engagement summary: fold this session's depth into its existing
      // entry. Never creates a view (the open beacon owns the count). When the
      // engagement flag is off we fall through to the open path below so the
      // Phase 1 count is still honored even if a stray summary arrives.
      await recordEngagement({
        slug,
        sid,
        videoPlayed: engagement.videoPlayed,
        reachedEnd: engagement.reachedEnd,
        dwellMs: engagement.dwellMs,
      });
    } else {
      await recordView({ slug, sid, revealedAt: record.revealedAt });
    }
  } catch {
    // Best-effort: a transient KV hiccup must never surface to the seller.
  }

  // PREPARED_NEXT (Anticipation v0) — create the `eligible` Work Order for this
  // qualifying external view (owner + bots already excluded above), idempotently
  // (SET NX, one WO per page + content version). NO generation here — that waits
  // for the agent's explicit "Prepare follow-up" click in the cockpit. Flag-off:
  // skipped entirely, so the seller path is byte-identical (no `prepared:<slug>`
  // write). Best-effort: a transient KV hiccup never surfaces to the seller.
  if (isPreparedNextEnabled()) {
    try {
      await ensureEligibleWorkOrder({
        moment: viewedSignalMoment({
          slug,
          ownerEmail: record.ownerEmail,
          handoutUpdatedAt: record.updatedAt ?? "initial",
          timestamp: new Date().toISOString(),
        }),
        accountId: record.ownerEmail,
        version: record.updatedAt ?? "initial",
      });
    } catch {
      // Inert on failure — the eligible WO is a convenience, not the seller path.
    }
  }

  return noContent();
}
