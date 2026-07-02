/**
 * BUYER_TOUR_ANALYTICS — first-party, privacy-safe engagement instrumentation for
 * the LIVE Buyer Tour Brief consumer page (`/tour/[slug]`). OFF by default; ships
 * DARK so it can be verified on preview before a deliberate prod flip, WITHOUT
 * disturbing the live buyer page.
 *
 * When OFF (today's live behavior, byte-identical):
 *   • The consumer page renders EXACTLY as today. No `EngagementTracker` island is
 *     mounted, so NO events fire — no `sendBeacon`, no `fetch`, no listeners, no
 *     observers. The `trackEngagement` client singleton is never initialized, so
 *     every call is an immediate no-op.
 *   • `POST /api/buyer-tour/track` returns `feature-disabled` (204/disabled) with no
 *     KV touch, and the agent readout in `/buyer-tour` is not shown.
 *   • This flag adds ZERO markup to any page in either state (the tracker renders
 *     null; instrumentation attaches only behavior), so flag-off HTML is byte-
 *     identical to today and flag-on HTML is byte-identical to flag-off.
 *
 * When ON: the funnel events fire (fire-and-forget, deduped once-per-load) from the
 * buyer page to our own KV store, and the agent sees a calm per-tour readout.
 *
 * Read SERVER-SIDE only (mirrors isBuyerTourBriefEnabled / isBuyerTourBriefV1Enabled /
 * isGreatSchoolsEnabled), so the flag can be true on preview and false on prod
 * independently — no NEXT_PUBLIC inline, no per-environment rebuild. The resolved
 * boolean is passed down as a prop; the client never reads the env var itself.
 *
 * This is a SEPARATE flag from BUYER_TOUR_BRIEF / BUYER_TOUR_BRIEF_V1 /
 * GREATSCHOOLS_ENABLED and does not touch them: analytics can be flipped on or off
 * independently of which page arrangement or school section is live.
 */
export function isBuyerTourAnalyticsEnabled(): boolean {
  return process.env.BUYER_TOUR_ANALYTICS === "true";
}
