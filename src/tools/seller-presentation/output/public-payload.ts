/**
 * Public-payload serializer (Substrate §3.4, §4, v1.47 / A6 + A7a + A7d.1 + A7d.2).
 *
 * The privacy boundary for the Seller Presentation made code. The
 * publish route calls `toPublicPayload` and passes ONLY the returned
 * object to `publishHandout`; the raw `SellerPresentationDraft`
 * NEVER reaches KV.
 *
 * A7d.1 subtraction: `editorialPhotoUrl`, `agentNote`, `trackRecord`,
 * and `buyerQuote` were removed from the draft, payload, and renderer.
 * The serializer no longer emits them; the boundary clamper drops them
 * even if a hand-edited KV record carried them in.
 *
 * A7d.2 relocation: curated reviews + the "see all on Zillow" outlink
 * are sourced from brand Settings via the new `brandReviews` arg —
 * NOT from the draft. The projector ignores any `reviews` /
 * `reviewsOutlink` keys still riding on a legacy draft (clampDraft
 * already drops them from the type), so old persisted instances
 * publish cleanly without leaking per-presentation content.
 *
 * Allowlist guarantee (proven by e2e/seller-presentation.publish-allowlist.spec.ts):
 * private fields stay private because every field is built by explicit
 * projection — never a spread.
 */

import type {
  AreaStats,
  AreaStatsMonthly,
  Comp,
  PresentationVideo,
  Review,
  ReviewsOutlink,
  SellerPresentationDraft,
  VideoFraming,
} from "../engine/types";
import { clampVideoFraming } from "../engine/types";
import { PUBLISH_TEMPLATE_VERSION } from "../config/template-version";
import { isPriceRangeActive } from "../engine/price-range";
import {
  deriveAreaStatsFromComps,
  mergeAreaStats,
} from "@/lib/seller-presentation/area-stats-from-comps";
import {
  WHYUS_CAPS,
  type WhyUs,
  type MarketingPoint,
  type PerformanceStat,
  type ProcessStep,
} from "@/lib/whyus";

// Re-export the public-safe locked-design types so consumers
// (publish route, A7b renderer, allowlist spec) can import from one
// place. These types are public-safe BY CONSTRUCTION — they describe
// what the wizard captures as agent-published content.
export type {
  AreaStats,
  AreaStatsMonthly,
  PresentationVideo,
  Review,
  ReviewsOutlink,
  VideoFraming,
};

/**
 * B0b — the public projection of the agent-constant "Why us" group.
 * Structurally identical to the Settings-side `WhyUs` (it is marketing
 * content the agent authored to be shown publicly), but it travels under
 * a distinct public name so the renderer + allowlist spec import the
 * public boundary, never the Settings model. Public-safe BY CONSTRUCTION:
 * every field is agent-authored "why list with us" copy, no private data.
 * The projection (`clampPublicWhyUs`) still re-validates types, re-applies
 * the soft caps, and drops un-renderable rows at BOTH the write and read
 * boundary — being "public" does NOT skip the allowlist clamp.
 */
export type { WhyUs as PublicWhyUs, MarketingPoint, PerformanceStat, ProcessStep };

/**
 * Agent-contact projection passed by the publish route (sourced from
 * `useBrandSettings` in StepReview today). A7a extends with the
 * locked-design fields (areasServed / photoUrl / bioShort /
 * yearsInArea / ctaReassurance) — all optional. Whether they come
 * from BrandSettings or per-presentation draft overrides is the
 * wizard's call (A7b/A7c). The serializer just maps what comes in.
 */
export interface AgentBranding {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  // ---- A7a locked-design extensions ----
  areasServed?: string;
  photoUrl?: string;
  bioShort?: string;
  yearsInArea?: string;
  ctaReassurance?: string;
  // ---- UX-2b repositionable headshot (pure CSS display transform) ----
  /**
   * Focal point for the headshot, as CSS object/background-position
   * percentages (0–100). Absent ⇒ centered (50/50); a centered value
   * renders byte-identical to the pre-UX-2b avatar. The image bytes are
   * never re-cropped — only how the existing photo sits in the circular
   * frame changes. Paired: both present or both absent after projection.
   */
  photoFocalX?: number;
  photoFocalY?: number;
  /** Display zoom (1.0–2.0). Absent / 1 ⇒ no zoom (byte-identical). */
  photoScale?: number;
}

/**
 * A7d.2 — brand-sourced reviews payload. Same provenance as
 * `AgentBranding`: read from BrandSettings, forwarded by the publish
 * route, projected field-by-field into the public payload. Kept as a
 * distinct input shape (instead of bolted onto AgentBranding) so the
 * agent block in the output payload stays scalar — reviews land at the
 * top level (`payload.reviews` + `payload.reviewsOutlink`) where the
 * renderer already reads them.
 */
export interface BrandReviewsInput {
  reviews?: Review[];
  reviewsOutlinkUrl?: string;
}

/**
 * A7d.2 — fixed label for the reviews outlink. Settings only collects
 * the URL; the renderer pairs it with this label to keep the seller
 * page copy on-brand and consistent across agents.
 */
export const REVIEWS_OUTLINK_LABEL = "See all reviews on Zillow";

/**
 * E.0 — brand colors input. Same provenance as `AgentBranding` /
 * `BrandReviewsInput`: read from BrandSettings on the client, forwarded
 * by the publish route, projected field-by-field into the public
 * payload. Wire-permissive (raw hex strings or undefined); the projector
 * validates each field and drops anything that isn't a 6-digit hex.
 */
export interface BrandColorsInput {
  brandBackground?: string;
  brandText?: string;
  brandAccent?: string;
  /** E.1 — optional secondary (decorative role); additive, field-by-field projected. */
  brandSecondary?: string;
}

/**
 * B0b — agent-constant "Why us" + tagline + reviews-headline input, same
 * provenance as `BrandReviewsInput` / `BrandColorsInput`: read from
 * BrandSettings on the client (set once in /settings), forwarded by the
 * publish route, projected field-by-field into the public payload. The
 * `whyUs` field is wire-permissive (`unknown`) — `clampPublicWhyUs`
 * coerces every field, re-applies the soft caps, and drops un-renderable
 * rows, so a tampered or legacy settings record can never smuggle an
 * unbounded list or a private key downstream.
 */
export interface BrandWhyUsInput {
  whyUs?: unknown;
  agentTagline?: string;
  reviewsHeadline?: string;
}

