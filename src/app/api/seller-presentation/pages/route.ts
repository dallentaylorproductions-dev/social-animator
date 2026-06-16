import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listOwnerHandoutRecords } from "@/lib/share-urls";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements } from "@/lib/entitlements/resolver";
import { maxLivePagesCap } from "@/lib/entitlements/usage-caps";
import {
  countLivePages,
  projectHandoutSummary,
  SELLER_PRESENTATION_HANDOUT_TYPE,
  type ServerPageSummary,
} from "@/lib/seller-presentation/pages-library";
import {
  isViewedSignalEnabled,
  isViewedSignalEngagementEnabled,
} from "@/lib/seller-presentation/viewed-signal";
import { deriveViewSignal, getViews } from "@/lib/seller-presentation/views-store";

/**
 * GET /api/seller-presentation/pages (SP-LIB).
 *
 * The privacy spine of the "Your pages" library: returns the
 * authenticated agent's published seller pages, scoped server-side by
 * the owner index (`listOwnerHandoutRecords` only reads THIS agent's
 * slugs and re-checks ownerEmail on each record). A second account can
 * never see another's pages — the list is derived from the session
 * email, never from a client-supplied identity.
 *
 * Includes ARCHIVED pages (the agent needs them in the library to
 * Restore) but EXCLUDES revoked ones (a harder take-down). Each record
 * is projected to a card summary via `projectHandoutSummary`, which
 * reads only the public payload — no private draft field is in KV to
 * leak in the first place.
 *
 * Also returns the live-page cap + current live count for the usage
 * meter + soft at-limit banner. The cap is SHOWN, not enforced (pre-
 * billing); this route does not block anything.
 *
 * Flag-gated: 503 when SELLER_PAGES_LIBRARY_ENABLED !== 'true', so the
 * endpoint is inert until the library ships.
 *
 * Response: { ok, pages: ServerPageSummary[], liveCount, cap }
 *         | { ok: false, code: 'feature-disabled' | ..., error }
 */
export const runtime = "nodejs";

export async function GET() {
  if (process.env.SELLER_PAGES_LIBRARY_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, code: "feature-disabled", error: "Library is not enabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const records = await listOwnerHandoutRecords(email);
    const base: ServerPageSummary[] = records
      .filter(
        (r) => r.type === SELLER_PRESENTATION_HANDOUT_TYPE && !r.revoked,
      )
      .map(projectHandoutSummary);

    // Viewed signal (Phase 1): enrich each owner-scoped summary with its
    // `views:<slug>` record ONLY when the flag is on. Reads are batched
    // (like listOwnerHandoutRecords) and an un-opened page is returned
    // unchanged, so a flag-off response is byte-identical to today.
    // Phase 2 (engagement) is independently gated: the concrete depth facts are
    // attached ONLY when VIEWED_SIGNAL_ENGAGEMENT_ENABLED is on, so a Phase-1-only
    // response carries the status + N views exactly as before.
    const engagementOn = isViewedSignalEngagementEnabled();
    const pages: ServerPageSummary[] = isViewedSignalEnabled()
      ? await Promise.all(
          base.map(async (page) => {
            const signal = deriveViewSignal(await getViews(page.slug));
            if (!signal.opened) return page;
            return {
              ...page,
              viewCount: signal.count,
              lastViewedAt: signal.lastViewedAt,
              returnedAfterReveal: signal.returnedAfterReveal,
              ...(engagementOn
                ? {
                    watchedVideo: signal.watchedVideo,
                    readToEnd: signal.readToEnd,
                    lingered: signal.lingered,
                  }
                : {}),
            };
          }),
        )
      : base;

    const ent = resolveEntitlements(await loadAgentProfile(email));
    const cap = maxLivePagesCap(ent.accessMode);
    const liveCount = countLivePages(pages);

    return NextResponse.json(
      { ok: true, pages, liveCount, cap },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pages";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
