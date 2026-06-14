/**
 * Seller Presentation - Phase 2 (SP-AUTOFILL): pure boundary that turns the two
 * RentCast endpoints behind the "type the address once" build into the shapes
 * the wizard draft already uses. No fetch, no KV, no React - fully unit-testable
 * against captured fixtures, exactly like `rentcast-area-trend.ts`.
 *
 * TWO RENTCAST ENDPOINTS (both billed per successful response; the fetch + KV
 * cache live in `get-property-autofill.ts`, server-only):
 *
 *   1. GET /v1/properties?address=...  -> property records. We read the FIRST
 *      record's beds / baths / sqft / year to autofill the subject* fields.
 *
 *        [ { "bedrooms": 3, "bathrooms": 2.5, "squareFootage": 2140,
 *            "yearBuilt": 1998, ... }, ... ]
 *
 *   2. GET /v1/avm/value?address=...&compCount=N  -> a value estimate WITH the
 *      comparable sales it was built from. We read `comparables` (already ranked
 *      by similarity), cap a few, and project each into the draft's `Comp` shape
 *      as a nearby recent sale.
 *
 *        { "price": 642000, "comparables": [
 *            { "formattedAddress": "742 N Cedar St, Tacoma, WA 98406",
 *              "price": 685000, "removedDate": "2026-04-12T00:00:00.000Z",
 *              "lastSeenDate": "...", "squareFootage": 2210, "yearBuilt": 1996,
 *              "correlation": 0.97, "distance": 0.18, ... }, ... ] }
 *
 * COMPLIANCE / HONESTY: every normalizer is defensive and NEVER throws - a
 * malformed / absent / shape-shifted payload collapses to null / [] so the
 * caller falls back to manual entry and the "what I've prepared" claims stay
 * true (we only ever surface what RentCast actually returned). No Google
 * imagery is touched here; Street View is resolved client-side downstream.
 */

import type { Comp } from "@/tools/seller-intelligence-report/engine/types";

/** The FINAL count of nearby sales kept on the draft (and the brief's cap).
 *  Mirrors StepNearbySales' MAX_NEARBY so the review step never receives more
 *  than it can render, and keeps the comp set that flows to a later full
 *  presentation at the same size it has always been (the photographed-first
 *  selection below changes WHICH comps survive, never HOW MANY). */
export const MAX_AUTOFILL_COMPS = 4;

/** How many comparables to pull + cache per address. We pull a buffer well
 *  above MAX_AUTOFILL_COMPS so the client can resolve Street View coverage for
 *  the whole set and KEEP the ones that actually have a photo - a comp with no
 *  resolvable photo would render an empty frame, so it should not take a slot
 *  in the brief. RentCast returns up to 25 ranked by similarity, so asking for
 *  more costs nothing extra (still one cached call per address). */
export const MAX_COMP_CANDIDATES = 8;

/** How many comparables to ask RentCast for - the candidate pool the client
 *  selects the photographed comps from. */
export const AVM_COMP_COUNT = MAX_COMP_CANDIDATES;

/** Subject-property details autofilled into the draft's optional subject* fields.
 *  Every field is a STRING (the shape the StepProperty inputs read/write) and is
 *  present ONLY when RentCast had a usable value, so an empty record stays {}. */
export interface AutofillPropertyDetails {
  bedrooms?: string;
  baths?: string;
  sqft?: string;
  yearBuilt?: string;
}

/**
 * Normalize a free-text address into a stable cache key fragment: lowercase,
 * trimmed, punctuation dropped, whitespace collapsed. Two spellings of the same
 * address ("742 N. Cedar St." vs "742 N Cedar St") collapse to one key so a
 * re-edit / re-publish reads the cache instead of re-billing RentCast. Returns
 * "" for an unusable address (the caller then skips the fetch entirely).
 */
