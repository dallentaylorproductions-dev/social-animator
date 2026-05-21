/**
 * Seller Presentation — engine types (v1.47 / A5a-A7a)
 *
 * Per-skill draft for the converged WorkflowInstance shape. The
 * storage layer (src/skills/workflow-instance-storage.ts) treats
 * `draft` as opaque; this module owns its structure.
 *
 * Lineage:
 *   A5a — initial draft type with Step 1 (Property) fields live.
 *   A5b — Step 2-5 fields populated (comps, strategy, pitch, review).
 *   A6  — public-payload serializer carries (propertyAddress,
 *         recommendedPrice, priceRationale, comps[], agentBranding,
 *         pitchPublicPoints) only. Privacy boundary proven by test.
 *   A7a — locked-design extensions land: property city/state/zip +
 *         hero photo; agentNote + preparedFor personalization;
 *         video slot; comps add soldDate + sqft (and the public
 *         emit trims to ONLY {address, soldPrice, soldDate, sqft});
 *         pitchPoints gain title + support (text kept as legacy);
 *         new optional blocks (trackRecord, reviews, reviewsOutlink,
 *         areaStats, buyerQuote); agent block extends.
 *         All A7a fields are OPTIONAL; existing drafts stay valid.
 *
 * `Comp` is re-imported from the SIR engine — the substrate-shape
 * Comp (carrying `source` + `fieldConfidence` for Lane C's photo-to-
 * comp plug-point) already lives there and shouldn't be duplicated.
 */

import type { Comp } from "@/tools/seller-intelligence-report/engine/types";

export type { Comp };

export type ConfidenceLevel = "high" | "medium" | "low";

export type PitchPointVisibility = "public" | "private";

export interface PitchPoint {
  /** Local UUID for stable list editing across reorders / deletes. */
  id: string;
  /**
   * @deprecated A5b legacy field. A7a's locked design uses `title` +
   * `support`. The serializer's `pitchPublicPoints` emits `title`
   * (falling back to `text` for older drafts) and `pitchPublicCards`
   * emits the full `{title, support}` shape. Wizard A7b/A7c will
   * migrate input UI off `text`; the field stays on the type so older
   * drafts (and any pre-A7b in-flight wizards) continue to clamp/
   * serialize cleanly.
   */
  text?: string;
  /** A7a — heading on the locked-design pitch-point card. */
  title?: string;
  /** A7a — body copy under the title. Empty allowed (title-only cards). */
  support?: string;
  /** Drives the public-payload allowlist — only `public` points reach the published web page. */
  visibility: PitchPointVisibility;
}

/**
 * Video slot (A7a). The locked design reserves a hero-area video card
 * with poster + duration + recorded date. A7a only CARRIES the field
 * shape — actual upload + hosting infra is a deferred Pro-tier
 * follow-on. When `videoUrl` is set, the renderer (A7b) shows the
 * card; when unset, the section hides cleanly.
 */
export interface PresentationVideo {
  posterUrl?: string;
  videoUrl?: string;
  title?: string;
  /** Free-text duration ("2:14" or "2 min"). */
  runtime?: string;
  /** ISO 8601 date or free-text ("April 2026"). */
  recordedOn?: string;
}

/** A single editorial figure in the agent's published track record. */
export interface TrackRecordFigure {
  /** Short eyebrow (e.g. "Homes sold"). */
  label: string;
  /** Value (e.g. "84"). */
  value: string;
  /** Optional context line (e.g. "in the last 24 months"). */
  ctx?: string;
}

/** Past-seller testimonial in the track-record block. */
export interface TrackRecordTestimonial {
  body: string;
  /** Short attribution (e.g. "M.S."). */
  attributionShort: string;
  /** Optional area-or-year sub-line ("Tacoma, 2025"). */
  areaOrYear?: string;
}

/**
 * Track record. EDITORIAL — figures the agent has CHOSEN to publish.
 * Strictly distinct from the private `teamOnlyStats` family
 * (negotiationNotes etc.) — track-record figures are public-safe by
 * construction (the agent typed them into the wizard knowing they'd
 * show on the seller's page).
 */
export interface TrackRecord {
  /** 0–3 editorial figures. Page hides cleanly when absent or empty. */
  figures?: TrackRecordFigure[];
  /** Optional past-seller testimonial paired with the figures. */
  testimonial?: TrackRecordTestimonial;
}

/** A single review surfaced in the reviews section. Manual/curated only — no scrape. */
export interface Review {
  body: string;
  attributionName: string;
  attributionYear?: string;
  attributionStreet?: string;
}

/** Link out to a reviews aggregator (e.g. "See all reviews on Zillow →"). */
export interface ReviewsOutlink {
  label: string;
  url: string;
}

