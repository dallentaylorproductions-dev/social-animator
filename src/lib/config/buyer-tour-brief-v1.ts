/**
 * BUYER_TOUR_BRIEF_V1 — the "context hub" upgrade of the LIVE buyer consumer page
 * (`/tour/[slug]`). OFF by default; ships DARK so it can be previewed and walked
 * before a deliberate prod flip, WITHOUT disturbing the live v0 page.
 *
 * When OFF (today's live behavior, byte-identical):
 *   • The consumer page renders EXACTLY the v0 arrangement — no Quick Read, no full
 *     comparison card, numeric stops (1/2/3), v0 map interactions, no pin summary
 *     card, no per-home expanders. This flag gates RENDER ONLY.
 *
 * When ON: the same clamped payload renders the mock-2h context hub — Quick Read +
 * full comparison card as the spine after the map, A/B/C home identity, upgraded map
 * (tap-to-name markers, orientation label, pin summary card, no scroll-on-toggle),
 * per-home nearby expanders, and the refined after-tour teaser.
 *
 * RENDER-TIME read (mirrors isBuyerTourBriefEnabled / isGreatSchoolsEnabled): V1 is a
 * pure information-architecture upgrade DERIVED from the existing public payload — it
 * needs no new required stored data — so reading the flag at render time means every
 * already-published `/tour/[slug]` page renders correctly under either state (OFF →
 * v0, ON → v1) with nothing stamped at publish time. Flipping the flag never
 * retroactively breaks a published page. This matches the buyer page's existing
 * flag convention (BUYER_TOUR_BRIEF itself is render-time gated).
 *
 * The GreatSchools school section is a SEPARATE flag (GREATSCHOOLS_ENABLED) and is
 * untouched by this one.
 */
export function isBuyerTourBriefV1Enabled(): boolean {
  return process.env.BUYER_TOUR_BRIEF_V1 === "true";
}
