/**
 * Viewed signal (Phase 1) - the VIEWED_SIGNAL_ENABLED kill switch.
 *
 * OFF by default. When false the whole engagement layer is dark and every
 * surface is byte-identical to today:
 *   - the seller page fires NO view beacon (the motion island receives no slug),
 *   - the POST /api/h/[slug]/view route no-ops,
 *   - the publish route stamps NO `revealedAt`,
 *   - the pages route reads NO views, so the library chip / meta line is unchanged.
 *
 * A server-resolved env flag read lazily (per call) so a test or route can flip
 * it without a module-load race - the same shape as `isSellerStateAEnabled` in
 * state-a.ts and `isCompPhotosEnabled` in street-view.ts.
 *
 * Agent-only by construction: nothing in this layer is ever read back onto the
 * seller's page; the read path is the auth-gated, owner-scoped pages route.
 */
export function isViewedSignalEnabled(): boolean {
  return process.env.VIEWED_SIGNAL_ENABLED === "true";
}

/**
 * Viewed signal (Phase 2) - the VIEWED_SIGNAL_ENGAGEMENT_ENABLED kill switch.
 *
 * OFF by default, INDEPENDENT of Phase 1 so Cowork can verify engagement on
 * preview before it goes live. When false the engagement layer is dark and
 * every surface is exactly Phase 1:
 *   - the seller page fires NO engagement summary beacon (only the Phase 1 open
 *     beacon, when VIEWED_SIGNAL_ENABLED is on),
 *   - the POST /api/h/[slug]/view route ignores any engagement payload,
 *   - the pages route reads NO engagement, so the chip carries only the Phase 1
 *     status + N views (byte-identical to Phase 1).
 *
 * Engagement RIDES Phase 1: the summary beacon only fires when the page also
 * has a Phase 1 view slug (Phase 1 on), so this flag never does anything on its
 * own. Lazy per-call env read, same shape as `isViewedSignalEnabled`.
 */
export function isViewedSignalEngagementEnabled(): boolean {
  return process.env.VIEWED_SIGNAL_ENGAGEMENT_ENABLED === "true";
}

/**
 * The slug to hand the seller page's beacon island, or undefined when no beacon
 * should fire. Returns the slug only when the flag is on; the three seller render
 * arms (v1 / flagship / State A) all call this so the gate lives in ONE place and
 * a flag-off render passes `undefined` (byte-identical, no beacon).
 */
export function viewSignalSlugFor(handout: { slug: string }): string | undefined {
  return isViewedSignalEnabled() ? handout.slug : undefined;
}