/** One data point in the area-stats monthly series. */
export interface AreaStatsMonthly {
  /** Free-text month label (e.g. "May" or "2026-05"). */
  month: string;
  medianPrice: string;
}

/**
 * Agent-entered area snapshot. v1.47 ships with no auto-sourcing —
 * the agent fills these in by hand or omits the section ("snapshot
 * coming soon" graceful state in the renderer). Auto-sourcing is the
 * substrate's deferred data-source-strategy work.
 */
export interface AreaStats {
  medianSale?: string;
  medianSaleDeltaYoy?: string;
  daysOnMarket?: string;
  daysOnMarketZipAvg?: string;
  closings90d?: string;
  listToSaleRatio?: string;
  /** 12 monthly entries when present; renderer also accepts <12 gracefully. */
  monthlySeries?: AreaStatsMonthly[];
}

/** Editorial pull-quote ABOUT THE HOME (e.g. from a buyer or agent peer). */
export interface BuyerQuote {
  body: string;
  source: string;
}

export interface SellerPresentationDraft {
  // ---- Step 1: Property (A5a LIVE; A7a extensions) ----
  /**
   * Snapshot of the resolved Property primitive id at the time the
   * agent advanced past Step 1. The wizard shell also writes this
   * onto WorkflowInstance.resolvedPrimitives.propertyId so the
   * runtime + dashboard can read it without inspecting the draft.
   */
  propertyId?: string;
  propertyAddress?: string;
  propertyCity?: string;
  /** A7a — state component of the property address. */
  propertyState?: string;
  /** A7a — ZIP component of the property address. */
  propertyZip?: string;
  /** A7a — hero photo (data URL or external URL). Nullable → renderer falls back to monogram. */
  heroPhotoUrl?: string;
  /**
   * A7b.1 — editorial photo band (renderer puts it ABOVE the dark
   * buyer-quote panel as a visual lead-in). Public-safe, agent-
   * entered; intentionally distinct from heroPhotoUrl (the design
   * wants a different image here). Nullable → renderer hides the
   * band entirely when absent (quote panel renders solo).
   */
  editorialPhotoUrl?: string;

  // ---- Step 3 (A5b): Pricing & strategy ----
  recommendedPrice?: string;
  /** Short public-safe rationale (≠ pricingStrategyId / confidence, which are private). */
  priceRationale?: string;
  pricingStrategyId?: string;
  confidence?: ConfidenceLevel;

  // ---- Step 2 (A5b): Comparable sales ----
  comps: Comp[];

  // ---- Step 4 (A5b + A7a): Pitch ----
  pitchPoints: PitchPoint[];

  // ---- Step 5 (A5b): Review ----
  preAppointmentNotes?: string;
  commitments: string[];
  asks: string[];

  // ---- A7a: personalization + editorial extensions ----
  /**
   * Personalization line — "the Halloran family". OPTIONAL. The
   * wizard typically auto-derives this from the linked Client primitive
   * (resolvedPrimitives.clientId / src/lib/client-profile.ts) but the
   * agent can override / clear it. Page hides personalization when absent.
   */
  preparedFor?: string;
  /** Italic personal sentence rendered near the top of the seller page. */
  agentNote?: string;
  /** Hero-area video card; slot only in v1.47. */
  video?: PresentationVideo;
  /** Editorial track-record (figures + testimonial), agent-published. */
  trackRecord?: TrackRecord;
  /** Manual/curated reviews. */
  reviews?: Review[];
  /** Link-out to an external reviews aggregator. */
  reviewsOutlink?: ReviewsOutlink;
  /** Agent-entered area snapshot; no auto-sourcing in v1.47. */
  areaStats?: AreaStats;
  /** Editorial pull-quote about the home. */
  buyerQuote?: BuyerQuote;

  // ---- A7a: agent extensions captured per-presentation ----
  // These DON'T currently live on BrandSettings; the wizard A7b/A7c
  // will decide whether to capture per-presentation here or extend
  // BrandSettings. Both routes serialize through `AgentBranding`.
  /** A7a — areas served, e.g. "Tacoma · Gig Harbor · Federal Way". */
  agentAreasServed?: string;
  /** A7a — agent headshot URL (data URL or external). Renderer falls back to monogram. */
  agentPhotoUrl?: string;
  /** A7a — short bio (≤ 280 chars). */
  agentBioShort?: string;
  /** A7a — years in the local market. */
  agentYearsInArea?: string;
  /** A7a — reassurance copy under the CTA ("No-pressure conversation"). */
  agentCtaReassurance?: string;

  // ---- Optional cross-step refs ----
  /** Stable Client id when the SP is personalized ("for the Johnsons"). */
  clientId?: string;
  /** Premium theme id (A7d); empty/absent = default theme. */
  themeId?: string;
}

