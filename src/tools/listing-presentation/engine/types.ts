/**
 * Types and validation for the Listing Presentation One-Pager tool.
 *
 * The presentation is the document a realtor brings to a listing
 * appointment to win the listing — fundamentally different from the
 * Flyer Generator output (which is the marketing asset produced after
 * winning it). Audience is the homeowner deciding which agent to hire;
 * content is agent-focused (track record, marketing strategy,
 * comparable sales, why-me) not property-focused.
 */

export interface ComparableSale {
  address: string;
  /** "$685,000" — string so the user can type freely (decimal/comma/etc). */
  soldPrice: string;
  /** "8" — string to match other numeric inputs. */
  daysOnMarket: string;
  /** "104%" — string to allow the % sign. */
  saleToListPercent: string;
}

export interface PresentationDraft {
  // Property — anchor of the document
  propertyAddress: string;
  propertyCity: string;
  ownerName: string;

  // About you
  agentBio: string;
  /** Compressed JPEG data URL (~400×400 q=0.85) or null. Stored inline
   *  in the draft so it persists in localStorage alongside the rest of
   *  the form state — unlike the flyer, presentations have one image. */
  agentHeadshot: string | null;

  // Track record (4 stat tiles)
  homesSold: string;
  averageDaysOnMarket: string;
  saleToListRatio: string;
  yearsExperience: string;

  // Marketing strategy bullets
  marketingStrategies: string[];

  // Comparable sales
  comparableSales: ComparableSale[];

  // Closing pitch
  whyChooseMe: string;

  // Per-presentation color overrides — same pattern as flyer.
  // Empty string falls through to BrandSettings.
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
}

/**
 * H-7.2.5-1 reduced the strategy cap 5 → 4 and introduced
 * per-strategy + per-pitch character caps. The PDF document was
 * spec'd as 1-page-only in H-6b, but Marketing Strategy and Why
 * Choose Me accepted unbounded text — fully-filled drafts were
 * overflowing to a 2-page PDF, and the JPEG export (which only
 * rasterizes page 1) was silently dropping content. The new caps
 * trim ~80pt of vertical worst-case fill out of the body so any
 * legal draft fits the single page.
 */
export const MAX_MARKETING_STRATEGIES = 4;
export const MAX_STRATEGY_LENGTH = 80;
export const MAX_WHY_CHOOSE_ME_LENGTH = 280;
export const MAX_COMPARABLE_SALES = 3;
/** Headshot compressed to ~400px square JPEG q=0.85 — small enough to
 *  fit in localStorage alongside the rest of the draft, big enough that
 *  the PDF's 100pt circle prints crisply. */
export const HEADSHOT_MAX_EDGE = 400;
export const HEADSHOT_QUALITY = 0.85;

const EMPTY_COMP: ComparableSale = {
  address: "",
  soldPrice: "",
  daysOnMarket: "",
  saleToListPercent: "",
};

export const EMPTY_DRAFT: PresentationDraft = {
  propertyAddress: "",
  propertyCity: "",
  ownerName: "",
  agentBio: "",
  agentHeadshot: null,
  homesSold: "",
  averageDaysOnMarket: "",
  saleToListRatio: "",
  yearsExperience: "",
  marketingStrategies: ["", "", ""],
  comparableSales: [{ ...EMPTY_COMP }, { ...EMPTY_COMP }, { ...EMPTY_COMP }],
  whyChooseMe: "",
  primaryColor: "",
  accentColor: "",
  backgroundColor: "",
};

/**
 * Coerce arbitrary localStorage-shaped input into a valid PresentationDraft.
 * Handles missing keys, wrong types, oversized arrays, and corrupt headshot
 * data URLs. Used on draft load + before any export so downstream code can
 * trust the shape.
 */
export function clampDraft(input: unknown): PresentationDraft {
  if (!input || typeof input !== "object") return EMPTY_DRAFT;
  const o = input as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  const headshot =
    typeof o.agentHeadshot === "string" && o.agentHeadshot.startsWith("data:")
      ? o.agentHeadshot
      : null;

  // H-7.2.5-1: cap individual strategy length too. Pre-H-7.2.5-1
  // drafts saved with a 5th strategy or strategies > 80 chars get
  // silently trimmed on load — preferable to errors or layout
  // overflow.
  const strategies = Array.isArray(o.marketingStrategies)
    ? o.marketingStrategies
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.slice(0, MAX_STRATEGY_LENGTH))
        .slice(0, MAX_MARKETING_STRATEGIES)
    : [];

  const comps = Array.isArray(o.comparableSales)
    ? o.comparableSales
        .filter(
          (c): c is Record<string, unknown> =>
            typeof c === "object" && c !== null
        )
        .slice(0, MAX_COMPARABLE_SALES)
        .map((c) => ({
          address: str(c.address),
          soldPrice: str(c.soldPrice),
          daysOnMarket: str(c.daysOnMarket),
          saleToListPercent: str(c.saleToListPercent),
        }))
    : [];

  return {
    propertyAddress: str(o.propertyAddress),
    propertyCity: str(o.propertyCity),
    ownerName: str(o.ownerName),
    agentBio: str(o.agentBio),
    agentHeadshot: headshot,
    homesSold: str(o.homesSold),
    averageDaysOnMarket: str(o.averageDaysOnMarket),
    saleToListRatio: str(o.saleToListRatio),
    yearsExperience: str(o.yearsExperience),
    marketingStrategies: strategies,
    comparableSales: comps,
    whyChooseMe: str(o.whyChooseMe).slice(0, MAX_WHY_CHOOSE_ME_LENGTH),
    primaryColor: str(o.primaryColor),
    accentColor: str(o.accentColor),
    backgroundColor: str(o.backgroundColor),
  };
}

/** Slugify the property address for filenames. Mirrors flyer addressSlug. */
export function addressSlug(address: string): string {
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "presentation";
}

/** Returns a user-facing error message, or null if the draft is exportable. */
export function validateForExport(draft: PresentationDraft): string | null {
  if (!draft.propertyAddress.trim())
    return "Add the property address before exporting";
  return null;
}