/**
 * E.0 — public projection of the three brand colors. The consumer
 * `/h/<slug>` page applies these as inline CSS custom properties
 * (`--brand-bg` / `--brand-text` / `--brand-accent`) on the page root.
 * Each field is independently optional: an undefined field falls through
 * to the consumer-page CSS `var()` fallback (the production Editorial
 * hex), so an unset brand renders byte-identical to today.
 */
export interface PublicBrandColors {
  background?: string;
  text?: string;
  accent?: string;
  /** E.1 — optional secondary. The consumer page runs it through the ramp engine (decorative role). */
  secondary?: string;
}

/**
 * Public projection of a comp. A7a trims the PUBLIC emit to exactly
 * `{address, soldPrice, soldDate, sqft}` per the locked design.
 * v1.47 Lane A polish: `yearBuilt` joins the public emit so the
 * consumer comp card can render the build-era signal.
 * The deprecated A6 keys stay on the type so the A6 functional
 * renderer keeps compiling (they're always undefined post-A7a; the
 * renderer's `&&` short-circuits and renders nothing for them).
 * The spec proves no comp's JSON output ever carries an A6
 * deprecated key.
 */
export interface PublicComp {
  address: string;
  soldPrice: string;
  // ---- A7a locked-design emit set ----
  soldDate?: string;
  sqft?: string;
  yearBuilt?: number;
  /**
   * COMP_PHOTOS (flag-gated) — per-comp home photo. The flagship comp card
   * renders a photo when one is available and a clean text-only card when not
   * (the slot flexes in/out). `photoUrl` is the AGENT's own uploaded image
   * (camera roll -> Blob) and takes precedence at render. `projectComp`
   * populates these ONLY when the flag is on (off => byte-identical to today).
   */
  photoUrl?: string;
  /**
   * Street View coverage for the comp's address — the ONLY Google IMAGERY data
   * we persist. The renderer requests the IMAGE fresh from Google at view time
   * by `streetViewPanoId`; the bytes are never stored/proxied. `hasStreetView`
   * gates whether a Street View photo is shown at all.
   */
  streetViewPanoId?: string;
  hasStreetView?: boolean;
  /**
   * Camera aiming data. `streetViewHeading` (a derived compass bearing 0–360,
   * pano -> house) points the Static image at the home; the renderer passes it
   * through. `houseLat`/`houseLng` are the resolved home coordinates — storable
   * under Google's terms (lat/lng is not imagery). NO raw geocode payload is
   * ever emitted, only these clamped numbers.
   */
  streetViewHeading?: number;
  houseLat?: number;
  houseLng?: number;
  // ---- A6 deprecated — never populated by toPublicPayload post-A7a.
  //      Type kept for A6 functional renderer back-compat ONLY.
  /** @deprecated A7a removed from public emit. Will be removed once A7b ships. */
  daysOnMarket?: string;
  /** @deprecated */
  saleToListPercent?: string;
  /** @deprecated */
  squareFeet?: string;
  /** @deprecated */
  distanceMiles?: string;
}

/** A7a — locked-design pitch-point card with title + supporting copy. */
export interface PublicPitchCard {
  title: string;
  /** Empty string when the agent left support blank. Renderer handles. */
  support: string;
}

/** A7a — grouped property block matching the locked design. */
export interface PublicProperty {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  heroPhotoUrl?: string;
  recommendedList: string;
  /**
   * UX-2a — optional recommended-price RANGE. Present (both set) ONLY when
   * the agent entered a low–high range; absent otherwise, so a single-price
   * payload is byte-identical to today. When set, the hero renders
   * "$low – $high" (static, no count-up) and the area-chart chip reads the
   * midpoint. `recommendedList` stays the single value for the count-up path
   * and back-compat; it may be empty when the agent gave only a range.
   */
  recommendedListLow?: string;
  recommendedListHigh?: string;
  rationaleShort?: string;
}

/** A7a — grouped why-this-price block. */
export interface PublicWhyPrice {
  publicRationale: string;
  comps: PublicComp[];
}

export interface PublicPayload {
  /**
   * Flagship-rollout discriminator (F1). Absent on every already-published
   * slug → the renderer treats "missing" as v1, so old pages keep the current
   * look forever. New publishes carry `PUBLISH_TEMPLATE_VERSION`. The read
   * clamp coerces anything that isn't exactly `2` back to `1`.
   */
  templateVersion?: 1 | 2;

  /**
   * F4 — white-label flag. When `true`, the flagship footer drops the
   * "Studio SEP" wordmark slot (the disclaimer always stays). Sourced at
   * publish from the entitlement resolver's `whiteLabel` capability (false
   * for every access mode today). Absent / non-`true` → wordmark shows.
   * The read clamp lets ONLY a literal boolean `true` through.
   */
  suppressWordmark?: boolean;

  // ---- A6 flat fields (kept for the A6 functional renderer) ----
  propertyAddress: string;
  propertyCity?: string;
  recommendedPrice: string;
  priceRationale?: string;
  comps: PublicComp[];
  agentBranding: AgentBranding;
  pitchPublicPoints: string[];

  // ---- A7a locked-design grouped fields ----
  property: PublicProperty;
  preparedFor?: string;
  video?: PresentationVideo;
  whyPrice: PublicWhyPrice;
  pitchPublicCards: PublicPitchCard[];
  reviews?: Review[];
  reviewsOutlink?: ReviewsOutlink;
  areaStats?: AreaStats;
  /** Same projection as `agentBranding` — the locked-design renderer reads `agent`. */
  agent: AgentBranding;

  // ---- E.0 brand colors (consumer page applies as CSS custom props) ----
  /** Undefined when no brand color was set — the consumer CSS falls back to the Editorial defaults. */
  brandColors?: PublicBrandColors;

  // ---- B0b agent-constant "Why us" marketing layer (v2 renderer only) ----
  /**
   * The pre-listing "why list with us" package, snapshotted from brand
   * Settings at publish time. Undefined when the agent never configured it
   * OR nothing renderable survived the clamp — the v2 Why-us section then
   * hides cleanly (flex). Rendered ONLY by `templateVersion === 2`; v1 slugs
   * ignore it, so an unset/v1 payload is byte-identical to today.
   */
  whyUs?: WhyUs;
  /** B0b — optional agent tagline, surfaced near the agent identity. Absent → unchanged. */
  agentTagline?: string;
  /** B0b — optional headline for the reviews block (overrides the default lead when set). */
  reviewsHeadline?: string;