export const EMPTY_DRAFT: SellerPresentationDraft = {
  comps: [],
  pitchPoints: [],
  commitments: [],
  asks: [],
};

const VALID_CONFIDENCE: readonly ConfidenceLevel[] = ["high", "medium", "low"];

const VALID_PITCH_VISIBILITY: readonly PitchPointVisibility[] = [
  "public",
  "private",
];

function clampString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function clampStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string").slice(0, max);
}

function clampPitchPoint(raw: unknown): PitchPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const text = typeof r.text === "string" ? r.text : undefined;
  const title = typeof r.title === "string" ? r.title : undefined;
  // A point with no usable text in ANY field (text/title) is dropped —
  // it has no rendering content. A7b's wizard input ensures `title` is
  // populated for new points; legacy A5b drafts populate `text`.
  if (!text && !title) return null;
  return {
    id: r.id,
    text,
    title,
    support: typeof r.support === "string" ? r.support : undefined,
    visibility: VALID_PITCH_VISIBILITY.includes(r.visibility as PitchPointVisibility)
      ? (r.visibility as PitchPointVisibility)
      : "private",
  };
}

function clampPresentationVideo(raw: unknown): PresentationVideo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const video: PresentationVideo = {
    posterUrl: clampString(r.posterUrl),
    videoUrl: clampString(r.videoUrl),
    title: clampString(r.title),
    runtime: clampString(r.runtime),
    recordedOn: clampString(r.recordedOn),
  };
  // Drop the whole block if nothing is set — keeps the draft tidy and
  // makes the serializer's "omit when empty" branch trivial.
  const hasAny = Object.values(video).some((v) => v !== undefined);
  return hasAny ? video : undefined;
}

function clampTrackRecordFigure(raw: unknown): TrackRecordFigure | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== "string" || typeof r.value !== "string") return null;
  return {
    label: r.label,
    value: r.value,
    ctx: typeof r.ctx === "string" ? r.ctx : undefined,
  };
}

function clampTrackRecordTestimonial(
  raw: unknown,
): TrackRecordTestimonial | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.body !== "string" || typeof r.attributionShort !== "string") {
    return undefined;
  }
  return {
    body: r.body,
    attributionShort: r.attributionShort,
    areaOrYear: typeof r.areaOrYear === "string" ? r.areaOrYear : undefined,
  };
}

function clampTrackRecord(raw: unknown): TrackRecord | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const figures = Array.isArray(r.figures)
    ? r.figures
        .map(clampTrackRecordFigure)
        .filter((f): f is TrackRecordFigure => f !== null)
        .slice(0, 3)
    : undefined;
  const testimonial = clampTrackRecordTestimonial(r.testimonial);
  if (!figures?.length && !testimonial) return undefined;
  return { figures, testimonial };
}

function clampReview(raw: unknown): Review | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.body !== "string" || typeof r.attributionName !== "string") {
    return null;
  }
  return {
    body: r.body,
    attributionName: r.attributionName,
    attributionYear:
      typeof r.attributionYear === "string" ? r.attributionYear : undefined,
    attributionStreet:
      typeof r.attributionStreet === "string" ? r.attributionStreet : undefined,
  };
}

function clampReviewsOutlink(raw: unknown): ReviewsOutlink | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== "string" || typeof r.url !== "string") return undefined;
  return { label: r.label, url: r.url };
}

function clampAreaStatsMonthly(raw: unknown): AreaStatsMonthly | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.month !== "string" || typeof r.medianPrice !== "string") {
    return null;
  }
  return { month: r.month, medianPrice: r.medianPrice };
}

function clampAreaStats(raw: unknown): AreaStats | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const monthlySeries = Array.isArray(r.monthlySeries)
    ? r.monthlySeries
        .map(clampAreaStatsMonthly)
        .filter((m): m is AreaStatsMonthly => m !== null)
        .slice(0, 12)
    : undefined;
  const stats: AreaStats = {
    medianSale: clampString(r.medianSale),
    medianSaleDeltaYoy: clampString(r.medianSaleDeltaYoy),
    daysOnMarket: clampString(r.daysOnMarket),
    daysOnMarketZipAvg: clampString(r.daysOnMarketZipAvg),
    closings90d: clampString(r.closings90d),
    listToSaleRatio: clampString(r.listToSaleRatio),
    monthlySeries: monthlySeries?.length ? monthlySeries : undefined,
  };
  const hasAny = Object.values(stats).some((v) => v !== undefined);
  return hasAny ? stats : undefined;
}

function clampBuyerQuote(raw: unknown): BuyerQuote | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.body !== "string" || typeof r.source !== "string") return undefined;
  return { body: r.body, source: r.source };
}