export function normalizeAddressKey(address: unknown): string {
  if (typeof address !== "string") return "";
  return address
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * KV cache key for one address's autofill bundle. `kind` separates the property
 * record from the comps bundle so each endpoint caches independently (a plan
 * that returns one but not the other still caches what it got). Versioned so a
 * future shape change to the normalizers self-invalidates the cache.
 */
export function autofillCacheKey(
  kind: "prop" | "comps",
  normalizedAddress: string,
): string {
  // v2: the comps bundle now caches the larger candidate pool
  // (MAX_COMP_CANDIDATES) the client selects photographed comps from, so a
  // previously-cached v1 bundle (the old smaller pool) self-invalidates and is
  // re-pulled once with the buffer it needs.
  return `sp-autofill:v2:${kind}:${normalizedAddress}`;
}

/** A finite, positive number survives; 0 / negative / NaN / non-number does not. */
function isUsableNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** 2140 -> "2,140" (grouped, whole). Matches the NumberInput display + the
 *  comp `squareFeet` style used elsewhere. */
function formatGrouped(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 685000 -> "$685,000" (whole-dollar, grouped). Mirrors StateAPage's
 *  formatDollars so an auto-pulled comp price reads identically to a typed one. */
function formatCompPrice(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** A clean integer year in a sane range, else undefined. */
function usableYear(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const y = Math.round(v);
  return y >= 1700 && y <= 2100 ? y : undefined;
}

/**
 * Project a RentCast `/v1/properties` response into the subject* autofill set.
 * Reads ONLY the first record's beds / baths / sqft / year; everything else
 * (owner, tax history, features, raw address parts) is dropped at the boundary.
 * Returns {} when the payload is empty / malformed / has no usable field, so the
 * caller leaves the fields blank for manual entry. NEVER throws.
 */
export function normalizePropertyRecord(raw: unknown): AutofillPropertyDetails {
  // RentCast returns an array of records; some plans wrap a single record in an
  // object. Accept either: an array's first element, or the object itself.
  const rec = Array.isArray(raw) ? raw[0] : raw;
  if (!rec || typeof rec !== "object") return {};
  const r = rec as Record<string, unknown>;

  const out: AutofillPropertyDetails = {};
  if (isUsableNumber(r.bedrooms)) {
    out.bedrooms = String(Math.round(r.bedrooms));
  }
  if (isUsableNumber(r.bathrooms)) {
    // Baths can be a half-step (2.5); keep one decimal but drop a trailing ".0".
    const b = Math.round(r.bathrooms * 2) / 2;
    out.baths = Number.isInteger(b) ? String(b) : b.toFixed(1);
  }
  if (isUsableNumber(r.squareFootage)) {
    out.sqft = formatGrouped(r.squareFootage);
  }
  const year = usableYear(r.yearBuilt);
  if (year !== undefined) out.yearBuilt = String(year);

  return out;
}

/** First non-empty ISO date string among the candidates, else undefined. */
function firstDate(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Project a RentCast `/v1/avm/value` response into draft `Comp[]` - the nearby
 * recent sales the invitation brief reviews. Reads ONLY `comparables`, keeps the
 * top `cap` already-ranked rows that have BOTH a usable address and price, and
 * projects each into the allowlisted Comp shape (address, soldPrice, soldDate,
 * squareFeet, yearBuilt, source: "imported").
 *
 * The FULL price + date are carried on the comp on purpose: they live only on
 * the PRIVATE server draft (to seed Stage 2's pricing analysis) and are stripped
 * from the State A public payload by `toPublicPayload`. NEVER throws - a missing
 * `comparables`, an empty array, or a shape mismatch all collapse to [].
 */
export function normalizeAvmComps(
  raw: unknown,
  cap: number = MAX_COMP_CANDIDATES,
): Comp[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as Record<string, unknown>).comparables;
  if (!Array.isArray(list)) return [];

  const comps: Comp[] = [];
  for (const entry of list) {
    if (comps.length >= cap) break;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const address =
      typeof e.formattedAddress === "string" && e.formattedAddress.trim()
        ? e.formattedAddress.trim()
        : typeof e.addressLine1 === "string" && e.addressLine1.trim()
          ? e.addressLine1.trim()
          : "";
    if (!address) continue;
    if (!isUsableNumber(e.price)) continue;

    const comp: Comp = {
      address,
      soldPrice: formatCompPrice(e.price),
      source: "imported",
    };
    const soldDate = firstDate(e.removedDate, e.lastSeenDate, e.listedDate);
    if (soldDate) comp.soldDate = soldDate;
    if (isUsableNumber(e.squareFootage)) {
      comp.squareFeet = formatGrouped(e.squareFootage);
    }
    const year = usableYear(e.yearBuilt);
    if (year !== undefined) comp.yearBuilt = year;

    comps.push(comp);
  }

  return comps;
}

/** The minimal photo-bearing shape shared by the draft `Comp` and the public
 *  comp projection, so the selection below works on either side of the publish
 *  boundary without coupling to the full type. */
export interface CompPhotoLike {
  photoUrl?: string;
  hasStreetView?: boolean;
  streetViewPanoId?: string;
}

/**
 * Does this comp have a resolvable photo - the evidence the brief renders?
 * True when the agent supplied a manual photo (takes precedence), OR when
 * Street View coverage resolved to a usable pano. A comp whose coverage came
 * back `false` (or is not yet resolved) has NO photo, so it would render an
 * empty frame and must not take a slot in the seller-facing brief.
 */
export function compHasPhoto(comp: CompPhotoLike): boolean {
  if (typeof comp.photoUrl === "string" && comp.photoUrl.trim()) return true;
  return (
    comp.hasStreetView === true &&
    typeof comp.streetViewPanoId === "string" &&
    comp.streetViewPanoId.trim().length > 0
  );
}

/**
 * From the resolved candidate pool, keep the comps that actually carry a photo
 * FIRST (in their existing similarity rank), then backfill with no-coverage
 * comps only if fewer than `cap` are photographed - so the draft still holds a
 * sensible nearby-sales set the agent can review or hand a photo to, while the
 * brief (which filters to photographed) never shows an empty frame. Stable:
 * order within each group is preserved. Pure + defensive (a non-array collapses
 * to []), so it's unit-testable and never throws.
 */
export function selectKeptComps(
  comps: Comp[],
  cap: number = MAX_AUTOFILL_COMPS,
): Comp[] {
  if (!Array.isArray(comps)) return [];
  const photographed = comps.filter((c) => compHasPhoto(c));
  if (photographed.length >= cap) return photographed.slice(0, cap);
  const rest = comps.filter((c) => !compHasPhoto(c));
  return [...photographed, ...rest].slice(0, cap);
}
