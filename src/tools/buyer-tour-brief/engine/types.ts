/**
 * Buyer Tour Brief — draft data model (v0, BUYER_TOUR_BRIEF).
 *
 * The buyer-side twin of the Seller Presentation draft. The agent manually
 * authors a prepared, ordered, narrated showing-day page for a KNOWN buyer:
 * buyer name, tour date, an optional meeting point, a single commute anchor, and
 * 3–6 ordered homes (address + specs + the one-line "why it's on the list" +
 * one-line "watch for" + a photo). Geocode + proximity + commute are auto-derived
 * server-side (Google) and written back into the draft, then remain AGENT-EDITABLE
 * (each chip carries `editedByAgent` so a later re-pull never clobbers an edit).
 *
 * This is the agent-private working shape. It is NEVER the public artifact — the
 * buyer-facing page renders only from `toBuyerTourPublicPayload`, which projects
 * an explicit allow-list field-by-field (see output/public-payload.ts).
 *
 * PRIVACY / FAIR HOUSING: this model holds factual proximity only. Studio never
 * generates qualitative school/neighborhood claims; the agent authors all
 * qualitative language (whyOnList / watchFor / agentNote). School data is
 * locations + distance only in v0 — no ratings, no quality judgment.
 */

/** The factual proximity layers the agent can enable per tour. */
export type ProximityCategory =
  | "schools"
  | "commute"
  | "parks"
  | "coffee"
  | "grocery";

export const PROXIMITY_CATEGORIES: readonly ProximityCategory[] = [
  "schools",
  "commute",
  "parks",
  "coffee",
  "grocery",
] as const;

export function isProximityCategory(v: unknown): v is ProximityCategory {
  return (
    typeof v === "string" &&
    (PROXIMITY_CATEGORIES as readonly string[]).includes(v)
  );
}

/** A geographic point. Both fields are finite decimal degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * One factual proximity chip on a home card. `label` + `value` are the only
 * buyer-facing strings; both are FACTUAL (a place name + a distance/drive time),
 * never a quality judgment. `editedByAgent` is the keystone: once the agent
 * edits or hand-adds a chip, a later auto re-pull must preserve it.
 */
export interface ProximityChip {
  category: ProximityCategory;
  /** Factual place name or anchor label, e.g. "Lincoln Elementary", "the gate". */
  label: string;
  /** Factual measure, e.g. "0.4 mi" or "12 min drive". */
  value: string;
  /** True once the agent has edited or hand-added this chip (survives re-pull). */
  editedByAgent?: boolean;
}

/**
 * The single per-tour commute anchor (e.g. a workplace, a base gate). Every home
 * shows drive time to this one address. The raw `address` is agent-private; only
 * the `label` (+ lat/lng for the map anchor pin) is buyer-facing.
 */
