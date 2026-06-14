/**
 * Seller State A · Zone 5 — the SELLER_LISTINGS_COVERFLOW_ENABLED kill switch.
 *
 * OFF by default. Gates ONLY the new "recent listings" coverflow block beneath
 * the capability cards (the exposure section). When false, the publish projector
 * emits no `recentListings` key, so CampaignSpread renders exactly as today
 * (capability cards only) and every flag-off publish is byte-identical. The
 * coverflow itself is data-driven: even with the flag ON, a publish with no
 * `recentListings` data renders byte-identical too — the block flexes out.
 *
 * Merges DARK: the flag stays OFF until the agent-facing Settings "recent
 * listings" INPUT ships (the deferred next slice). Until then there is no real
 * data source, so the feature cannot go live to agents; the consumer render +
 * payload plumbing + fixtures land now so it is verifiable on the preview.
 *
 * Reads the env var lazily (per call) so a test / route can flip it without a
 * module-load race — the same shape as `isSellerStateAEnabled` / `isCompPhotosEnabled`.
 */
export function isSellerListingsCoverflowEnabled(): boolean {
  return process.env.SELLER_LISTINGS_COVERFLOW_ENABLED === "true";
}
