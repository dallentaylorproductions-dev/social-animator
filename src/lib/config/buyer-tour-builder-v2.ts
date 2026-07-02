/**
 * BUYER_TOUR_BUILDER_V2 — the builder-friction upgrade of the AGENT-FACING builder
 * (`/buyer-tour`, the dark tool). OFF by default; ships DARK so it can be previewed
 * and walked before a deliberate flip, WITHOUT disturbing today's builder or the
 * LIVE buyer consumer page (`/tour/[slug]`, gated separately by BUYER_TOUR_BRIEF /
 * BUYER_TOUR_BRIEF_V1 / GREATSCHOOLS_ENABLED / BUYER_TOUR_ANALYTICS).
 *
 * When OFF (today's builder, byte-identical):
 *   • `/buyer-tour` renders the single-column manual-input `BuyerTourBuilder` exactly
 *     as today — no live preview, no tour list, no autosave, no auth gate beyond what
 *     the publish/enrich APIs already enforce, and the per-home "why it's on the list"
 *     stays hard-required at publish.
 *   • The middleware does NOT gate `/buyer-tour` (it early-returns before the identity
 *     redirect), so the route behaves exactly as it does today.
 *   • The publish route requires each home's `whyOnList` (unchanged).
 *
 * When ON (the improved builder):
 *   • `/buyer-tour` renders the `BuyerTourWorkspace`: a live side-by-side preview on
 *     desktop (the REAL `BuyerTourPage`, v0/V1 per the live buyer flags) + a full-
 *     screen "Preview" on mobile; autosave/resume of the in-progress draft; a "your
 *     buyer tours" list to reopen + re-publish; softened per-home "why" (encouraged,
 *     not required); and the flagship's price/sqft input formatters.
 *   • The route is auth-gated (identity only — no paywall; this is a dark tool).
 *   • The publish route drops the `whyOnList` requirement (address stays required).
 *
 * Read SERVER-SIDE only (mirrors isBuyerTourBriefEnabled and the other buyer-tour
 * flags), so it can be true on preview and false on prod independently — no
 * NEXT_PUBLIC inline, no per-environment rebuild. The resolved boolean is passed down
 * as a prop; client components never read the env var themselves. The one exception
 * is the middleware, which reads it directly (edge) to decide whether to gate the
 * route — a pure env read, no client bundle involved.
 *
 * This is a SEPARATE flag and does NOT touch the buyer-facing page or its flags.
 */
export function isBuyerTourBuilderV2Enabled(): boolean {
  return process.env.BUYER_TOUR_BUILDER_V2 === "true";
}
