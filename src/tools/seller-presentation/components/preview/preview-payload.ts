/**
 * Wizard live-preview payload helpers (capstone).
 *
 * The wizard side panel renders the REAL flagship page from the agent's
 * in-progress draft — client-side, the SAME way a publish would, so the
 * preview never drifts from what the seller actually receives. These helpers
 * are the single source of truth for three things:
 *
 *   1. `brandToPublishInputs` — turn BrandSettings into the exact
 *      {agentContact, brandReviews, brandColors} the publish path forwards to
 *      `toPublicPayload`. StepReview (the real publish) and the preview both
 *      call this, so there is ONE construction, never two that can skew.
 *   2. `isDraftSparse` — the smallest honest signal that a draft has nothing
 *      worth previewing (no address AND no comp AND no recommended price).
 *   3. `samplePayload` / `draftPreviewPayload` — the payload the panel renders,
 *      sample (the shared fixture, in the agent's brand color) or real.
 *
 * Pure + client-safe: `toPublicPayload` / `clampDraft` import no server-only
 * modules, so this runs in the wizard's client tree with no round-trip.
 */

import type { BrandSettings } from "@/lib/brand";
import {
  clampDraft,
  type SellerPresentationDraft,
} from "../../engine/types";
import { isPriceRangeActive } from "../../engine/price-range";
import {
  toPublicPayload,
  type PublicPayload,
} from "../../output/public-payload";
import { FULL_PAYLOAD } from "../../output/__fixtures__/sample-payload";

/**
 * The three publish-input objects, built from BrandSettings exactly as
 * StepReview does before POSTing to /api/seller-presentation/publish. Kept here
 * so the preview and the real publish share one construction (zero drift).
 */
export function brandToPublishInputs(brand: BrandSettings) {
  const agentContact = {
    name: brand.agentName || "",
    brokerage: brand.brokerage || "",
    phone: brand.contactPhone || "",
    email: brand.contactEmail || "",
    licenseNumber: brand.licenseNumber || "",
    areasServed: brand.agentAreasServed,
    photoUrl: brand.agentPhotoUrl,
    // UX-2b — the repositionable-headshot display transform travels with the
    // photo URL on the same agentContact path (StepReview + PrelistingPublish
    // both POST this), so the seller page and /why apply the agent's focal
    // point identically. Unset → undefined → centered (byte-identical).
    photoFocalX: brand.agentHeadshotFocalX,
    photoFocalY: brand.agentHeadshotFocalY,
    photoScale: brand.agentHeadshotScale,
    bioShort: brand.agentBioShort,
    yearsInArea: brand.agentYearsInArea,
    ctaReassurance: brand.agentCtaReassurance,
  };
  const brandReviews = {
    reviews: brand.agentReviews,
    reviewsOutlinkUrl: brand.reviewsOutlinkUrl,
  };
  const brandColors = {
    brandBackground: brand.brandBackground,
    brandText: brand.brandText,
    brandAccent: brand.brandAccent,
    brandSecondary: brand.brandSecondary,
  };
  // B0b — the agent-constant "Why us" marketing layer + tagline + reviews
  // headline. Same provenance/path as the others; the projector clamps it.
  const brandWhyUs = {
    whyUs: brand.whyUs,
    agentTagline: brand.agentTagline,
    reviewsHeadline: brand.reviewsHeadline,
  };
  return { agentContact, brandReviews, brandColors, brandWhyUs };
}

/**
 * "Sparse" = nothing worth previewing yet. The smallest honest signal: no
 * property address AND no comp with any content AND no recommended price. The
 * moment any of those lands, the panel swaps from the sample to the real draft.
 */
export function isDraftSparse(draft: SellerPresentationDraft): boolean {
  const hasAddress = !!draft.propertyAddress?.trim();
  const hasComp =
    Array.isArray(draft.comps) &&
    draft.comps.some(
      (c) => !!c?.address?.trim() || !!c?.soldPrice?.trim(),
    );
  const hasPrice =
    !!draft.recommendedPrice?.trim() ||
    isPriceRangeActive(draft.recommendedPriceLow, draft.recommendedPriceHigh);
  return !hasAddress && !hasComp && !hasPrice;
}

/**
 * The fully-filled sample (the SAME fixture the brand-kit preview uses), in the
 * agent's brand color. No brandAccent set → `brandColors` is omitted and the
 * flagship derives its blue default (#037290, F3) — NEVER a terracotta sample.
 */
export function samplePayload(brand: BrandSettings): PublicPayload {
  const accent = brand.brandAccent;
  return {
    ...FULL_PAYLOAD,
    brandColors: accent ? { accent } : undefined,
  } as PublicPayload;
}

/**
 * The agent's real draft as a public payload — built through the SAME
 * `clampDraft` → `toPublicPayload` pipeline the publish route runs, so the
 * preview is byte-for-byte what the seller will see.
 */
export function draftPreviewPayload(
  draft: SellerPresentationDraft,
  brand: BrandSettings,
  // COMP_PHOTOS — mirror the publish-time flag so the live preview shows comp
  // photos exactly when the published page would. Defaults false so existing
  // callers (and a flag-off session) render byte-identically to today.
  compPhotos: boolean = false,
): PublicPayload {
  const { agentContact, brandReviews, brandColors, brandWhyUs } =
    brandToPublishInputs(brand);
  const payload = toPublicPayload(
    clampDraft(draft),
    agentContact,
    brandReviews,
    brandColors,
    // whiteLabel: the live preview never suppresses the wordmark (the agent's
    // entitlement isn't resolved client-side here) — default false, same as
    // every preview render today.
    false,
    brandWhyUs,
    compPhotos,
  );

  // Honest preview: the By-the-numbers band looks good, so Dallen wants it to
  // STAY visible in the live preview even before the agent fills their track
  // record. When the agent's own stats are empty (the band would otherwise
  // flex out), drop in the SAMPLE figures behind a "Sample" tag so the band
  // reads as an example, never as the agent's real data. PREVIEW-ONLY: the
  // publish path builds its payload through `toPublicPayload` directly (never
  // this helper), so an empty track record still hides the band on the real
  // published page — only the live preview substitutes the sample.
  const hasOwnStats = (payload.whyUs?.performanceStats?.length ?? 0) > 0;
  if (hasOwnStats) return payload;

  const sampleStats = FULL_PAYLOAD.whyUs?.performanceStats ?? [];
  if (sampleStats.length === 0) return payload;

  return {
    ...payload,
    whyUs: {
      differentiators: payload.whyUs?.differentiators ?? [],
      marketingApproach: payload.whyUs?.marketingApproach ?? [],
      howWeWork: payload.whyUs?.howWeWork ?? [],
      ...payload.whyUs,
      performanceStats: sampleStats,
    },
    whyUsStatsSample: true,
  };
}