/**
 * Normalize a draft from any historical shape. Defense-at-boundary
 * mirror of SIR's clampDraft pattern: types stay strict; the helper
 * coalesces missing arrays / strings to safe defaults so a partial
 * draft (loaded from a pre-A7a instance) renders without crashing.
 */
export function clampDraft(
  raw: Partial<SellerPresentationDraft> | null | undefined,
): SellerPresentationDraft {
  if (!raw) return { ...EMPTY_DRAFT };
  return {
    propertyId: clampString(raw.propertyId),
    propertyAddress: clampString(raw.propertyAddress),
    propertyCity: clampString(raw.propertyCity),
    propertyState: clampString(raw.propertyState),
    propertyZip: clampString(raw.propertyZip),
    heroPhotoUrl: clampString(raw.heroPhotoUrl),
    editorialPhotoUrl: clampString(raw.editorialPhotoUrl),
    recommendedPrice: clampString(raw.recommendedPrice),
    priceRationale: clampString(raw.priceRationale),
    pricingStrategyId: clampString(raw.pricingStrategyId),
    confidence: VALID_CONFIDENCE.includes(raw.confidence as ConfidenceLevel)
      ? (raw.confidence as ConfidenceLevel)
      : undefined,
    comps: Array.isArray(raw.comps) ? raw.comps.slice(0, 4) : [],
    pitchPoints: Array.isArray(raw.pitchPoints)
      ? raw.pitchPoints
          .map(clampPitchPoint)
          .filter((p): p is PitchPoint => p !== null)
      : [],
    preAppointmentNotes: clampString(raw.preAppointmentNotes),
    commitments: clampStringArray(raw.commitments, 10),
    asks: clampStringArray(raw.asks, 10),
    preparedFor: clampString(raw.preparedFor),
    agentNote: clampString(raw.agentNote),
    video: clampPresentationVideo(raw.video),
    trackRecord: clampTrackRecord(raw.trackRecord),
    reviews: Array.isArray(raw.reviews)
      ? raw.reviews.map(clampReview).filter((r): r is Review => r !== null)
      : undefined,
    reviewsOutlink: clampReviewsOutlink(raw.reviewsOutlink),
    areaStats: clampAreaStats(raw.areaStats),
    buyerQuote: clampBuyerQuote(raw.buyerQuote),
    agentAreasServed: clampString(raw.agentAreasServed),
    agentPhotoUrl: clampString(raw.agentPhotoUrl),
    agentBioShort: clampString(raw.agentBioShort),
    agentYearsInArea: clampString(raw.agentYearsInArea),
    agentCtaReassurance: clampString(raw.agentCtaReassurance),
    clientId: clampString(raw.clientId),
    themeId: clampString(raw.themeId),
  };
}

/**
 * True iff Step 1 (Property) is fully cleared — a saved Property
 * primitive id AND a non-empty address. The wizard shell uses this
 * to gate Step 1's "Next" button.
 */
export function isStepPropertyComplete(draft: SellerPresentationDraft): boolean {
  return Boolean(draft.propertyId && draft.propertyAddress?.trim());
}

/**
 * Field keys (per the skill contract) currently empty on the draft.
 * Single source of truth for export gating — both the runtime's
 * SkillStatus.missingRequiredInputs (which surfaces blockers in the
 * dashboard) and StepReview's pre-publish validation (which renders
 * "Missing: X → Go back to fix →") read from this.
 *
 * Mirrors the skill record's `inputs.required`: propertyAddress is
 * always required; recommendedPrice is required for export (gates the
 * agent prep PDF + the published web page); comps require at least
 * one row with address + soldPrice (the published page renders the
 * price-justification table from `comps[].public`).
 */
export function getMissingRequiredInputs(
  draft: SellerPresentationDraft,
): string[] {
  const missing: string[] = [];
  if (!draft.propertyAddress?.trim()) missing.push("propertyAddress");
  if (!draft.recommendedPrice?.trim()) missing.push("recommendedPrice");
  if (draft.comps.length === 0) {
    missing.push("comps");
  } else if (
    !draft.comps[0].address.trim() ||
    !draft.comps[0].soldPrice.trim()
  ) {
    missing.push("comps[0]");
  }
  return missing;
}

/**
 * The single field key blocking export, or null when none. Convenience
 * over `getMissingRequiredInputs[0]` for the StepReview / button paths
 * that only show one blocker at a time. Mirrors the SIR + OH Prep
 * `validateForExport` shape.
 */
export function validateForExport(
  draft: SellerPresentationDraft,
): string | null {
  return getMissingRequiredInputs(draft)[0] ?? null;
}
