/**
 * Onboarding preview view-model (Onboarding redesign, Pass 2) - PURE.
 *
 * The cropped "magic moment" preview is its own small view-model, NOT the
 * published-page renderer. Both first-run paths produce one of these:
 *   - the SAMPLE path from a baked fixture (sample-listing.ts), so the wow is
 *     guaranteed and fully decoupled from live property lookup;
 *   - the REAL path from the agent's draft + a best-effort property prepare
 *     (which is often thin - no comps, no photo - and that is fine).
 *
 * The model carries explicit `has*` availability so the preview can ghost an
 * empty section as "prepared, awaiting your review" rather than faking it or
 * reading as broken. Absence is intentional, never an error. This mirrors the
 * cockpit's content rule: real content when it exists, a capability preview
 * when it does not, NEVER fabricated reviews / stats / video.
 *
 * Kept React-free so it is unit-testable without a browser (the same posture
 * the DASHBOARD_HOME_V2 today-state derivation uses - the e2e harness can't
 * flip a server flag mid-suite).
 */
import type { SellerPresentationDraft } from "@/tools/seller-presentation/engine/types";

export interface PreviewComp {
  addressLine: string;
  soldLine?: string;
  sqft?: string;
}

export interface PreviewModel {
  /** True for the curated sample; drives the persistent "Sample" marker. */
  isSample: boolean;
  /** Street line, e.g. "1742 Kenilworth Avenue". */
  addressLine: string;
  /** Composed "City, ST ZIP" when known. */
  cityLine?: string;
  heroPhotoUrl?: string;
  /** Recommended price range endpoints (strings, already formatted). */
  priceLow?: string;
  priceHigh?: string;
  subjectBeds?: string;
  subjectBaths?: string;
  subjectSqft?: string;
  comps: PreviewComp[];
  // Availability - the preview ghosts a missing section as "awaiting review".
  hasPhoto: boolean;
  hasPrice: boolean;
  hasComps: boolean;
  hasSubjectFacts: boolean;
}

/** Compose "City, ST ZIP" from the parts that exist; undefined if none. */
function composeCityLine(
  city?: string,
  state?: string,
  zip?: string,
): string | undefined {
  const left = city?.trim();
  const right = [state?.trim(), zip?.trim()].filter(Boolean).join(" ");
  if (left && right) return `${left}, ${right}`;
  return left || right || undefined;
}

/**
 * Property prepare result the REAL path threads in, best-effort. Shaped to the
 * existing /api/seller-presentation/autofill response WITHOUT importing it, so
 * this stays a pure model. Everything is optional - a thin / failed prepare
 * simply contributes nothing and the preview ghosts those sections.
 */
export interface PreparedProperty {
  beds?: string;
  baths?: string;
  sqft?: string;
  heroPhotoUrl?: string;
  priceLow?: string;
  priceHigh?: string;
  comps?: PreviewComp[];
}

/**
 * Build the preview from the agent's draft plus an optional best-effort
 * property prepare. The draft is authoritative for what the agent typed
 * (address); the prepare only fills gaps. Thin in, thin out - never throws.
 */
export function buildPreviewFromDraft(
  draft: SellerPresentationDraft,
  prepared?: PreparedProperty,
): PreviewModel {
  const heroPhotoUrl = draft.heroPhotoUrl || prepared?.heroPhotoUrl;
  const priceLow = draft.recommendedPriceLow || prepared?.priceLow;
  const priceHigh = draft.recommendedPriceHigh || prepared?.priceHigh;
  const subjectBeds = draft.subjectBedrooms || prepared?.beds;
  const subjectBaths = draft.subjectBaths || prepared?.baths;
  const subjectSqft = draft.subjectSqft || prepared?.sqft;
  const comps =
    (draft.comps?.length
      ? draft.comps.map((c) => ({
          addressLine: c.address ?? "",
          soldLine: c.soldPrice ? `Sold ${c.soldPrice}` : undefined,
          sqft: c.squareFeet,
        }))
      : prepared?.comps) ?? [];

  return {
    isSample: false,
    addressLine: draft.propertyAddress?.trim() || "Your listing",
    cityLine: composeCityLine(
      draft.propertyCity,
      draft.propertyState,
      draft.propertyZip,
    ),
    heroPhotoUrl,
    priceLow,
    priceHigh,
    subjectBeds,
    subjectBaths,
    subjectSqft,
    comps: comps.filter((c) => c.addressLine),
    hasPhoto: Boolean(heroPhotoUrl),
    hasPrice: Boolean(priceLow && priceHigh),
    hasComps: comps.filter((c) => c.addressLine).length > 0,
    hasSubjectFacts: Boolean(subjectBeds || subjectBaths || subjectSqft),
  };
}