  /**
   * PREVIEW-ONLY honest-sample marker. The wizard live preview keeps the
   * By-the-numbers band visible even before the agent fills their track record
   * (Dallen: "it looks good, keep it"), showing SAMPLE figures behind a
   * "Sample" tag so they read as an example, never the agent's real data. Set
   * ONLY by `draftPreviewPayload`; the publish path never writes it, so the
   * published page is byte-identical (the tag never renders) and an empty
   * track record still hides the band there.
   */
  whyUsStatsSample?: boolean;
}

/**
 * E.0 — strict 6-digit hex validator (defense-at-boundary). Anything
 * that isn't a `#rrggbb` string is rejected, so a malformed or tampered
 * value never reaches the consumer page's inline `style`.
 */
function isValidHex(value: string | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * E.0 — project the brand colors field-by-field. Each color is validated
 * independently; invalid / absent fields are simply omitted (the
 * consumer CSS `var()` fallback then fires for that channel). Returns
 * undefined when nothing valid survives, so an unset brand emits no
 * `brandColors` key at all (cohort-safe — the page renders today's
 * Editorial palette via the CSS fallbacks).
 */
function projectBrandColors(
  input: BrandColorsInput,
): PublicBrandColors | undefined {
  const out: PublicBrandColors = {};
  if (isValidHex(input.brandBackground)) out.background = input.brandBackground;
  if (isValidHex(input.brandText)) out.text = input.brandText;
  if (isValidHex(input.brandAccent)) out.accent = input.brandAccent;
  if (isValidHex(input.brandSecondary)) out.secondary = input.brandSecondary;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build the PUBLIC projection of a comp. Explicitly enumerates the
 * fields that go out — exactly 4 keys per the A7a locked design:
 * address, soldPrice, soldDate, sqft. Everything else stays private
 * (notes, source, fieldConfidence) or was deprecated from public emit
 * in A7a (daysOnMarket, saleToListPercent, squareFeet, distanceMiles).
 *
 * If a private field is added to `Comp` in the future, it stays
 * private by default — only an edit to this function (and the
 * corresponding spec assertion) opens the gate.
 */
function projectComp(comp: Comp, compPhotos: boolean): PublicComp {
  return {
    address: comp.address,
    soldPrice: comp.soldPrice,
    soldDate: comp.soldDate,
    sqft: comp.squareFeet, // rename: draft uses `squareFeet`, public uses `sqft` per locked design
    yearBuilt:
      typeof comp.yearBuilt === "number" && Number.isFinite(comp.yearBuilt)
        ? comp.yearBuilt
        : undefined,
    // COMP_PHOTOS — only opened when the flag is on. Keys are added ONLY when
    // there's actual photo data (manual upload, or resolved Street View
    // coverage), so a flag-on draft with no photos stays byte-identical to a
    // flag-off publish. Manual `photoUrl` and the Street View pano are carried
    // independently; the renderer applies manual-over-Street-View precedence.
    ...(compPhotos ? projectCompPhotoFields(comp) : {}),
  };
}

/**
 * The COMP_PHOTOS allowlist for one comp. Returns ONLY the keys that have a
 * value, so undefined never widens the public shape. Compliance: only the
 * pano id + coverage flag are emitted for Street View — never an image URL,
 * never any other Google datum.
 */
type CompPhotoFields = Pick<
  PublicComp,
  | "photoUrl"
  | "streetViewPanoId"
  | "hasStreetView"
  | "streetViewHeading"
  | "houseLat"
  | "houseLng"
>;

function projectCompPhotoFields(comp: Comp): CompPhotoFields {
  const out: CompPhotoFields = {};
  const manual =
    typeof comp.photoUrl === "string" && comp.photoUrl.trim()
      ? comp.photoUrl.trim()
      : undefined;
  if (manual) out.photoUrl = manual;
  const pano =
    typeof comp.streetViewPanoId === "string" && comp.streetViewPanoId.trim()
      ? comp.streetViewPanoId.trim()
      : undefined;
  if (pano) out.streetViewPanoId = pano;
  // Emit the coverage flag whenever it has been RESOLVED (true or false) so
  // "checked, no coverage" (false) is distinct from "not yet resolved"
  // (undefined, never emitted). Off-flag and unresolved comps stay key-free.
  if (typeof comp.hasStreetView === "boolean") {
    out.hasStreetView = comp.hasStreetView;
  }
  // Aiming data — clamped + only added when valid, so an unaimed comp (no
  // geocode) stays key-free. heading is normalized to [0,360); lat/lng to
  // their geographic ranges. NO raw geocode payload is ever projected.
  const heading = clampHeading(comp.streetViewHeading);
  if (heading !== undefined) out.streetViewHeading = heading;
  const houseLat = clampLat(comp.houseLat);
  if (houseLat !== undefined) out.houseLat = houseLat;
  const houseLng = clampLng(comp.houseLng);
  if (houseLng !== undefined) out.houseLng = houseLng;
  return out;
}

/**
 * COMP_PHOTOS aiming clamps (defense-at-boundary). A heading is normalized
 * into [0,360); lat/lng are validated to their geographic ranges. Anything
 * non-finite / out-of-range → undefined, so a tampered draft or KV record
 * drops the field and the comp renders at the default heading rather than an
 * off-axis or invalid one.
 */
function clampHeading(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  // Already-in-range values pass through unchanged (no modulo drift); only
  // out-of-range bearings are wrapped into [0,360).
  if (value >= 0 && value < 360) return value;
  return ((value % 360) + 360) % 360;
}
function clampLat(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
    ? value
    : undefined;
}
function clampLng(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
    ? value
    : undefined;
}

/**
 * Project a public-visibility pitch point into the locked-design
 * card shape. Falls back to the A5b legacy `text` field when the
 * newer `title` isn't set (older drafts pre-date the rename).
 * Drops points with no usable title text — they have no rendering
 * content.
 */
function projectPitchCard(p: {
  title?: string;
  text?: string;
  support?: string;
}): PublicPitchCard | null {
  const title = (p.title ?? p.text ?? "").trim();
  if (!title) return null;
  return {
    title,
    support: p.support ?? "",
  };
}

function projectPresentationVideo(
  v: PresentationVideo | undefined,
): PresentationVideo | undefined {
  if (!v) return undefined;
  // Explicit field-by-field projection — a future rogue field on a
  // hand-tampered draft would otherwise leak through a spread.
  return {
    posterUrl: v.posterUrl,
    scrubPosterUrl: v.scrubPosterUrl,
    autoPosterUrl: v.autoPosterUrl,
    videoUrl: v.videoUrl,
    title: v.title,
    runtime: v.runtime,
    recordedOn: v.recordedOn,
    // P2-VIDEO-2 — re-clamp the numeric framing at the write boundary
    // (object-position 0–100, scale 1–3) so a tampered draft can't inject
    // an out-of-range crop into the published page.
    framing: clampVideoFraming(v.framing),
  };
}

function projectReview(r: unknown): Review | null {
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const body = typeof rec.body === "string" ? rec.body : "";
  const attributionName =
    typeof rec.attributionName === "string" ? rec.attributionName : "";
  if (!body.trim() || !attributionName.trim()) return null;
  return {
    body,
    attributionName,
    attributionYear:
      typeof rec.attributionYear === "string" && rec.attributionYear.length > 0
        ? rec.attributionYear
        : undefined,
    attributionStreet:
      typeof rec.attributionStreet === "string" &&
      rec.attributionStreet.length > 0
        ? rec.attributionStreet
        : undefined,
  };
}

/**
 * A7d.2 — build the outlink object from a single URL string. The label
 * is fixed (REVIEWS_OUTLINK_LABEL) so Settings only needs the URL.
 * Returns undefined when the URL is empty / non-string so the renderer
 * hides the outlink anchor cleanly.
 */
function projectBrandReviewsOutlink(
  url: string | undefined,
): ReviewsOutlink | undefined {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return { label: REVIEWS_OUTLINK_LABEL, url: trimmed };
}

function projectAreaStats(
  s: AreaStats | undefined,
  comps: Comp[],
): AreaStats | undefined {
  // FR-2 — auto-fill the snapshot from the comp set, then let any
  // manually-entered field override the derived one. `mergeAreaStats`
  // returns undefined when neither comps nor manual entry yield anything
  // renderable, so the empty case still collapses to no §05 (LS-1).
  const merged = mergeAreaStats(s, deriveAreaStatsFromComps(comps));
  if (!merged) return undefined;
  const monthlySeries = merged.monthlySeries?.map((m) => ({
    month: m.month,
    medianPrice: m.medianPrice,
  }));
  const projected: AreaStats = {
    medianSale: merged.medianSale,
    medianSaleDeltaYoy: merged.medianSaleDeltaYoy,
    daysOnMarket: merged.daysOnMarket,
    daysOnMarketZipAvg: merged.daysOnMarketZipAvg,
    closings90d: merged.closings90d,
    listToSaleRatio: merged.listToSaleRatio,
    monthlySeries: monthlySeries?.length ? monthlySeries : undefined,
  };
  // LS-1 — data minimization: an "edited but left blank" snapshot arrives as an
  // all-undefined object (the StepEditorial editor seeds `draft.areaStats = {}`).
  // Keep it OUT of the at-rest public record entirely rather than writing an
  // empty husk that the read clamp would later collapse anyway. Mirrors
  // clampAreaStats's final emptiness check, so the renderer's flex-out and the
  // serialized payload agree: no snapshot data → no areaStats field.
  return Object.values(projected).some((v) => v !== undefined)
    ? projected
    : undefined;
}

/**
 * UX-2b — headshot focal/scale clamps (defense-at-boundary). Mirror the
 * Settings-side bounds: focal is a finite [0,100] percentage, scale a finite
 * [1,2] zoom. Anything else → undefined, so a tampered draft / KV record
 * collapses to "centered, no zoom" rather than rendering an off-frame photo.
 */
function clampHeadshotPct(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : undefined;
}
function clampHeadshotScale(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 2
    ? value
    : undefined;
}

function projectAgent(agent: AgentBranding): AgentBranding {
  // Explicit field-by-field projection — never spread an agent record
  // unverified, so a future agent-side field doesn't accidentally leak.
  return {
    name: agent.name,
    brokerage: agent.brokerage,
    phone: agent.phone,
    email: agent.email,
    licenseNumber: agent.licenseNumber,
    areasServed: agent.areasServed,
    photoUrl: agent.photoUrl,
    bioShort: agent.bioShort,
    yearsInArea: agent.yearsInArea,
    ctaReassurance: agent.ctaReassurance,
    // UX-2b — clamped at projection; undefined values are dropped by
    // JSON.stringify, so an un-repositioned agent emits no focal/scale keys
    // and the published record is byte-identical to a pre-UX-2b publish.
    photoFocalX: clampHeadshotPct(agent.photoFocalX),
    photoFocalY: clampHeadshotPct(agent.photoFocalY),
    photoScale: clampHeadshotScale(agent.photoScale),
  };
}

/** B0b — string coerce mirroring the whyus.ts boundary (non-strings → ""). */
function whyUsStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * B0b — project ONE marketing point. A row needs a title to render (it's a
 * titled row); a detail-only in-progress row from Settings has no heading to
 * show, so it drops. Field-by-field — never spread the source row.
 */
function projectPublicMarketingPoint(item: unknown): MarketingPoint | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const title = whyUsStr(r.title);
  if (!title.trim()) return null;
  const detail = whyUsStr(r.detail);
  return detail.trim() ? { title, detail } : { title };
}

/**
 * B0b — project ONE performance stat. Renderable ONLY with a label AND a
 * value: the arrives-done skeleton rows (pre-labeled, blank `yourValue`) the
 * agent never filled are DROPPED here at the data-out boundary so the payload
 * carries only stats the section can actually draw. `marketValue` / `unit`
 * survive only when non-empty.
 */
function projectPublicPerformanceStat(item: unknown): PerformanceStat | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const label = whyUsStr(r.label);
  const yourValue = whyUsStr(r.yourValue);
  if (!label.trim() || !yourValue.trim()) return null;
  const out: PerformanceStat = { label, yourValue };
  const marketValue = whyUsStr(r.marketValue);
  if (marketValue.trim()) out.marketValue = marketValue;
  const unit = whyUsStr(r.unit);
  if (unit.trim()) out.unit = unit;
  return out;
}

