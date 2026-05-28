/**
 * Seller Intelligence Report — engine types
 *
 * The SIR is the agent-facing companion to the Listing Presentation (LP).
 * It produces a private prep document the agent uses during a listing
 * appointment: comps, pricing strategy, objection talking points,
 * commitments, and asks.
 *
 * Architectural decisions (from SIR-1 audit + 16 refinements):
 * - Separate draft from LP; cross-tool data comes from ListingProfile +
 *   BrandSettings (NOT from LP's draft)
 * - Confidence-keyed range bracket (Refinement #11)
 * - Comp shape extends LP's comparableSales with optional v2 fields
 *   (Refinement #16 — source, fieldConfidence)
 * - Defense-at-boundary: required fields coalesce at the renderer
 *   (Refinement #12) — types stay strict here
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type CompSource = 'manual' | 'screenshot-ai' | 'imported';

export type CompFieldName =
  | 'address'
  | 'soldPrice'
  | 'daysOnMarket'
  | 'saleToListPercent'
  | 'squareFeet'
  | 'distanceMiles'
  | 'soldDate'
  | 'notes';

export interface Comp {
  address: string;
  soldPrice: string;             // formatted (e.g. "$685,000")
  daysOnMarket?: string;         // optional in case data unavailable
  saleToListPercent?: string;    // e.g. "98%"
  squareFeet?: string;
  distanceMiles?: string;
  soldDate?: string;             // ISO YYYY-MM-DD or free-text
  notes?: string;                // agent's own commentary on why this comp matters
  /**
   * Build year of the comp (4-digit integer). Surfaced today in the
   * Seller Presentation wizard + consumer page so buyers see the era
   * signal next to the address/price/sqft. Field lives on the shared
   * Comp primitive (not in SIR's render today) because comp-analyzer
   * will map it automatically from MLS exports once that ships.
   */
  yearBuilt?: number;

  /**
   * V2 prep — never displayed in v1. Tracks how the comp was entered so
   * Screenshot Import (v2) can badge AI-extracted comps and surface
   * per-field confidence for agent review.
   */
  source?: CompSource;
  fieldConfidence?: Partial<Record<CompFieldName, ConfidenceLevel>>;
}

export interface SellerIntelligenceReportDraft {
  // Step 1: Property + pricing strategy + confidence
  propertyAddress: string;
  propertyCity?: string;
  ownerName?: string;

  recommendedListPrice: string;       // formatted (e.g. "$685,000")
  pricingStrategyId?: string;         // id of selected entry from PRICING_STRATEGIES
  confidence?: ConfidenceLevel;       // drives RANGE_SPREAD_BY_CONFIDENCE bracket

  // Step 2: Comps (up to 4)
  comps: Comp[];

  // Step 3: Selected talking points (ids from OBJECTION_LIBRARY) + optional per-entry overrides
  selectedObjectionIds: string[];
  objectionOverrides?: Record<string, string>; // id -> agent's custom response text

  // Step 4: Notes, commitments, asks
  preAppointmentNotes?: string;
  commitments: string[];               // agent's promises (free-text bullets)
  asks: string[];                      // what agent needs from seller (free-text bullets)

