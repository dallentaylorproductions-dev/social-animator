/**
 * Buyer Tour Brief — the public payload (the privacy trust boundary).
 *
 * The buyer-facing `/tour/[slug]` page renders ONLY from this payload, never from
 * the raw draft. `toBuyerTourPublicPayload` projects an explicit allow-list
 * field-by-field — NEVER a spread / pass-through — so a private or rogue field on
 * the draft can never reach KV or the buyer's screen. `clampBuyerTourPublicPayload`
 * re-runs the same projection at READ time, so even a hand-edited KV record is
 * re-clamped before the renderer sees it.
 *
 * Allow-list guarantee (proven by e2e/buyer-tour.public-payload.spec.ts): every
 * field is built by explicit projection. The mirror of the Seller Presentation
 * `toPublicPayload` discipline.
 *
 * What the buyer sees (and nothing else): buyer name, tour date, meeting point,
 * the agent's authored note, the enabled factual layers, the agent identity, the
 * commute anchor LABEL (+ its map coordinate), and each home's address, photo,
 * specs, whyOnList, watchFor, factual proximity chips, and map pin coordinate.
 *
 * What is dropped: the commute anchor's raw ADDRESS (agent-private), the per-chip
 * `editedByAgent` bookkeeping flag, and any field not named below.
 */

import {
  isProximityCategory,
  type BuyerTourAgent,
  type BuyerTourDraft,
  type Home,
  type ProximityCategory,
} from "../engine/types";

export const BUYER_TOUR_HANDOUT_TYPE = "buyer-tour" as const;

/** A buyer-facing proximity chip — factual label + value only (no bookkeeping). */
export interface PublicProximityChip {
  category: ProximityCategory;
  label: string;
  value: string;
}

/** A buyer-facing home card. */
export interface PublicHome {
  /** Stop order (1-based) — the badge on the pin + card. */
  stop: number;
  address: string;
  photoUrl?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  /** Map pin coordinate (present only when geocoded). */
  lat?: number;
  lng?: number;
  whyOnList: string;
  watchFor: string;
  proximity: PublicProximityChip[];
}

/** The agent identity surfaced to the buyer. */
export interface PublicAgent {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
  schedulingUrl?: string;
}

/** The buyer-facing map anchor (commute target) — LABEL + coordinate only. */
export interface PublicCommuteAnchor {
  label: string;
  lat?: number;
  lng?: number;
}

/** Max proximity chips shown per home card (the narrative stays dominant). */
export const MAX_PUBLIC_CHIPS = 3;

export interface BuyerTourPublicPayload {
  templateVersion: 1;
  buyerName: string;
  tourDate: string;
  /** Tour Snapshot: start time + length (length may be estimated by the renderer). */
  startTime?: string;
  length?: string;
  meetingPoint?: string;
  agentNote?: string;
  /** Enabled factual layers, deduped + in canonical order (the map toggles). */
  priorities: ProximityCategory[];
  /** The agent's CUSTOM buyer-priority chips (Planned around). Distinct from layers. */
  buyerPriorities: string[];
  commuteAnchor?: PublicCommuteAnchor;
  homes: PublicHome[];
  agent: PublicAgent;
  /**
   * The agent's single brand accent (from Studio Profile `brandAccent`). Owns ONLY
   * the "tour thread" set on the buyer page (map pins + route line, the CTA, the
   * tour-order step numbers, the "why it's on the list" accent bar) — never the
   * factual map-layer colors (those are a fixed semantic legend). Absent → the page
   * falls back to its default accent. Validated as a #rgb / #rrggbb hex; a tampered
   * value drops to undefined (the page never renders an arbitrary string into CSS).
   */
  brandAccent?: string;
}

/* --------------------------------------------------------------------------
 * Projection helpers — each rebuilds its shape field-by-field. A value that
 * fails its type/format check is dropped to `undefined` (or the row is dropped),
 * never passed through.
 * ------------------------------------------------------------------------ */