/** B0b — project ONE process step. Needs a `step` heading to render. */
function projectPublicProcessStep(item: unknown): ProcessStep | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const step = whyUsStr(r.step);
  if (!step.trim()) return null;
  const detail = whyUsStr(r.detail);
  return detail.trim() ? { step, detail } : { step };
}

/** B0b — clamp + project a list, hard-capping at its soft cap. */
function projectPublicWhyUsList<T>(
  raw: unknown,
  cap: number,
  project: (item: unknown) => T | null,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (out.length >= cap) break;
    const projected = project(item);
    if (projected !== null) out.push(projected);
  }
  return out;
}

/**
 * B0b — the public "Why us" allowlist boundary, used at BOTH ends: the
 * publish-time projection (`toPublicPayload`) and the read-time clamp
 * (`clampPublicPayload`). Coerces every field, hard-clamps each list to its
 * soft cap, and drops un-renderable rows. Returns `undefined` when nothing
 * renderable survives so the v2 Why-us section hides cleanly (flex) and the
 * payload carries no empty `whyUs` husk. Never spreads a sub-record — each
 * field is built by explicit projection, so a tampered settings record with
 * extra nested keys cannot leak through.
 */
export function clampPublicWhyUs(raw: unknown): WhyUs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const differentiators = projectPublicWhyUsList<string>(
    r.differentiators,
    WHYUS_CAPS.differentiators,
    (item) => {
      const v = whyUsStr(item);
      return v.trim() ? v : null;
    },
  );
  const marketingApproach = projectPublicWhyUsList(
    r.marketingApproach,
    WHYUS_CAPS.marketingApproach,
    projectPublicMarketingPoint,
  );
  const performanceStats = projectPublicWhyUsList(
    r.performanceStats,
    WHYUS_CAPS.performanceStats,
    projectPublicPerformanceStat,
  );
  const howWeWork = projectPublicWhyUsList(
    r.howWeWork,
    WHYUS_CAPS.howWeWork,
    projectPublicProcessStep,
  );
  const guarantee = whyUsStr(r.guarantee).trim()
    ? whyUsStr(r.guarantee)
    : undefined;

  if (
    differentiators.length === 0 &&
    marketingApproach.length === 0 &&
    performanceStats.length === 0 &&
    howWeWork.length === 0 &&
    !guarantee
  ) {
    return undefined;
  }

  const out: WhyUs = {
    differentiators,
    marketingApproach,
    performanceStats,
    howWeWork,
  };
  if (guarantee) out.guarantee = guarantee;
  return out;
}