  // Color overrides (mirror LP pattern — optional per-report)
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

export const EMPTY_DRAFT: SellerIntelligenceReportDraft = {
  propertyAddress: '',
  recommendedListPrice: '',
  comps: [],
  selectedObjectionIds: [],
  commitments: [],
  asks: [],
};

/**
 * Normalize a draft from any historical shape. Defense-at-boundary
 * pattern (Refinement #12): the type system is strict but the helper
 * coalesces missing arrays/strings to safe defaults so partial drafts
 * (loaded from older localStorage states) don't crash downstream.
 */
export function clampDraft(
  raw: Partial<SellerIntelligenceReportDraft> | null | undefined,
): SellerIntelligenceReportDraft {
  if (!raw) return { ...EMPTY_DRAFT };

  return {
    propertyAddress: typeof raw.propertyAddress === 'string' ? raw.propertyAddress : '',
    propertyCity: typeof raw.propertyCity === 'string' ? raw.propertyCity : undefined,
    ownerName: typeof raw.ownerName === 'string' ? raw.ownerName : undefined,
    recommendedListPrice: typeof raw.recommendedListPrice === 'string' ? raw.recommendedListPrice : '',
    pricingStrategyId: typeof raw.pricingStrategyId === 'string' ? raw.pricingStrategyId : undefined,
    confidence: (['high', 'medium', 'low'] as const).includes(raw.confidence as ConfidenceLevel)
      ? (raw.confidence as ConfidenceLevel)
      : undefined,
    comps: Array.isArray(raw.comps) ? raw.comps.slice(0, 4).map(clampComp) : [],
    selectedObjectionIds: Array.isArray(raw.selectedObjectionIds)
      ? raw.selectedObjectionIds.filter((id): id is string => typeof id === 'string')
      : [],
    objectionOverrides:
      raw.objectionOverrides && typeof raw.objectionOverrides === 'object'
        ? raw.objectionOverrides
        : undefined,
    preAppointmentNotes: typeof raw.preAppointmentNotes === 'string' ? raw.preAppointmentNotes : undefined,
    commitments: Array.isArray(raw.commitments)
      ? raw.commitments.filter((s): s is string => typeof s === 'string').slice(0, 10)
      : [],
    asks: Array.isArray(raw.asks)
      ? raw.asks.filter((s): s is string => typeof s === 'string').slice(0, 10)
      : [],
    primaryColor: typeof raw.primaryColor === 'string' ? raw.primaryColor : undefined,
    accentColor: typeof raw.accentColor === 'string' ? raw.accentColor : undefined,
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : undefined,
  };
}

function clampComp(raw: Partial<Comp>): Comp {
  const validSources: readonly CompSource[] = ['manual', 'screenshot-ai', 'imported'];
  return {
    address: typeof raw.address === 'string' ? raw.address : '',
    soldPrice: typeof raw.soldPrice === 'string' ? raw.soldPrice : '',
    daysOnMarket: typeof raw.daysOnMarket === 'string' ? raw.daysOnMarket : undefined,
    saleToListPercent: typeof raw.saleToListPercent === 'string' ? raw.saleToListPercent : undefined,
    squareFeet: typeof raw.squareFeet === 'string' ? raw.squareFeet : undefined,
    distanceMiles: typeof raw.distanceMiles === 'string' ? raw.distanceMiles : undefined,
    soldDate: typeof raw.soldDate === 'string' ? raw.soldDate : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    yearBuilt:
      typeof raw.yearBuilt === 'number' && Number.isFinite(raw.yearBuilt)
        ? raw.yearBuilt
        : undefined,
    source: validSources.includes(raw.source as CompSource) ? (raw.source as CompSource) : 'manual',
    fieldConfidence:
      raw.fieldConfidence && typeof raw.fieldConfidence === 'object' ? raw.fieldConfidence : undefined,
  };
}

/**
 * Validate a draft for export. SIR is permissive: minimum is propertyAddress
 * + recommendedListPrice + at least one comp. Everything else is optional.
 * Returns null on success, or a string naming the first missing requirement.
 */
export function validateForExport(draft: SellerIntelligenceReportDraft): string | null {
  if (!draft.propertyAddress.trim()) return 'propertyAddress';
  if (!draft.recommendedListPrice.trim()) return 'recommendedListPrice';
  if (draft.comps.length === 0) return 'comps';
  if (!draft.comps[0].address.trim() || !draft.comps[0].soldPrice.trim()) {
    return 'comps[0]';
  }
  return null;
}

/**
 * Lowercase URL-safe slug for the property address. Used by draft storage
 * and any future per-listing routing.
 */
export function addressSlug(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
