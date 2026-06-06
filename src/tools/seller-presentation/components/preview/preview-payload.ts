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
  return { agentContact, brandReviews, brandColors };
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
  const hasPrice = !!draft.recommendedPrice?.trim();
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
): PublicPayload {
  const { agentContact, brandReviews, brandColors } = brandToPublishInputs(brand);
  return toPublicPayload(clampDraft(draft), agentContact, brandReviews, brandColors);
}