/** B0b — trim-or-undefined for the scalar tagline / reviews-headline fields. */
function projectPublicWhyUsText(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Build the public payload from a raw draft + the agent's contact
 * card + the agent's curated reviews. Pure — same inputs always
 * produce the same payload out.
 *
 * `brandReviews` is the A7d.2 input that carries the agent-constant
 * reviews + outlink URL sourced from BrandSettings (the wizard no
 * longer captures these per-presentation). The projector reads them
 * from this arg ONLY — any `reviews` / `reviewsOutlink` keys riding
 * on a legacy draft are ignored.
 *
 * The publish route MAY merge per-presentation agent overrides
 * (draft.agentAreasServed etc.) into the incoming `agentContact`
 * before calling this — that's the wizard layer's responsibility.
 * Here we just project what we receive.
 */
export function toPublicPayload(
  draft: SellerPresentationDraft,
  agentContact: AgentBranding,
  brandReviews: BrandReviewsInput = {},
  brandColors: BrandColorsInput = {},
  // F4 — white-label capability from the entitlement resolver (false for every
  // access mode today). Only a literal `true` projects `suppressWordmark`;
  // anything else omits the field, so today's publishes stay byte-identical.
  whiteLabel: boolean = false,
  // B0b — agent-constant "Why us" + tagline + reviews-headline, snapshotted
  // from BrandSettings. Wire-permissive; projected/clamped field-by-field.
  // Appended last so every existing call site stays valid.
  brandWhyUs: BrandWhyUsInput = {},
  // COMP_PHOTOS — the per-comp photo kill switch. OFF by default so every
  // existing call site (and every flag-off publish) stays byte-identical:
  // when false, `projectComp` emits no photo/Street-View keys at all.
  compPhotos: boolean = false,
): PublicPayload {
  const propertyAddress = draft.propertyAddress ?? "";
  const recommendedPrice = draft.recommendedPrice ?? "";
  // UX-2a — project the optional low–high range ONLY when both sides are set,
  // so a single-price draft stays byte-identical (the keys are OMITTED, not
  // set to undefined — the property block is literally what it was pre-UX-2a).
  const recommendedRange = isPriceRangeActive(
    draft.recommendedPriceLow,
    draft.recommendedPriceHigh,
  )
    ? {
        recommendedListLow: draft.recommendedPriceLow,
        recommendedListHigh: draft.recommendedPriceHigh,
      }
    : {};
  const priceRationale = draft.priceRationale;

  // Phase B2 — set-aside comps (counted === false) stay on the prep
  // draft for the agent's reference but never reach the seller page.
  // Default-to-counted: undefined/true comps are included. Filter
  // BEFORE projection so the `counted` authoring flag never even
  // reaches projectComp (which emits the allowlisted public shape).
  const publicComps = draft.comps
    .filter((c) => c.counted !== false)
    .map((c) => projectComp(c, compPhotos));
  const publicCards = draft.pitchPoints
    .filter((p) => p.visibility === "public")
    .map(projectPitchCard)
    .filter((c): c is PublicPitchCard => c !== null);
  const publicTitleStrings = publicCards.map((c) => c.title);
  const agent = projectAgent(agentContact);

  // A7d.2 — reviews + outlink come from BrandSettings, not the draft.
  // Project field-by-field (no spread) so a tampered settings record
  // with extra nested keys can't leak through the boundary.
  const projectedReviews = Array.isArray(brandReviews.reviews)
    ? brandReviews.reviews
        .map(projectReview)
        .filter((r): r is Review => r !== null)
    : undefined;
  const projectedOutlink = projectBrandReviewsOutlink(
    brandReviews.reviewsOutlinkUrl,
  );

  // B0b — snapshot the "Why us" marketing layer through the same allowlist
  // boundary the renderer reads back (`clampPublicWhyUs`), so the projected
  // payload is byte-identical whether built at publish or re-clamped on read.
  const projectedWhyUs = clampPublicWhyUs(brandWhyUs.whyUs);
  const projectedTagline = projectPublicWhyUsText(brandWhyUs.agentTagline);
  const projectedReviewsHeadline = projectPublicWhyUsText(
    brandWhyUs.reviewsHeadline,
  );

  return {
    // F1 — stamp the publish-time template version. F1 keeps every publish on
    // v1 (PUBLISH_TEMPLATE_VERSION === 1); F3 flips the constant to start
    // shipping the flagship template to new publishes.
    templateVersion: PUBLISH_TEMPLATE_VERSION,

    // F4 — project ONLY when whiteLabel is literally true; omit otherwise so
    // an unentitled publish carries no `suppressWordmark` key at all.
    suppressWordmark: whiteLabel === true ? true : undefined,

    // ---- A6 flat fields ----
    propertyAddress,
    propertyCity: draft.propertyCity,
    recommendedPrice,
    priceRationale,
    comps: publicComps,
    agentBranding: agent,
    pitchPublicPoints: publicTitleStrings,

    // ---- A7a locked-design grouped fields ----
    property: {
      address: propertyAddress,
      city: draft.propertyCity,
      state: draft.propertyState,
      zip: draft.propertyZip,
      heroPhotoUrl: draft.heroPhotoUrl,
      recommendedList: recommendedPrice,
      ...recommendedRange,
      rationaleShort: priceRationale,
    },
    preparedFor: draft.preparedFor,
    video: projectPresentationVideo(draft.video),
    whyPrice: {
      publicRationale: priceRationale ?? "",
      comps: publicComps,
    },
    pitchPublicCards: publicCards,
    reviews: projectedReviews && projectedReviews.length ? projectedReviews : undefined,
    reviewsOutlink: projectedOutlink,
    areaStats: projectAreaStats(draft.areaStats, draft.comps),
    agent,

    // E.0 — brand colors validated + projected field-by-field. Undefined
    // when nothing valid was supplied, so the consumer page falls back to
    // the production Editorial palette via its CSS var() cascade.
    brandColors: projectBrandColors(brandColors),

    // B0b — the "Why us" marketing layer. Undefined when never configured /
    // nothing renderable; the v2 section flexes out and v1 ignores it.
    whyUs: projectedWhyUs,
    agentTagline: projectedTagline,
    reviewsHeadline: projectedReviewsHeadline,
  };
}

/**
 * Defense-at-boundary helper for the consumer page renderer. When
 * `/h/[slug]` loads a HandoutRecord whose `data` was serialized by
 * `toPublicPayload`, the renderer calls `clampPublicPayload` to
 * coerce the unknown JSON into a typed shape. Any rogue keys (e.g.
 * if a record was hand-edited in KV with private fields glued on)
 * are silently dropped — the renderer never sees them.
 *
 * A7a additions: clamps every new grouped block. Each optional
 * block returns undefined when the source raw record doesn't carry
 * it cleanly — never a half-populated object.
 */
export function clampPublicPayload(raw: unknown): PublicPayload {
  if (!raw || typeof raw !== "object") {
    return emptyPayload();
  }
  const r = raw as Record<string, unknown>;
  const propertyAddress =
    typeof r.propertyAddress === "string" ? r.propertyAddress : "";
  const propertyCity =
    typeof r.propertyCity === "string" ? r.propertyCity : undefined;
  const recommendedPrice =
    typeof r.recommendedPrice === "string" ? r.recommendedPrice : "";
  const priceRationale =
    typeof r.priceRationale === "string" ? r.priceRationale : undefined;

  const comps = Array.isArray(r.comps)
    ? r.comps.map(clampPublicComp).filter((c): c is PublicComp => c !== null)
    : [];

  const agent = clampAgentBranding(r.agent ?? r.agentBranding);

  return {
    // F1 — template-version clamp at the trust boundary. This payload is stored
    // in KV and could be hand-edited/tampered, so coerce to v1 unless the value
    // is EXACTLY the number 2. Tampered / absent (old slugs) / any other value
    // → 1, which renders today's look.
    templateVersion: r.templateVersion === 2 ? 2 : 1,
    // F4 — clamp at the trust boundary: ONLY a literal boolean `true` passes.
    // A tampered string "true" / 1 / anything else → undefined (wordmark shows).
    suppressWordmark: r.suppressWordmark === true ? true : undefined,
    propertyAddress,
    propertyCity,
    recommendedPrice,
    priceRationale,
    comps,
    agentBranding: agent,
    pitchPublicPoints: Array.isArray(r.pitchPublicPoints)
      ? r.pitchPublicPoints.filter((t): t is string => typeof t === "string")
      : [],

    property: clampPublicProperty(r.property, {
      address: propertyAddress,
      city: propertyCity,
      recommendedList: recommendedPrice,
      rationaleShort: priceRationale,
    }),
    preparedFor: typeof r.preparedFor === "string" ? r.preparedFor : undefined,
    video: clampPresentationVideo(r.video),
    whyPrice: clampPublicWhyPrice(r.whyPrice, {
      publicRationale: priceRationale ?? "",
      comps,
    }),
    pitchPublicCards: Array.isArray(r.pitchPublicCards)
      ? r.pitchPublicCards
          .map(clampPublicPitchCard)
          .filter((c): c is PublicPitchCard => c !== null)
      : [],
    reviews: Array.isArray(r.reviews)
      ? r.reviews.map(clampReview).filter((rev): rev is Review => rev !== null)
      : undefined,
    reviewsOutlink: clampReviewsOutlink(r.reviewsOutlink),
    areaStats: clampAreaStats(r.areaStats),
    agent,
    brandColors: clampBrandColors(r.brandColors),
    // B0b — re-clamp the "Why us" layer at the read boundary (same allowlist
    // the projector used at publish), so a hand-edited KV record can't smuggle
    // an unbounded list or a private key into the renderer.
    whyUs: clampPublicWhyUs(r.whyUs),
    agentTagline: projectPublicWhyUsText(r.agentTagline),
    reviewsHeadline: projectPublicWhyUsText(r.reviewsHeadline),
  };
}

/**
 * E.0 — defense-at-boundary clamp for the public brand colors. Reads the
 * already-projected public shape (`{background, text, accent}`) from a KV
 * record, re-validating each field as a 6-digit hex. Returns undefined
 * when nothing valid survives so the renderer treats "no brand colors"
 * as a single state (CSS var() fallbacks fire).
 */
function clampBrandColors(raw: unknown): PublicBrandColors | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: PublicBrandColors = {};
  if (typeof r.background === "string" && isValidHex(r.background))
    out.background = r.background;
  if (typeof r.text === "string" && isValidHex(r.text)) out.text = r.text;
  if (typeof r.accent === "string" && isValidHex(r.accent)) out.accent = r.accent;
  if (typeof r.secondary === "string" && isValidHex(r.secondary))
    out.secondary = r.secondary;
  return Object.keys(out).length > 0 ? out : undefined;
}

