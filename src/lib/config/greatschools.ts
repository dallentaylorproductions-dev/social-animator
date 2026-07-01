/**
 * GREATSCHOOLS_ENABLED — the Buyer Tour Brief V1 school-section dependency flag.
 * OFF by default. This is a discovery SPIKE (branch `spike/greatschools`): the
 * server-only GreatSchools module + normalizer + tests land behind this flag so
 * the real response shape and the fetch-only posture are proven, but NOTHING is
 * wired into any surface.
 *
 * When OFF (today's behavior, byte-identical):
 *   • No consumer UI, no school section on /tour/[slug], no call to the module
 *     from any render or route. The module is compiled-but-unreached.
 *   • BUYER_TOUR_BRIEF, the proximity pipeline, the serializer, and the public
 *     page are untouched.
 *
 * When ON (a LATER build packet, not this spike): the public /tour/[slug] server
 * component may call `nearbySchools()` LIVE at render time for a home's already-
 * geocoded coordinates and render a separated, attributed school section. Even
 * then, per GreatSchools ToS 3.2.2 / 3.2.8 / 8.6, the returned data is used for
 * the duration of that render only and NEVER persisted (not in the draft, not in
 * KV, not in the published payload, not in any cache).
 *
 * Read SERVER-SIDE only (mirroring isBuyerTourBriefEnabled), so it can be true on
 * preview and false on prod independently — no NEXT_PUBLIC inline, no rebuild.
 */
export function isGreatSchoolsEnabled(): boolean {
  return process.env.GREATSCHOOLS_ENABLED === "true";
}