export interface CommuteAnchor {
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

/** One home on the tour (3–6, ordered). */
export interface Home {
  /** Stable local id (ordering + React keys + pin↔card matching). */
  id: string;
  address: string;
  lat?: number;
  lng?: number;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  /** Hosted Blob URL (never a base64 data URL). */
  photoUrl?: string;
  /** Agent-authored "why it's on the list" — agent voice, rendered verbatim. */
  whyOnList: string;
  /** Agent-authored "watch for" — agent voice, rendered verbatim. */
  watchFor: string;
  /** Factual proximity chips (auto-derived then agent-editable). */
  proximity: ProximityChip[];
}

/** The agent identity block surfaced on the buyer page (from Brand Settings). */
export interface BuyerTourAgent {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  /** Hosted headshot URL. */
  photoUrl?: string;
  /** Scheduling link (Calendly/Cal.com/etc.); drives the "Plan the day" CTA. */
  schedulingUrl?: string;
}

/** The agent-private working draft. */
export interface BuyerTourDraft {
  buyerName: string;
  /** Free-text or ISO date string, e.g. "Saturday, July 12" or "2026-07-12". */
  tourDate: string;
  /** Agent-set start time string, e.g. "9:30 AM" (Tour Snapshot). */
  startTime?: string;
  /** Agent-set length string, e.g. "About 2.5 hrs"; absent → estimated from homes. */
  length?: string;
  meetingPoint?: string;
  commuteAnchor?: CommuteAnchor;
  /** The factual layer set the agent enabled for this tour (drives the map toggles). */
  priorities: ProximityCategory[];
  /**
   * The agent's CUSTOM buyer-priority chips for the "Planned around you" section —
   * what the BUYER cares about, in the agent's words (e.g. "Short commute", "Home
   * office", "Parks & coffee"). DISTINCT from `priorities` (the factual map layers).
   * Free text, never bound to the fixed map-layer set, never region-specific.
   */
  buyerPriorities: string[];
  /** Agent-authored note to the buyer (agent voice). */
  agentNote?: string;
  /**
   * Whether the agent turned on the GreatSchools "School context" layer for this
   * tour (GREATSCHOOLS_ENABLED). The ONLY new stored field the school section adds —
   * a plain boolean. GreatSchools data itself is NEVER stored (ToS 3.2.2 / 3.2.8);
   * it is live-fetched at render from each home's already-stored coordinates when
   * this is on. Absent/false → no school section.
   */
  schoolLayer?: boolean;
  /** 3–6 ordered homes. */
  homes: Home[];
}

export const EMPTY_BUYER_TOUR_DRAFT: BuyerTourDraft = {
  buyerName: "",
  tourDate: "",
  priorities: [],
  buyerPriorities: [],
  homes: [],
};

/** Cap on custom buyer-priority chips (keeps the Planned-around row legible). */
export const MAX_BUYER_PRIORITIES = 8;

/* --------------------------------------------------------------------------
 * Defensive clamp helpers. Pure + unit-testable. The publish route runs the
 * incoming wire draft through `clampBuyerTourDraft` BEFORE projecting it to the
 * public payload, so a tampered/oversized body can never reach the serializer
 * in an unexpected shape.
 * ------------------------------------------------------------------------ */

/** Min / max homes per the v0 product decision (3–6 ordered homes). */
export const MIN_HOMES = 3;
export const MAX_HOMES = 6;
/** Soft cap on proximity chips per home (keeps a card legible + a payload bounded). */
export const MAX_CHIPS_PER_HOME = 8;

function clampString(v: unknown, maxLen = 280): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function clampOptionalString(v: unknown, maxLen = 280): string | undefined {
  const s = clampString(v, maxLen);
  return s.length > 0 ? s : undefined;
}

function clampFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function clampLat(v: unknown): number | undefined {
  const n = clampFiniteNumber(v);
  if (n === undefined) return undefined;
  return n >= -90 && n <= 90 ? n : undefined;
}

function clampLng(v: unknown): number | undefined {
  const n = clampFiniteNumber(v);
  if (n === undefined) return undefined;
  return n >= -180 && n <= 180 ? n : undefined;
}

/** Non-negative integer (price/beds/baths/sqft), else undefined. */
function clampNonNegInt(v: unknown): number | undefined {
  const n = clampFiniteNumber(v);
  if (n === undefined || n < 0) return undefined;
  return Math.round(n);
}

/** Only an http(s) URL survives — defends the photo slot against javascript:/data: URLs. */
function clampHostedUrl(v: unknown): string | undefined {
  const s = clampOptionalString(v, 2048);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : undefined;
}

export function clampProximityChip(raw: unknown): ProximityChip | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isProximityCategory(r.category)) return null;
  const label = clampString(r.label, 120);
  const value = clampString(r.value, 80);
  // A chip with no label AND no value carries no factual content — drop it.
  if (!label && !value) return null;
  const chip: ProximityChip = { category: r.category, label, value };
  if (r.editedByAgent === true) chip.editedByAgent = true;
  return chip;
}

export function clampCommuteAnchor(raw: unknown): CommuteAnchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const label = clampString(r.label, 120);
  const address = clampString(r.address, 280);
  if (!label && !address) return undefined;
  const anchor: CommuteAnchor = { label, address };
  const lat = clampLat(r.lat);
  const lng = clampLng(r.lng);
  if (lat !== undefined && lng !== undefined) {
    anchor.lat = lat;
    anchor.lng = lng;
  }
  return anchor;
}

let homeIdCounter = 0;
function fallbackHomeId(index: number): string {
  homeIdCounter += 1;
  return `home-${index}-${homeIdCounter}`;
}