function emptyPayload(): PublicPayload {
  return {
    templateVersion: 1,
    propertyAddress: "",
    recommendedPrice: "",
    comps: [],
    agentBranding: {},
    pitchPublicPoints: [],
    property: { address: "", recommendedList: "" },
    whyPrice: { publicRationale: "", comps: [] },
    pitchPublicCards: [],
    agent: {},
  };
}

function clampPublicComp(raw: unknown): PublicComp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.address !== "string" || typeof r.soldPrice !== "string") {
    return null;
  }
  // Only the A7a locked-design keys are populated on read — deprecated
  // keys (daysOnMarket / saleToListPercent / squareFeet / distanceMiles)
  // are intentionally ignored even if present in the source record.
  const out: PublicComp = {
    address: r.address,
    soldPrice: r.soldPrice,
    soldDate: typeof r.soldDate === "string" ? r.soldDate : undefined,
    sqft: typeof r.sqft === "string" ? r.sqft : undefined,
    yearBuilt:
      typeof r.yearBuilt === "number" && Number.isFinite(r.yearBuilt)
        ? r.yearBuilt
        : undefined,
  };
  // COMP_PHOTOS — re-clamp the photo fields at the read boundary so a
  // hand-edited KV record can't smuggle a non-string photo through. Added
  // ONLY when present (their presence in the stored record already reflects
  // the publish-time flag), so a no-photo record stays shape-identical. We
  // re-validate that `streetViewPanoId` is a string (the only Google datum we
  // ever persist); no image URL is read back here.
  const manual =
    typeof r.photoUrl === "string" && r.photoUrl.trim() ? r.photoUrl : undefined;
  if (manual) out.photoUrl = manual;
  const pano =
    typeof r.streetViewPanoId === "string" && r.streetViewPanoId.trim()
      ? r.streetViewPanoId
      : undefined;
  if (pano) out.streetViewPanoId = pano;
  if (typeof r.hasStreetView === "boolean") out.hasStreetView = r.hasStreetView;
  // Re-clamp the aiming data at the read boundary so a hand-edited KV record
  // can't smuggle an off-range heading/coordinate into the render URL.
  const heading = clampHeading(r.streetViewHeading);
  if (heading !== undefined) out.streetViewHeading = heading;
  const houseLat = clampLat(r.houseLat);
  if (houseLat !== undefined) out.houseLat = houseLat;
  const houseLng = clampLng(r.houseLng);
  if (houseLng !== undefined) out.houseLng = houseLng;
  return out;
}

