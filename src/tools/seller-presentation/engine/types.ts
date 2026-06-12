/**
 * Seller Presentation — engine types (v1.47 / A5a-A7d.2)
 *
 * Per-skill draft for the converged WorkflowInstance shape. The
 * storage layer (src/skills/workflow-instance-storage.ts) treats
 * `draft` as opaque; this module owns its structure.
 *
 * A7d.1 subtraction: `editorialPhotoUrl`, `agentNote`, `trackRecord`
 * (figures + testimonial), and `buyerQuote` were removed from the
 * draft, serializer, and renderer. Persisted older drafts may still
 * carry those keys — `clampDraft` builds a fresh object from the
 * allowed field set, so any unknown/removed keys are silently dropped
 * on read. Old drafts continue to load + publish.
 *
 * A7d.2 relocation: `reviews` + `reviewsOutlink` moved off the draft
 * onto brand Settings (agent-constant). They stay defined on the
 * shared `Review` / `ReviewsOutlink` types because the public payload
 * + renderer still consume them; the projector just reads them from
 * the publish route's `brandReviews` arg instead of the draft. Legacy
 * drafts that still carry `reviews` / `reviewsOutlink` keys load
 * cleanly — `clampDraft` drops them on read.
 *
 * `Comp` is re-imported from the SIR engine — the substrate-shape
 * Comp (carrying `source` + `fieldConfidence` for Lane C's photo-to-
 * comp plug-point) already lives there and shouldn't be duplicated.
 */

import type { Comp } from "@/tools/seller-intelligence-report/engine/types";
import { isPriceRangeActive } from "./price-range";
import { clampAppointmentAt } from "./appointment";

export type { Comp };

export type ConfidenceLevel = "high" | "medium" | "low";

export type PitchPointVisibility = "public" | "private";

/**
 * Seller State A — the valuation-status state machine (the living page at one
 * slug evolves through these states):
 *   - `preparing_for_walkthrough` — State A, the prepared invitation, BEFORE the
 *     listing appointment. The home's value reads as being prepared, never a price.
 *   - `ready_to_review` — State A still, the in-between beat once prep is done but
 *     the agent hasn't reviewed the home in person yet. Same no-price render.
 *   - `revealed` — State B, the full presentation AT/AFTER the appointment. This is
 *     today's seller presentation, untouched.
 *
 * DEFAULT (absent on every already-published / pre-State-A draft) is `revealed`:
 * the projector + the consumer render both treat a missing status as `revealed`,
 * so today's behavior is byte-identical and nothing breaks. The whole machine is
 * baked now (not a one-off State A) so the reveal transition (Slice 2) is a status
 * flip, not a schema change.
 */
export type ValuationStatus =
  | "preparing_for_walkthrough"
  | "ready_to_review"
  | "revealed";

export const VALID_VALUATION_STATUS: readonly ValuationStatus[] = [
  "preparing_for_walkthrough",
  "ready_to_review",
  "revealed",
];

/**
 * True for the two State A statuses (the page is a prepared invitation, no price).
 * `revealed` / undefined is the existing full presentation. The single predicate
 * the projector, the consumer dispatch, and the publish gate all read, so they
 * never disagree about which render a draft resolves to.
 */
export function isInvitationStatus(
  status: ValuationStatus | undefined,
): boolean {
  return (
    status === "preparing_for_walkthrough" || status === "ready_to_review"
  );
}

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
/**
 * P2-VIDEO-2 — agent-chosen inlay framing (Instagram-style). The inlay
 * FILLS its fixed-aspect frame with `object-fit: cover` (no letterbox);
 * this record positions the cover within the frame so the agent's face is
 * never auto-chopped. `focalX/Y` are object-position percentages (0–100);
 * `zoom` is a `transform: scale()` factor (1 = fill, can only zoom IN).
 * Aspect-independent on purpose: the same focal point drives both the 4/5
 * (default) and the 3/4 (≥720px container) inlay frames AND the live
 * wizard preview — one source of truth. NOT applied in fullscreen, where
 * the buyer sees the full native uploaded video uncropped.
 */
export interface VideoFraming {
  /** Horizontal object-position, 0–100 (%). */
  focalX: number;
  /** Vertical object-position, 0–100 (%). */
  focalY: number;
  /** transform: scale() factor, 1.0–3.0 (floor 1 = can't zoom out past fill). */
  zoom: number;
}