export function clampHome(raw: unknown, index: number): Home {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const lat = clampLat(r.lat);
  const lng = clampLng(r.lng);
  const proximity = Array.isArray(r.proximity)
    ? (r.proximity
        .map((c) => clampProximityChip(c))
        .filter((c): c is ProximityChip => c !== null)
        .slice(0, MAX_CHIPS_PER_HOME))
    : [];
  const home: Home = {
    id: clampString(r.id, 64) || fallbackHomeId(index),
    address: clampString(r.address, 280),
    whyOnList: clampString(r.whyOnList, 400),
    watchFor: clampString(r.watchFor, 400),
    proximity,
  };
  if (lat !== undefined && lng !== undefined) {
    home.lat = lat;
    home.lng = lng;
  }
  const price = clampNonNegInt(r.price);
  if (price !== undefined) home.price = price;
  const beds = clampNonNegInt(r.beds);
  if (beds !== undefined) home.beds = beds;
  const baths = clampNonNegInt(r.baths);
  if (baths !== undefined) home.baths = baths;
  const sqft = clampNonNegInt(r.sqft);
  if (sqft !== undefined) home.sqft = sqft;
  const photoUrl = clampHostedUrl(r.photoUrl);
  if (photoUrl) home.photoUrl = photoUrl;
  return home;
}

/**
 * Clamp an untrusted wire draft to the canonical `BuyerTourDraft` shape. Rebuilds
 * field-by-field (never a spread), drops unknown keys, caps homes at MAX_HOMES,
 * and dedupes the enabled priority layers. NEVER throws.
 */
export function clampBuyerTourDraft(
  raw: Partial<BuyerTourDraft> | null | undefined,
): BuyerTourDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const priorities: ProximityCategory[] = [];
  if (Array.isArray(r.priorities)) {
    for (const p of r.priorities) {
      if (isProximityCategory(p) && !priorities.includes(p)) priorities.push(p);
    }
  }
  const homes = Array.isArray(r.homes)
    ? r.homes.slice(0, MAX_HOMES).map((h, i) => clampHome(h, i))
    : [];
  const buyerPriorities: string[] = [];
  if (Array.isArray(r.buyerPriorities)) {
    for (const p of r.buyerPriorities) {
      const s = clampString(p, 60);
      if (s && buyerPriorities.length < MAX_BUYER_PRIORITIES) {
        buyerPriorities.push(s);
      }
    }
  }
  const draft: BuyerTourDraft = {
    buyerName: clampString(r.buyerName, 120),
    tourDate: clampString(r.tourDate, 120),
    priorities,
    buyerPriorities,
    homes,
  };
  const startTime = clampOptionalString(r.startTime, 40);
  if (startTime) draft.startTime = startTime;
  const length = clampOptionalString(r.length, 40);
  if (length) draft.length = length;
  const meetingPoint = clampOptionalString(r.meetingPoint, 280);
  if (meetingPoint) draft.meetingPoint = meetingPoint;
  const agentNote = clampOptionalString(r.agentNote, 800);
  if (agentNote) draft.agentNote = agentNote;
  const commuteAnchor = clampCommuteAnchor(r.commuteAnchor);
  if (commuteAnchor) draft.commuteAnchor = commuteAnchor;
  // Carry the GreatSchools "School context" opt-in through the boundary. Only a real
  // `true` persists (mirrors `projBool` in the public payload): absent / false / a
  // tampered non-boolean all mean off, so the field stays absent → default OFF. The
  // publish route clamps the wire draft through HERE before projecting, so omitting
  // this drops the toggle server-side even when the client sent schoolLayer: true.
  if (r.schoolLayer === true) draft.schoolLayer = true;
  return draft;
}

/**
 * Which required inputs a draft is still missing (the publish gate). Mirrors the
 * seller route's `describeMissingRequiredInputs` discipline: the server names the
 * field so a publish rejection is never opaque.
 */
export function describeMissingBuyerTourInputs(draft: BuyerTourDraft): string[] {
  const missing: string[] = [];
  if (!draft.buyerName.trim()) missing.push("buyer name");
  if (!draft.tourDate.trim()) missing.push("tour date");
  if (draft.homes.length < MIN_HOMES) {
    missing.push(`at least ${MIN_HOMES} homes`);
  }
  // Every home needs an address (the map pin + card anchor) and a reason it's on
  // the list (the agent's thinking is the hero).
  draft.homes.forEach((h, i) => {
    if (!h.address.trim()) missing.push(`home ${i + 1} address`);
    if (!h.whyOnList.trim()) missing.push(`home ${i + 1} why it's on the list`);
  });
  return missing;
}