function clampPublicPitchCard(raw: unknown): PublicPitchCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string") return null;
  return {
    title: r.title,
    support: typeof r.support === "string" ? r.support : "",
  };
}

function clampAgentBranding(raw: unknown): AgentBranding {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    brokerage: typeof r.brokerage === "string" ? r.brokerage : undefined,
    phone: typeof r.phone === "string" ? r.phone : undefined,
    email: typeof r.email === "string" ? r.email : undefined,
    licenseNumber:
      typeof r.licenseNumber === "string" ? r.licenseNumber : undefined,
    areasServed:
      typeof r.areasServed === "string" ? r.areasServed : undefined,
    photoUrl: typeof r.photoUrl === "string" ? r.photoUrl : undefined,
    bioShort: typeof r.bioShort === "string" ? r.bioShort : undefined,
    yearsInArea:
      typeof r.yearsInArea === "string" ? r.yearsInArea : undefined,
    ctaReassurance:
      typeof r.ctaReassurance === "string" ? r.ctaReassurance : undefined,
    // UX-2b — re-clamp the display transform at the read boundary too, so a
    // hand-edited KV record can't smuggle an off-range focal/scale.
    photoFocalX: clampHeadshotPct(r.photoFocalX),
    photoFocalY: clampHeadshotPct(r.photoFocalY),
    photoScale: clampHeadshotScale(r.photoScale),
  };
}

function clampPublicProperty(
  raw: unknown,
  fallback: PublicProperty,
): PublicProperty {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  return {
    address: typeof r.address === "string" ? r.address : fallback.address,
    city: typeof r.city === "string" ? r.city : fallback.city,
    state: typeof r.state === "string" ? r.state : undefined,
    zip: typeof r.zip === "string" ? r.zip : undefined,
    heroPhotoUrl:
      typeof r.heroPhotoUrl === "string" ? r.heroPhotoUrl : undefined,
    recommendedList:
      typeof r.recommendedList === "string"
        ? r.recommendedList
        : fallback.recommendedList,
    // UX-2a — keep the range strictly paired: both strings or neither, so a
    // tampered/half-present range never renders a lopsided "$X – ".
    ...(typeof r.recommendedListLow === "string" &&
    typeof r.recommendedListHigh === "string" &&
    r.recommendedListLow.trim() &&
    r.recommendedListHigh.trim()
      ? {
          recommendedListLow: r.recommendedListLow,
          recommendedListHigh: r.recommendedListHigh,
        }
      : {}),
    rationaleShort:
      typeof r.rationaleShort === "string"
        ? r.rationaleShort
        : fallback.rationaleShort,
  };
}

function clampPublicWhyPrice(
  raw: unknown,
  fallback: PublicWhyPrice,
): PublicWhyPrice {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  return {
    publicRationale:
      typeof r.publicRationale === "string"
        ? r.publicRationale
        : fallback.publicRationale,
    comps: Array.isArray(r.comps)
      ? r.comps.map(clampPublicComp).filter((c): c is PublicComp => c !== null)
      : fallback.comps,
  };
}

function clampPresentationVideo(raw: unknown): PresentationVideo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const video: PresentationVideo = {
    posterUrl: typeof r.posterUrl === "string" ? r.posterUrl : undefined,
    scrubPosterUrl:
      typeof r.scrubPosterUrl === "string" ? r.scrubPosterUrl : undefined,
    autoPosterUrl:
      typeof r.autoPosterUrl === "string" ? r.autoPosterUrl : undefined,
    videoUrl: typeof r.videoUrl === "string" ? r.videoUrl : undefined,
    title: typeof r.title === "string" ? r.title : undefined,
    runtime: typeof r.runtime === "string" ? r.runtime : undefined,
    recordedOn: typeof r.recordedOn === "string" ? r.recordedOn : undefined,
    framing: clampVideoFraming(r.framing),
  };
  return Object.values(video).some((v) => v !== undefined) ? video : undefined;
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
    medianSale: typeof r.medianSale === "string" ? r.medianSale : undefined,
    medianSaleDeltaYoy:
      typeof r.medianSaleDeltaYoy === "string"
        ? r.medianSaleDeltaYoy
        : undefined,
    daysOnMarket:
      typeof r.daysOnMarket === "string" ? r.daysOnMarket : undefined,
    daysOnMarketZipAvg:
      typeof r.daysOnMarketZipAvg === "string"
        ? r.daysOnMarketZipAvg
        : undefined,
    closings90d: typeof r.closings90d === "string" ? r.closings90d : undefined,
    listToSaleRatio:
      typeof r.listToSaleRatio === "string" ? r.listToSaleRatio : undefined,
    monthlySeries: monthlySeries?.length ? monthlySeries : undefined,
  };
  return Object.values(stats).some((v) => v !== undefined) ? stats : undefined;
}