function projStr(v: unknown, maxLen = 400): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function projOptStr(v: unknown, maxLen = 400): string | undefined {
  const s = projStr(v, maxLen);
  return s.length > 0 ? s : undefined;
}

function projNonNegInt(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
  return Math.round(v);
}

function projLat(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v >= -90 && v <= 90 ? v : undefined;
}

function projLng(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v >= -180 && v <= 180 ? v : undefined;
}

function projHostedUrl(v: unknown): string | undefined {
  const s = projOptStr(v, 2048);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : undefined;
}

/** Only a valid #rgb / #rrggbb hex survives — defends the accent slot against an
 *  arbitrary string being rendered straight into a CSS color. */
function projHex(v: unknown): string | undefined {
  const s = projOptStr(v, 9);
  if (!s) return undefined;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : undefined;
}

function projPriorities(raw: unknown): ProximityCategory[] {
  // Canonical order, deduped. We iterate the canonical list and KEEP only the
  // categories present in `raw`, so the output order is fixed regardless of input.
  if (!Array.isArray(raw)) return [];
  const present = new Set<string>();
  for (const v of raw) if (isProximityCategory(v)) present.add(v);
  const CANON: ProximityCategory[] = [
    "schools",
    "commute",
    "parks",
    "coffee",
    "grocery",
  ];
  return CANON.filter((c) => present.has(c));
}

/** Project the custom buyer-priority chips: clean non-empty strings, capped. */
function projBuyerPriorities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = projStr(v, 60);
    if (s && out.length < 8) out.push(s);
  }
  return out;
}

function projChip(raw: unknown): PublicProximityChip | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isProximityCategory(r.category)) return null;
  const label = projStr(r.label, 120);
  const value = projStr(r.value, 80);
  if (!label && !value) return null;
  // NOTE: `editedByAgent` is deliberately NOT carried — it is agent-private
  // bookkeeping, not buyer-facing.
  return { category: r.category, label, value };
}

function projAgent(agent: BuyerTourAgent | PublicAgent | undefined): PublicAgent {
  const a = (agent && typeof agent === "object" ? agent : {}) as Record<
    string,
    unknown
  >;
  // Explicit field-by-field — never spread an agent record (a rogue key on a
  // tampered Brand Settings object must not ride along).
  const out: PublicAgent = {};
  const name = projOptStr(a.name, 120);
  if (name) out.name = name;
  const brokerage = projOptStr(a.brokerage, 160);
  if (brokerage) out.brokerage = brokerage;
  const phone = projOptStr(a.phone, 40);
  if (phone) out.phone = phone;
  const email = projOptStr(a.email, 160);
  if (email) out.email = email;
  const photoUrl = projHostedUrl(a.photoUrl);
  if (photoUrl) out.photoUrl = photoUrl;
  const schedulingUrl = projHostedUrl(a.schedulingUrl);
  if (schedulingUrl) out.schedulingUrl = schedulingUrl;
  return out;
}

function projHome(raw: unknown, stop: number): PublicHome {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const home: PublicHome = {
    stop,
    address: projStr(r.address, 280),
    whyOnList: projStr(r.whyOnList, 400),
    watchFor: projStr(r.watchFor, 400),
    proximity: Array.isArray(r.proximity)
      ? r.proximity
          .map((c) => projChip(c))
          .filter((c): c is PublicProximityChip => c !== null)
          .slice(0, MAX_PUBLIC_CHIPS)
      : [],
  };
  const photoUrl = projHostedUrl(r.photoUrl);
  if (photoUrl) home.photoUrl = photoUrl;
  const price = projNonNegInt(r.price);
  if (price !== undefined) home.price = price;
  const beds = projNonNegInt(r.beds);
  if (beds !== undefined) home.beds = beds;
  const baths = projNonNegInt(r.baths);
  if (baths !== undefined) home.baths = baths;
  const sqft = projNonNegInt(r.sqft);
  if (sqft !== undefined) home.sqft = sqft;
  const lat = projLat(r.lat);
  const lng = projLng(r.lng);
  if (lat !== undefined && lng !== undefined) {
    home.lat = lat;
    home.lng = lng;
  }
  return home;
}

