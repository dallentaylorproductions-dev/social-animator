import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import type { BrandSettings } from "@/lib/brand";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import { buildOnboardingStateAPayload } from "@/lib/onboarding/state-a-payload";

/**
 * The sample LISTING, in DRAFT form — the data source behind Path A's "sample
 * home, real you" preview (ONBOARDING_HYBRID_V3, Phase 4a).
 *
 * Why a draft (not the FULL_PAYLOAD fixture): the merge "sample listing + the
 * agent's REAL Agent Layer" is the publish pipeline `clampDraft → toPublicPayload`
 * (via {@link buildOnboardingStateAPayload}), which takes a DRAFT for the listing
 * and the real `brand` for the agent block / reviews / colors / marketing. The
 * `*_PAYLOAD` fixtures are already-projected PublicPayloads carrying the SAMPLE
 * agent (Marisol Reyes), so they can't supply "sample listing + real agent". This
 * draft carries ONLY the listing — the same representative North-Tacoma home as
 * `FULL_PAYLOAD` ("1742 Kenilworth Avenue", G5 "normal best") — and the pipeline
 * overlays the real agent, exactly as a real wizard publish would.
 *
 * Prepared-invitation (State A) status so the preview renders the before-the-
 * appointment dossier (no subject price), matching the onboarding premise. The
 * agent block, reviews, contact, and marketing all come from the real brand at
 * build time — nothing here asserts a seller name (`preparedFor` stays unset, so
 * the hero shows its neutral byline; a wrong name is worse than a ghost).
 *
 * No agent/review/why-us fields live here — those are the real Agent Layer.
 * No video: there is no committed sample video asset, and a non-loading player
 * reads worse than a clean flex-out, so StateAHello flexes out (calibration /
 * a sample video are deferred to the end-of-stack verify, per G5).
 */
export const SAMPLE_LISTING_DRAFT: SellerPresentationDraft = {
  ...EMPTY_DRAFT,
  // ---- Step 1: the subject property ----
  propertyAddress: "1742 Kenilworth Avenue",
  propertyCity: "Tacoma",
  propertyState: "WA",
  propertyZip: "98406",
  heroPhotoUrl: "/sample-assets/exterior.webp",
  subjectBedrooms: "4",
  subjectBaths: "2",
  subjectSqft: "2,480",
  subjectYearBuilt: "1924",

  // No SUBJECT price: the prepared-invitation (State A) render shows no subject
  // price by design, and the neighborhood-context range is derived from the COMP
  // sold prices below — so carrying a subject price here would be dead data.

  // ---- Step 2: the four nearby sales (with resolved Street View aiming data so
  // the Appointment Brief comp strip shows real photos — the same values the
  // FULL_PAYLOAD fixture carries, resolved via the live resolveCompCoverage path) ----
  comps: [
    {
      address: "4210 N 14th St",
      soldPrice: "$592,000",
      soldDate: "Sold February 19, 2026",
      squareFeet: "2,740",
      yearBuilt: 1951,
      hasStreetView: true,
      streetViewPanoId: "TYJpmYKWYPGef4qYTmb59Q",
      streetViewHeading: 177.49,
      houseLat: 47.262489,
      houseLng: -122.493832,
    },
    {
      address: "1705 N Anderson St",
      soldPrice: "$580,000",
      soldDate: "Sold March 6, 2026",
      squareFeet: "2,020",
      yearBuilt: 1919,
      hasStreetView: true,
      streetViewPanoId: "Y3d_jpXP8yw2FVY42ukQcA",
      streetViewHeading: 109.15,
      houseLat: 47.265223,
      houseLng: -122.472547,
    },
    {
      address: "1722 N Oakes St",
      soldPrice: "$605,000",
      soldDate: "Sold April 17, 2026",
      squareFeet: "2,010",
      yearBuilt: 1906,
      hasStreetView: true,
      streetViewPanoId: "hMujcWLJiJ_n5Pb55cBs1A",
      streetViewHeading: 266.46,
      houseLat: 47.265773,
      houseLng: -122.471965,
    },
    {
      address: "1008 N Steele St",
      soldPrice: "$700,000",
      soldDate: "Sold May 8, 2026",
      squareFeet: "2,715",
      yearBuilt: 1925,
      hasStreetView: true,
      streetViewPanoId: "cPSOW7yEdI4yQQtvg4-xyw",
      streetViewHeading: 259.72,
      houseLat: 47.258835,
      houseLng: -122.468442,
    },
  ],

  // ---- Neighborhood snapshot (the believable North-Tacoma 12-month climb) ----
  areaStats: {
    medianSale: "$648k",
    medianSaleDeltaYoy: "+6.2% vs prior year",
    daysOnMarket: "12",
    daysOnMarketZipAvg: "vs Tacoma avg 21",
    closings90d: "31",
    listToSaleRatio: "100%",
    monthlySeries: [
      { month: "Jul '25", medianPrice: "612000" },
      { month: "Aug '25", medianPrice: "618000" },
      { month: "Sep '25", medianPrice: "614000" },
      { month: "Oct '25", medianPrice: "623000" },
      { month: "Nov '25", medianPrice: "629000" },
      { month: "Dec '25", medianPrice: "626000" },
      { month: "Jan '26", medianPrice: "634000" },
      { month: "Feb '26", medianPrice: "641000" },
      { month: "Mar '26", medianPrice: "638000" },
      { month: "Apr '26", medianPrice: "649000" },
      { month: "May '26", medianPrice: "656000" },
      { month: "Jun '26", medianPrice: "662000" },
    ],
  },

  // ---- Seller State A: the prepared-invitation status + a sample appointment ----
  valuationStatus: "preparing_for_walkthrough",
  appointmentAt: "2026-07-15T14:00",
};

/**
 * The onboarding preview accent when the agent's brand accent is unset — the
 * studio cockpit mint. Mirrors the `STUDIO_MINT` substitution `StateASlice`
 * applies for the V2 onboarding reveal (and `--o2-accent` in welcome-v2.css), so
 * the Phase-4a preview harmonizes with the studio chrome instead of the brand
 * system's default flagship blue (#037290). A set brand accent always wins.
 */
export const ONBOARDING_PREVIEW_ACCENT = "#5BF5C9";

/**
 * Build the read-only preview payload: the {@link SAMPLE_LISTING_DRAFT} listing
 * merged with the agent's REAL Agent Layer through the SAME publish pipeline the
 * seller will receive (so the agent band / reviews / contact / marketing are the
 * agent's real, projected content — never a mock). Pure: no instance, no slug,
 * no publish, no tracking — it only derives a PublicPayload.
 *
 * `accountEmail` is folded in as the reach-of-last-resort (the ConfirmTime /
 * AgentBand contact) exactly as a live publish does, so the preview never shows
 * an unreachable agent even before they set a direct line.
 */
export function buildSamplePreviewPayload(
  brand: BrandSettings,
  accountEmail: string = "",
): PublicPayload {
  const payload = buildOnboardingStateAPayload(
    SAMPLE_LISTING_DRAFT,
    brand,
    accountEmail,
  );
  // Onboarding accent rule: an unset brand accent resolves to studio mint (the
  // builder omits brandColors when the agent has no accent, which would derive
  // the brand-system blue). A real accent already on the payload wins.
  if (!payload.brandColors?.accent) {
    return {
      ...payload,
      brandColors: { ...payload.brandColors, accent: ONBOARDING_PREVIEW_ACCENT },
    };
  }
  return payload;
}