function clampAreaStatsMonthly(raw: unknown): AreaStatsMonthly | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.month !== "string" || typeof r.medianPrice !== "string") {
    return null;
  }
  return { month: r.month, medianPrice: r.medianPrice };
}

// ===========================================================================
// B0c — standalone pre-listing page payload (agent-constant ONLY).
//
// The durable "why list with us" page the agent texts BEFORE the appointment.
// It carries NONE of the listing-specific data the seller page does — no
// property, comps, recommended price, hero photo, area stats, video, prepared-
// for, or pitch points. ONLY the agent-constant brand fields: identity, the
// "Why us" package, the tagline, the curated reviews + outlink, the reviews
// headline, and the brand colors.
//
// Same privacy posture as `toPublicPayload`: every field is built by EXPLICIT
// field-by-field projection (never a spread) and re-clamped at the read
// boundary, so a tampered Settings record or hand-edited KV record can't
// smuggle a private/listing key into the standalone page. All content here is
// public marketing by design, but it still rides the allowlist rails.
// ===========================================================================

/**
 * The public projection for the standalone pre-listing page. A deliberately
 * NARROW shape — only the agent-constant marketing fields — so the type itself
 * documents that no listing data belongs here. The flagship sub-components
 * (AgentBand / WhyUs / Reviews / Footer) read these same field names off a
 * `PublicPayload`, so the renderer projects this onto a render view with empty
 * listing defaults (see prelisting/PrelistingPage.tsx).
 */
export interface StandalonePrelistingPayload {
  /** Always 2 — the standalone page renders ONLY through the flagship template. */
  templateVersion: 2;
  /** F4 white-label flag, projected exactly like the seller page (only literal true). */
  suppressWordmark?: boolean;
  /** Agent identity (name, brokerage, contact, photo, bio, areas, years, reassurance). */
  agent: AgentBranding;
  /** Optional agent tagline surfaced next to the identity. */
  agentTagline?: string;
  /** The "Why us" marketing package; undefined when nothing renderable survives the clamp. */
  whyUs?: WhyUs;
  /** Curated reviews (Settings-sourced). */
  reviews?: Review[];
  /** "See all reviews" outlink. */
  reviewsOutlink?: ReviewsOutlink;
  /** Optional reviews headline (overrides the default lead). */
  reviewsHeadline?: string;
  /** Brand colors → the flagship signature ramp. Undefined → engine default (blue). */
  brandColors?: PublicBrandColors;
}

/**
 * The pre-listing page exists to drive ONE action: book a consultation. Its CTA
 * close ("Schedule a listing consultation") is gated on a reachable contact
 * path (email → mailto, else phone → tel). Both brand contact fields are
 * OPTIONAL in Settings, so an agent who never filled them would publish a page
 * with no contact and the CTA — the page's whole purpose — would silently drop.
 *
 * The authenticated agent ALWAYS has their account email, so fold it in as the
 * contact of last resort: if neither a brand contact email nor phone is set,
 * the account email becomes the contact so the close always renders. A
 * brand-set email or phone still takes precedence (the agent's chosen public
 * contact wins; the account login email is only the floor). Pure + side-effect
 * free so it's unit-testable without auth.
 */
export function withAccountEmailFallback(
  agentContact: AgentBranding,
  accountEmail: string,
): AgentBranding {
  const hasContact =
    !!agentContact.email?.trim() || !!agentContact.phone?.trim();
  if (hasContact || !accountEmail.trim()) return agentContact;
  return { ...agentContact, email: accountEmail.trim() };
}

/**
 * Build the standalone pre-listing payload from the agent-constant Settings
 * inputs (the SAME `{agentContact, brandReviews, brandColors, brandWhyUs}` the
 * shared `brandToPublishInputs` produces — minus any draft). Pure; reuses the
 * exact projection helpers `toPublicPayload` uses, so the agent block, reviews,
 * colors, and "Why us" are projected identically on both surfaces.
 */
export function toPrelistingPayload(
  agentContact: AgentBranding,
  brandWhyUs: BrandWhyUsInput = {},
  brandReviews: BrandReviewsInput = {},
  brandColors: BrandColorsInput = {},
  whiteLabel: boolean = false,
): StandalonePrelistingPayload {
  const agent = projectAgent(agentContact);

  const projectedReviews = Array.isArray(brandReviews.reviews)
    ? brandReviews.reviews
        .map(projectReview)
        .filter((r): r is Review => r !== null)
    : undefined;
  const projectedOutlink = projectBrandReviewsOutlink(
    brandReviews.reviewsOutlinkUrl,
  );

  return {
    templateVersion: 2,
    suppressWordmark: whiteLabel === true ? true : undefined,
    agent,
    agentTagline: projectPublicWhyUsText(brandWhyUs.agentTagline),
    whyUs: clampPublicWhyUs(brandWhyUs.whyUs),
    reviews:
      projectedReviews && projectedReviews.length ? projectedReviews : undefined,
    reviewsOutlink: projectedOutlink,
    reviewsHeadline: projectPublicWhyUsText(brandWhyUs.reviewsHeadline),
    brandColors: projectBrandColors(brandColors),
  };
}

/**
 * Defense-at-boundary clamp for the standalone page renderer. Reads the
 * `prelisting:<slug>` KV record's `data` (unknown JSON) and coerces it into the
 * typed shape, dropping any rogue / listing / private key. Re-runs the SAME
 * allowlist helpers the projector used, so a hand-edited KV record can't leak.
 * templateVersion is FORCED to 2 — the standalone page has no v1 form.
 */
export function clampPrelistingPayload(
  raw: unknown,
): StandalonePrelistingPayload {
  if (!raw || typeof raw !== "object") {
    return { templateVersion: 2, agent: {} };
  }
  const r = raw as Record<string, unknown>;
  const reviews = Array.isArray(r.reviews)
    ? r.reviews.map(clampReview).filter((rev): rev is Review => rev !== null)
    : undefined;
  return {
    templateVersion: 2,
    suppressWordmark: r.suppressWordmark === true ? true : undefined,
    agent: clampAgentBranding(r.agent ?? r.agentBranding),
    agentTagline: projectPublicWhyUsText(r.agentTagline),
    whyUs: clampPublicWhyUs(r.whyUs),
    reviews: reviews && reviews.length ? reviews : undefined,
    reviewsOutlink: clampReviewsOutlink(r.reviewsOutlink),
    reviewsHeadline: projectPublicWhyUsText(r.reviewsHeadline),
    brandColors: clampBrandColors(r.brandColors),
  };
}
