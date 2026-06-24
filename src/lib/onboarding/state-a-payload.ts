/**
 * Onboarding first-run V2 (ONBOARDING_FIRST_RUN_V2) — build the live State A
 * PublicPayload the 9-beat flow reveals one section at a time.
 *
 * This runs the agent's in-progress draft + their BrandSettings through the
 * SAME `clampDraft → toPublicPayload` projection the publish route runs, so each
 * revealed slice is byte-for-byte what the seller will receive — never a mock.
 * It reuses `brandToPublishInputs` (the single construction StepReview + the
 * wizard live-preview share) so the agent block, reviews, colors, and the State
 * A capability assets all project identically to a real publish.
 *
 * Deliberately NOT `draftPreviewPayload`: that helper substitutes SAMPLE
 * (tagged) track-record figures so the wizard's By-the-numbers band never looks
 * empty. The onboarding reveal is publish-looking, and the locked map requires
 * absence to GHOST (flex out), never to show example data on a real-looking
 * surface — so we call `toPublicPayload` directly and let unset sections flex
 * out honestly.
 *
 * Pure + client-safe (same as `preview-payload.ts`): no server-only imports, so
 * it runs in the flow's client tree with no round-trip.
 */

import type { BrandSettings } from "@/lib/brand";
import { brandToPublishInputs } from "@/tools/seller-presentation/components/preview/preview-payload";
import {
  toPublicPayload,
  withAccountEmailFallback,
  type PublicPayload,
} from "@/tools/seller-presentation/output/public-payload";
import {
  clampDraft,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";

export function buildOnboardingStateAPayload(
  draft: SellerPresentationDraft,
  brand: BrandSettings,
  // The authenticated agent's account email - folded in as the reach of last
  // resort (Q4) so the BEAT 7 ConfirmTime / AgentBand slices show a real way to
  // reach the agent before they type a direct line, matching what a live publish
  // carries. The agent's own brand email/phone still wins. Empty -> no fallback.
  accountEmail: string = "",
  // MARKETING_ZONE_REDESIGN (v1.7 Packet C) — mirror the publish-time flag so the
  // onboarding reveal + the "sample home, real you" mirror show the redesigned
  // marketing zone exactly when a flag-on publish would. Defaults false so every
  // existing caller (and a flag-off session) renders the current grid, byte-
  // identical. Resolved by the SERVER welcome shell and threaded down as a prop,
  // since this client builder can't read the non-NEXT_PUBLIC env flag itself.
  marketingZoneRedesign: boolean = false,
  // VALUATION_REDESIGN (v1.7 Packet B) — same provenance/channel as the marketing
  // flag above: resolved by the SERVER welcome shell and threaded down so the
  // onboarding reveal + "sample home, real you" mirror render the redesigned
  // valuation section (with its comp-derived range) exactly when a flag-on publish
  // would. Defaults false so every existing caller stays byte-identical.
  valuationRedesign: boolean = false,
): PublicPayload {
  const { agentContact, brandReviews, brandColors, brandWhyUs } =
    brandToPublishInputs(brand);
  return toPublicPayload(
    clampDraft(draft),
    withAccountEmailFallback(agentContact, accountEmail),
    brandReviews,
    brandColors,
    // whiteLabel: onboarding never resolves the entitlement client-side — match
    // every other client-side preview render (wordmark shows).
    false,
    brandWhyUs,
    // compPhotos: show the comp Street View thumbs in the prepared brief slice.
    true,
    // sellerStateA: resolve to the prepared-invitation render (the before-the-
    // appointment dossier), which is the whole onboarding premise.
    true,
    // listingsCoverflow: OFF here — buildSamplePreviewPayload injects the sample
    // recentListings post-projection (scoped to that onboarding-only builder), so
    // the publish-flag projection stays off and a real onboarding publish carries
    // no listings unless the agent has their own. Pass it positionally so the
    // redesign flag lands in the correct (10th) slot.
    false,
    marketingZoneRedesign,
    // VALUATION_REDESIGN — 11th positional slot.
    valuationRedesign,
  );
}
