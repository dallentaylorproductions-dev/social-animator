/**
 * Seller State A · v1.7 Packet C — the MARKETING_ZONE_REDESIGN_ENABLED kill
 * switch for the "How I'll get your home seen" zone redesign.
 *
 * OFF by default. Gates ONLY the RENDER of the CampaignSpread `full` variant
 * (the State A invitation marketing zone): when on, the zone renders as the
 * locked three-part composition — a flat "THE WORK" swipe showcase, an editorial
 * "WHAT'S INCLUDED" capabilities list (substance inline, no accordion), and a
 * tinted lead-in into the existing exposure coverflow. When off, CampaignSpread
 * renders exactly as today (the capability-frames grid), so every flag-off
 * publish is byte-identical.
 *
 * Render-only: it reshuffles data already in the payload (the set-once capability
 * samples + `whyUs.marketingApproach` + `recentListings`). No new data source,
 * no new Settings field. The boolean is threaded into the public payload at
 * projection time (`toPublicPayload`) and survives the read-time clamp
 * (`clampPublicPayload`), so the pure CampaignSpread render can branch on it on
 * both the server publish and the client preview/onboarding surfaces.
 *
 * Reads the env var lazily (per call) so a test / route can flip it without a
 * module-load race — the same shape as `isSellerListingsCoverflowEnabled`.
 */
export function isMarketingZoneRedesignEnabled(): boolean {
  return process.env.MARKETING_ZONE_REDESIGN_ENABLED === "true";
}