/**
 * Unframed default — upper-center bias (focalY 30) so faces aren't cut when
 * the agent never opens the framing control, and so already-published videos
 * with no `framing` fill sensibly without an obvious head-chop.
 */
export const DEFAULT_VIDEO_FRAMING: VideoFraming = {
  focalX: 50,
  focalY: 30,
  zoom: 1,
};

export interface PresentationVideo {
  /**
   * Manual upload override (A7d.3 camera-roll "Video thumbnail" field).
   * Highest precedence at render time — beats the scrub-pick and the
   * auto first-frame.
   */
  posterUrl?: string;
  /**
   * Frame picked via the scrubber (A7d.8). Second precedence — beats
   * the auto first-frame default but yields to a manual override.
   */
  scrubPosterUrl?: string;
  /**
   * First-frame default captured automatically right after video upload
   * (A7d.8). Lowest precedence — the never-blank baseline so the
   * seller page is never poster-less even when the agent does nothing.
   */
  autoPosterUrl?: string;
  videoUrl?: string;
  /**
   * @deprecated P2-VIDEO (c) — no longer collected (the wizard input was
   * removed) nor rendered on the flagship (v2) page. Kept DORMANT on the
   * model because the v1 `VideoBlock` still reads it for already-published
   * v1 pages (eyebrow copy, meta line, aria-label) and must render those
   * byte-identically. Do not re-introduce a v2 input/render for it.
   */
  title?: string;
  /** Free-text duration ("2:14" or "2 min"). */
  runtime?: string;
  /** ISO 8601 date or free-text ("April 2026"). */
  recordedOn?: string;
  /**
   * P2-VIDEO-2 — agent-chosen inlay crop framing. Absent on legacy/published
   * videos; the renderer fills the unset case via {@link DEFAULT_VIDEO_FRAMING}
   * through {@link effectiveFraming}.
   */
  framing?: VideoFraming;
}

/**
 * Effective poster precedence (A7d.8): override > scrub > auto. Returns
 * `undefined` when none of the three is set so the renderer can decide
 * whether to omit the poster attribute entirely. Centralized so the
 * renderer, the projector, and any test fixture agree on the order.
 */
export function effectivePosterUrl(
  video: PresentationVideo | undefined,
): string | undefined {
  if (!video) return undefined;
  return video.posterUrl || video.scrubPosterUrl || video.autoPosterUrl;
}

/**
 * P2-VIDEO-3 — iOS first-frame hint (Dallen real-iPhone bug, 2026-06-10).
 *
 * iOS Safari paints a posterless `<video>` BLACK until it's played or
 * seeked — desktop browsers render frame 1 automatically. Appending the
 * media fragment `#t=0.1` makes iOS seek to ~0.1s and PAINT that frame on
 * load, with NO canvas capture (capture-from-`<video>` is unreliable /
 * hangs on iOS — the very thing this avoids). Used on the inlay framing
 * control + the flagship §01 inlay player, both of which take a HOSTED
 * Blob URL.
 *
 * Notes:
 *   - Hosted (https) URLs only. `blob:` object URLs don't reliably honor
 *     media fragments on iOS, so the in-session wizard PREVIEW seeks
 *     programmatically (`video.currentTime`) on `loadedmetadata` instead.
 *   - Idempotent: a URL that already carries any `#fragment` is returned
 *     unchanged (never stack two fragments). Blank/undefined passes
 *     through so callers can spread it conditionally.
 *   - When the buyer/agent presses play, playback simply starts ~0.1s in
 *     — imperceptible, and a far better paint than a black box.
 */
export function withFirstFrameHint(
  url: string | undefined,
): string | undefined {
  if (!url || url.includes("#")) return url;
  return `${url}#t=0.1`;
}

/**
 * P2-VIDEO-2 — resolve the inlay framing with per-field defaults. Centralized
 * so the renderer (AgentNote), the wizard framing control, and any fixture
 * agree on the unframed fallback ({@link DEFAULT_VIDEO_FRAMING}). Always
 * returns a complete, clamped framing so callers never branch on `undefined`.
 */