function projCommuteAnchor(raw: unknown): PublicCommuteAnchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  // BUYER-FACING = LABEL ONLY. The raw `address` (a workplace / gate the buyer
  // never needs) is intentionally NOT projected — it stays agent-private.
  const label = projStr(r.label, 120);
  if (!label) return undefined;
  const anchor: PublicCommuteAnchor = { label };
  const lat = projLat(r.lat);
  const lng = projLng(r.lng);
  if (lat !== undefined && lng !== undefined) {
    anchor.lat = lat;
    anchor.lng = lng;
  }
  return anchor;
}

/**
 * Build the buyer-facing public payload from the agent-private draft + the agent
 * identity. ONLY the result is persisted to KV by the publish route; the raw
 * draft is dropped here and never sees the persistence path.
 */
export function toBuyerTourPublicPayload(
  draft: BuyerTourDraft,
  agent: BuyerTourAgent = {},
  brandAccent?: string,
): BuyerTourPublicPayload {
  const homes: PublicHome[] = (Array.isArray(draft.homes) ? draft.homes : []).map(
    (h: Home, i) => projHome(h, i + 1),
  );
  const payload: BuyerTourPublicPayload = {
    templateVersion: 1,
    buyerName: projStr(draft.buyerName, 120),
    tourDate: projStr(draft.tourDate, 120),
    priorities: projPriorities(draft.priorities),
    buyerPriorities: projBuyerPriorities(draft.buyerPriorities),
    homes,
    agent: projAgent(agent),
  };
  const startTime = projOptStr(draft.startTime, 40);
  if (startTime) payload.startTime = startTime;
  const length = projOptStr(draft.length, 40);
  if (length) payload.length = length;
  const meetingPoint = projOptStr(draft.meetingPoint, 280);
  if (meetingPoint) payload.meetingPoint = meetingPoint;
  const agentNote = projOptStr(draft.agentNote, 800);
  if (agentNote) payload.agentNote = agentNote;
  const commuteAnchor = projCommuteAnchor(draft.commuteAnchor);
  if (commuteAnchor) payload.commuteAnchor = commuteAnchor;
  const accent = projHex(brandAccent);
  if (accent) payload.brandAccent = accent;
  return payload;
}

/**
 * Read-time clamp. The KV record's `data` is `unknown` at the trust boundary; the
 * renderer must never touch it directly. This re-runs the SAME field-by-field
 * projection so any rogue key (e.g. a record hand-edited in KV with a private
 * field glued on) is silently dropped before render. `templateVersion` is pinned
 * to 1.
 */
export function clampBuyerTourPublicPayload(
  raw: unknown,
): BuyerTourPublicPayload {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const homes: PublicHome[] = Array.isArray(r.homes)
    ? r.homes.slice(0, 6).map((h, i) => projHome(h, i + 1))
    : [];
  const payload: BuyerTourPublicPayload = {
    templateVersion: 1,
    buyerName: projStr(r.buyerName, 120),
    tourDate: projStr(r.tourDate, 120),
    priorities: projPriorities(r.priorities),
    buyerPriorities: projBuyerPriorities(r.buyerPriorities),
    homes,
    agent: projAgent(r.agent as BuyerTourAgent | undefined),
  };
  const startTime = projOptStr(r.startTime, 40);
  if (startTime) payload.startTime = startTime;
  const length = projOptStr(r.length, 40);
  if (length) payload.length = length;
  const meetingPoint = projOptStr(r.meetingPoint, 280);
  if (meetingPoint) payload.meetingPoint = meetingPoint;
  const agentNote = projOptStr(r.agentNote, 800);
  if (agentNote) payload.agentNote = agentNote;
  const commuteAnchor = projCommuteAnchor(r.commuteAnchor);
  if (commuteAnchor) payload.commuteAnchor = commuteAnchor;
  const accent = projHex(r.brandAccent);
  if (accent) payload.brandAccent = accent;
  return payload;
}
