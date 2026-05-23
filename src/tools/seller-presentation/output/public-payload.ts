/**
 * Public-payload serializer (Substrate §3.4, §4, v1.47 / A6 + A7a + A7d.1).
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
} from "../engine/types";

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
};

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
}

/**
 * Public projection of a comp. A7a trims the PUBLIC emit to exactly
 * `{address, soldPrice, soldDate, sqft}` per the locked design.
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
  rationaleShort?: string;
}

/** A7a — grouped why-this-price block. */
export interface PublicWhyPrice {
  publicRationale: string;
  comps: PublicComp[];
}

export interface PublicPayload {
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
function projectComp(comp: Comp): PublicComp {
  return {
    address: comp.address,
    soldPrice: comp.soldPrice,
    soldDate: comp.soldDate,
    sqft: comp.squareFeet, // rename: draft uses `squareFeet`, public uses `sqft` per locked design
  };
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
    videoUrl: v.videoUrl,
    title: v.title,
    runtime: v.runtime,
    recordedOn: v.recordedOn,
  };
}

function projectReview(r: Review): Review {
  return {
    body: r.body,
    attributionName: r.attributionName,
    attributionYear: r.attributionYear,
    attributionStreet: r.attributionStreet,
  };
}

function projectReviewsOutlink(
  o: ReviewsOutlink | undefined,
): ReviewsOutlink | undefined {
  if (!o) return undefined;
  return { label: o.label, url: o.url };
}

function projectAreaStats(s: AreaStats | undefined): AreaStats | undefined {
  if (!s) return undefined;
  return {
    medianSale: s.medianSale,
    medianSaleDeltaYoy: s.medianSaleDeltaYoy,
    daysOnMarket: s.daysOnMarket,
    daysOnMarketZipAvg: s.daysOnMarketZipAvg,
    closings90d: s.closings90d,
    listToSaleRatio: s.listToSaleRatio,
    monthlySeries: s.monthlySeries?.map((m) => ({
      month: m.month,
      medianPrice: m.medianPrice,
    })),
  };
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
  };
}

/**
 * Build the public payload from a raw draft + the agent's contact
 * card. Pure — same draft + agentContact in always produces the
 * same payload out.
 *
 * The publish route MAY merge per-presentation agent overrides
 * (draft.agentAreasServed etc.) into the incoming `agentContact`
 * before calling this — that's the wizard layer's responsibility.
 * Here we just project what we receive.
 */
export function toPublicPayload(
  draft: SellerPresentationDraft,
  agentContact: AgentBranding,
): PublicPayload {
  const propertyAddress = draft.propertyAddress ?? "";
  const recommendedPrice = draft.recommendedPrice ?? "";
  const priceRationale = draft.priceRationale;

  const publicComps = draft.comps.map(projectComp);
  const publicCards = draft.pitchPoints
    .filter((p) => p.visibility === "public")
    .map(projectPitchCard)
    .filter((c): c is PublicPitchCard => c !== null);
  const publicTitleStrings = publicCards.map((c) => c.title);
  const agent = projectAgent(agentContact);

  return {
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
      rationaleShort: priceRationale,
    },
    preparedFor: draft.preparedFor,
    video: projectPresentationVideo(draft.video),
    whyPrice: {
      publicRationale: priceRationale ?? "",
      comps: publicComps,
    },
    pitchPublicCards: publicCards,
    reviews: draft.reviews?.map(projectReview),
    reviewsOutlink: projectReviewsOutlink(draft.reviewsOutlink),
    areaStats: projectAreaStats(draft.areaStats),
    agent,
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
  };
}

function emptyPayload(): PublicPayload {
  return {
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
  return {
    address: r.address,
    soldPrice: r.soldPrice,
    soldDate: typeof r.soldDate === "string" ? r.soldDate : undefined,
    sqft: typeof r.sqft === "string" ? r.sqft : undefined,
  };
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
    videoUrl: typeof r.videoUrl === "string" ? r.videoUrl : undefined,
    title: typeof r.title === "string" ? r.title : undefined,
    runtime: typeof r.runtime === "string" ? r.runtime : undefined,
    recordedOn: typeof r.recordedOn === "string" ? r.recordedOn : undefined,
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