export function effectiveFraming(
  video: PresentationVideo | undefined,
): VideoFraming {
  const f = video?.framing;
  return {
    focalX: clampFramingNumber(f?.focalX, 0, 100) ?? DEFAULT_VIDEO_FRAMING.focalX,
    focalY: clampFramingNumber(f?.focalY, 0, 100) ?? DEFAULT_VIDEO_FRAMING.focalY,
    zoom: clampFramingNumber(f?.zoom, 1, 3) ?? DEFAULT_VIDEO_FRAMING.zoom,
  };
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

  // ---- Phase A foundation: optional subject-property details ----
  // String | undefined (consistent with the other optional Step 1
  // fields) and clamped through clampString. These feed Step 4 Tier 2
  // drafts (specific-claim drafts gated on data signals) when Phase B4+
  // lands; the capture UI ships in Phase B1, not now. Not required for
  // publish — getMissingRequiredInputs / validateForExport ignore them.
  subjectBedrooms?: string;
  subjectBaths?: string;
  subjectSqft?: string;
  subjectYearBuilt?: string;
  subjectLotSqft?: string;

  // ---- Step 3 (A5b): Pricing & strategy ----
  recommendedPrice?: string;
  /**
   * UX-2a — optional recommended-price RANGE (Aaron: "times I use this when
   * I haven't seen the house — you can put your range down"). A range is
   * ACTIVE only when BOTH are present; a draft with only `recommendedPrice`
   * (every pre-UX-2a draft) renders the single price unchanged. See
   * `engine/price-range.ts` for the shared active/valid/format helpers.
   */
  recommendedPriceLow?: string;
  recommendedPriceHigh?: string;
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
  /** Hero-area video card; slot only in v1.47. */
  video?: PresentationVideo;
  /** Agent-entered area snapshot; no auto-sourcing in v1.47. */
  areaStats?: AreaStats;

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

  // ---- Seller State A: the valuation-status state machine ----
  /**
   * Which state of the living page this draft publishes. Absent ⇒ `revealed`
   * (the existing full presentation) so every pre-State-A draft is byte-identical.
   * New listings created via the State A flow set `preparing_for_walkthrough`.
   * Drives the consumer render: invitation statuses render the prepared
   * invitation (no price); `revealed` renders today's presentation untouched.
   */
  valuationStatus?: ValuationStatus;
  /**
   * Seller State A — the listing-appointment moment, a wall-clock
   * "YYYY-MM-DDTHH:MM" from `<input type="datetime-local">` (no timezone; it is
   * the agent's local time, the same the seller reads). Powers "prepared for
   * [day]" copy + "Your appointment is set for…". See engine/appointment.ts for
   * the SSR-safe formatter. Only carried into the public payload in State A.
   */
  appointmentAt?: string;
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

/**
 * P2-VIDEO-2 — clamp a finite number into [min, max], else `undefined`.
 * Non-numbers, NaN, and ±Infinity all reject so a hand-tampered draft can't
 * inject a bad object-position/scale at the serializer boundary.
 */
function clampFramingNumber(
  v: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

/**
 * P2-VIDEO-2 — clamp the inlay framing field-by-field. Returns `undefined`
 * when NO sub-field is present (so the draft stays tidy and the renderer
 * falls back to {@link DEFAULT_VIDEO_FRAMING}); when at least one is present,
 * fills the missing siblings from the default so the stored record is whole.
 */
export function clampVideoFraming(raw: unknown): VideoFraming | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const focalX = clampFramingNumber(r.focalX, 0, 100);
  const focalY = clampFramingNumber(r.focalY, 0, 100);
  const zoom = clampFramingNumber(r.zoom, 1, 3);
  if (focalX === undefined && focalY === undefined && zoom === undefined) {
    return undefined;
  }
  return {
    focalX: focalX ?? DEFAULT_VIDEO_FRAMING.focalX,
    focalY: focalY ?? DEFAULT_VIDEO_FRAMING.focalY,
    zoom: zoom ?? DEFAULT_VIDEO_FRAMING.zoom,
  };
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
    scrubPosterUrl: clampString(r.scrubPosterUrl),
    autoPosterUrl: clampString(r.autoPosterUrl),
    videoUrl: clampString(r.videoUrl),
    title: clampString(r.title),
    runtime: clampString(r.runtime),
    recordedOn: clampString(r.recordedOn),
    framing: clampVideoFraming(r.framing),
  };
  // Drop the whole block if nothing is set — keeps the draft tidy and
  // makes the serializer's "omit when empty" branch trivial.
  const hasAny = Object.values(video).some((v) => v !== undefined);
  return hasAny ? video : undefined;
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
    subjectBedrooms: clampString(raw.subjectBedrooms),
    subjectBaths: clampString(raw.subjectBaths),
    subjectSqft: clampString(raw.subjectSqft),
    subjectYearBuilt: clampString(raw.subjectYearBuilt),
    subjectLotSqft: clampString(raw.subjectLotSqft),
    recommendedPrice: clampString(raw.recommendedPrice),
    recommendedPriceLow: clampString(raw.recommendedPriceLow),
    recommendedPriceHigh: clampString(raw.recommendedPriceHigh),
    priceRationale: clampString(raw.priceRationale),
    pricingStrategyId: clampString(raw.pricingStrategyId),
    confidence: VALID_CONFIDENCE.includes(raw.confidence as ConfidenceLevel)
      ? (raw.confidence as ConfidenceLevel)
      : undefined,
    comps: Array.isArray(raw.comps) ? raw.comps.slice(0, 5) : [],
    pitchPoints: Array.isArray(raw.pitchPoints)
      ? raw.pitchPoints
          .map(clampPitchPoint)
          .filter((p): p is PitchPoint => p !== null)
      : [],
    preAppointmentNotes: clampString(raw.preAppointmentNotes),
    commitments: clampStringArray(raw.commitments, 10),
    asks: clampStringArray(raw.asks, 10),
    preparedFor: clampString(raw.preparedFor),
    video: clampPresentationVideo(raw.video),
    areaStats: clampAreaStats(raw.areaStats),
    agentAreasServed: clampString(raw.agentAreasServed),
    agentPhotoUrl: clampString(raw.agentPhotoUrl),
    agentBioShort: clampString(raw.agentBioShort),
    agentYearsInArea: clampString(raw.agentYearsInArea),
    agentCtaReassurance: clampString(raw.agentCtaReassurance),
    clientId: clampString(raw.clientId),
    themeId: clampString(raw.themeId),
    // Seller State A — validate against the known statuses; an unknown / absent
    // value drops to undefined (the projector + render treat that as `revealed`,
    // byte-identical to a pre-State-A draft).
    valuationStatus: VALID_VALUATION_STATUS.includes(
      raw.valuationStatus as ValuationStatus,
    )
      ? (raw.valuationStatus as ValuationStatus)
      : undefined,
    appointmentAt: clampAppointmentAt(raw.appointmentAt),
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
 * always required; a recommended PRICE is required for export (gates the
 * agent prep PDF + the published web page) — satisfied by EITHER the
 * single `recommendedPrice` OR a complete low–high range (UX-2a: Aaron's
 * "haven't seen the house, put your range down" case); comps require at
 * least one row with address + soldPrice (the published page renders the
 * price-justification table from `comps[].public`).
 */
export function getMissingRequiredInputs(
  draft: SellerPresentationDraft,
): string[] {
  const missing: string[] = [];
  if (!draft.propertyAddress?.trim()) missing.push("propertyAddress");
  // Seller State A — the prepared invitation deliberately carries NO price and
  // no comps yet (a real number means seeing the home first). So in an
  // invitation status we gate ONLY on the address + the dated appointment moment
  // (the page's whole premise), never price/comps. The full presentation
  // (`revealed` / absent) keeps its existing price + comp gate untouched.
  if (isInvitationStatus(draft.valuationStatus)) {
    if (!draft.appointmentAt?.trim()) missing.push("appointmentAt");
    return missing;
  }
  const hasPrice =
    !!draft.recommendedPrice?.trim() ||
    isPriceRangeActive(draft.recommendedPriceLow, draft.recommendedPriceHigh);
  if (!hasPrice) missing.push("recommendedPrice");
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
 * Friendly labels for the required-input keys `getMissingRequiredInputs`
 * returns. Shared so StepReview's "Missing: X" hint and the publish
 * route's named-rejection message read the SAME human label client- and
 * server-side. Plain words, no em-dash (LS-1 truthful-copy gate).
 */
export const REQUIRED_INPUT_LABELS: Record<string, string> = {
  propertyAddress: "property address",
  recommendedPrice: "recommended price",
  comps: "at least one comp",
  "comps[0]": "Comp 1 address and sold price",
  appointmentAt: "appointment date and time",
};

/**
 * The missing required inputs as human labels (via REQUIRED_INPUT_LABELS).
 * The publish route uses this to turn the old opaque "Required fields
 * missing on draft" into a message that NAMES the field(s), so a publish
 * failure is never a guessing game again.
 */
export function describeMissingRequiredInputs(
  draft: SellerPresentationDraft,
): string[] {
  return getMissingRequiredInputs(draft).map(
    (key) => REQUIRED_INPUT_LABELS[key] ?? key,
  );
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
