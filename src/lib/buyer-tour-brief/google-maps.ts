/**
 * Buyer Tour Brief — server-only Google Maps Platform enrichment (BUYER_TOUR_BRIEF).
 *
 * Auto-derives the FACTUAL proximity layer for a tour:
 *   1. Geocode each home address + the commute anchor (Geocoding API)
 *   2. Nearby school / park / coffee / grocery locations (Places Nearby Search)
 *   3. Drive time from each home to the single commute anchor (Distance Matrix)
 *
 * SERVER-ONLY. Reads `process.env.GOOGLE_MAPS_SERVER_KEY` (a NON-public, server-
 * side key with Geocoding + Places + Distance Matrix enabled) and calls Google
 * directly, so it must NEVER be imported into client code. The only caller is the
 * `/api/buyer-tour/enrich` route (nodejs).
 *
 * KEY DECISION (provisioning): this key is NOT yet provisioned. Until Dallen adds
 * `GOOGLE_MAPS_SERVER_KEY` + enables billing, every entry point returns
 * `{ ok: false, code: "key-missing" }` and the builder degrades to MANUAL chip
 * entry. The moment the key exists the auto-pull lights up with no code change.
 * (Mirrors the RentCast `key-missing` graceful-fallback pattern.)
 *
 * COST DESIGN (mirrors get-property-autofill.ts):
 *   • Per-(address|pair|category) KV cache in the same `@vercel/kv` store. Cache
 *     HIT → return the normalized shape, no Google call. Cache MISS → fetch ONCE,
 *     normalize, store. Empty / error results are NEVER cached.
 *   • The route fires on an explicit agent action ("pull proximity"), never per
 *     keystroke.
 *
 * GRACEFUL FALLBACK (never hard-fail): missing key → ok:false code. Everything
 * else (Google error, rate-limit, ZERO_RESULTS, malformed payload, timeout)
 * resolves to an empty result, so the builder simply leaves a chip unfilled.
 * Nothing here ever throws to the route.
 *
 * FAIR HOUSING: this module returns FACTS only — a place name (a location
 * identifier), a coordinate, and a distance/drive time. It never requests, parses,
 * or returns a rating, review, "best/top" signal, or any quality judgment. School
 * data is `type=school` locations + distance only (v0 product decision #4).
 */

import { kv } from "@vercel/kv";
import type { LatLng, ProximityCategory } from "@/tools/buyer-tour-brief/engine/types";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_NEARBY_URL =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const DISTANCE_MATRIX_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";

const FETCH_TIMEOUT_MS = 8000;
/** Geocode + nearby places move slowly; ~30 days keeps an address warm across an
 *  authoring + re-publish cycle, then self-evicts. */
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

const METERS_PER_MILE = 1609.344;

/** The Places `type` we query per factual layer. `commute` has no Places query —
 *  it is a Distance Matrix call to the anchor. `school` is the umbrella school type
 *  (it also surfaces `primary_school` / `secondary_school`); the accuracy work is in
 *  the post-fetch qualification filter below, not the query. */
const PLACES_TYPE: Record<Exclude<ProximityCategory, "commute">, string> = {
  schools: "school",
  parks: "park",
  coffee: "cafe",
  grocery: "supermarket",
};

/** Google Place `types` that positively identify a real school. `school` is the
 *  umbrella (covers K-12); the others are the specific real-school types. A
 *  preschool/daycare counts as a real school per the v0 product decision. */
const SCHOOL_TYPES = new Set([
  "school",
  "primary_school",
  "secondary_school",
  "preschool",
]);

/** Types that mark a place as NOT a school even when Google also tags it `school`
 *  — the yoga / scuba / gym "schools" and tutoring/spa storefronts that made the
 *  layer pick "0.1 mi to Thai Yoga Bodywork". Any of these present → rejected.
 *  NOTE: `place_of_worship` is deliberately NOT here — a parochial/religious K-12
 *  school legitimately carries it, and a bare meditation/zen center is already
 *  excluded by carrying no school type at all. */
const NON_SCHOOL_TYPES = new Set([
  "gym",
  "health",
  "spa",
  "beauty_salon",
  "storage",
]);

/**
 * Does a Places result's `types` array identify an ACTUAL school (not a loosely
 * school-tagged non-school like a yoga studio or a scuba center)? Pure.
 *
 * A result qualifies iff it carries at least one real school type AND carries no
 * disqualifying non-school type. A place with only `point_of_interest` /
 * `establishment` (no school type) never qualifies.
 */
export function isQualifyingSchool(types: unknown): boolean {
  if (!Array.isArray(types)) return false;
  const t = types.filter((x): x is string => typeof x === "string");
  if (!t.some((x) => SCHOOL_TYPES.has(x))) return false;
  if (t.some((x) => NON_SCHOOL_TYPES.has(x))) return false;
  return true;
}

export type EnrichErrorCode = "key-missing" | "invalid-address";

/** One auto-derived chip the route can fold into a home's proximity list. */
export interface DerivedChip {
  category: ProximityCategory;
  label: string;
  value: string;
}

/** The slice of `@vercel/kv` this module uses — narrowed so tests can inject an
 *  in-memory store. */
export interface MapsKv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

export interface MapsDeps {
  fetchImpl?: typeof fetch;
  kvImpl?: MapsKv;
}

/** Is the server-side Google key present? Used by the route to short-circuit to a
 *  key-missing response before any work. */
export function hasGoogleMapsServerKey(): boolean {
  const k = process.env.GOOGLE_MAPS_SERVER_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Haversine great-circle distance in meters between two points. Pure. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Format meters as a buyer-facing distance string: "0.4 mi" / "1.2 mi". Pure. */
export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return "<0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

async function fetchJson(
  url: string,
  doFetch: typeof fetch,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---- geocode -------------------------------------------------------------- */

export function parseGeocode(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "OK" || !Array.isArray(r.results) || r.results.length === 0) {
    return null;
  }
  const first = r.results[0] as Record<string, unknown> | undefined;
  const geometry = first?.geometry as Record<string, unknown> | undefined;
  const location = geometry?.location as Record<string, unknown> | undefined;
  if (!location) return null;
  const { lat, lng } = location;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { lat, lng };
}

/**
 * Geocode an address to its lat/lng, server-side + per-address KV-cached. Returns
 * null for any failure (no result, malformed, timeout). Caller treats null as
 * "no pin".
 */
export async function geocodeAddress(
  address: string,
  apiKey: string,
  deps: MapsDeps = {},
): Promise<LatLng | null> {
  const norm = normalizeAddressKey(address);
  if (!norm) return null;
  const store: MapsKv = deps.kvImpl ?? kv;
  const doFetch = deps.fetchImpl ?? fetch;
  const cacheKey = `btb:geo:v1:${norm}`;
  try {
    const cached = await store.get<LatLng>(cacheKey);
    if (cached && isFiniteNumber(cached.lat) && isFiniteNumber(cached.lng)) {
      return cached;
    }
  } catch {
    /* non-fatal */
  }
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address.trim());
  url.searchParams.set("key", apiKey);
  const point = parseGeocode(await fetchJson(url.toString(), doFetch));
  if (!point) return null;
  try {
    await store.set(cacheKey, point, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* best-effort */
  }
  return point;
}

/* ---- nearby places -------------------------------------------------------- */

/** Read the nearest result's display name + coordinate from a Places response.
 *  FACTS ONLY: name + location. Rating / user_ratings_total / price_level are
 *  never read. */
export function parseNearestPlace(
  raw: unknown,
): { name: string; location: LatLng } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "OK" || !Array.isArray(r.results) || r.results.length === 0) {
    return null;
  }
  const first = r.results[0] as Record<string, unknown> | undefined;
  const name = typeof first?.name === "string" ? first.name.trim() : "";
  const geometry = first?.geometry as Record<string, unknown> | undefined;
  const location = geometry?.location as Record<string, unknown> | undefined;
  if (!name || !location) return null;
  const { lat, lng } = location;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { name, location: { lat, lng } };
}

/**
 * Read the nearest QUALIFYING school from a Places response — the first result (the
 * list is `rankby=distance`, so first-qualifying IS nearest-qualifying) whose
 * `types` pass {@link isQualifyingSchool}. Skips yoga/scuba/gym "schools" and any
 * result missing a name or coordinate. Returns null when nothing qualifies, so the
 * layer shows a graceful empty rather than a wrong result. FACTS ONLY: name +
 * location (never a rating). */
export function parseNearestSchool(
  raw: unknown,
): { name: string; location: LatLng } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "OK" || !Array.isArray(r.results)) return null;
  for (const item of r.results) {
    const res = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    if (!isQualifyingSchool(res.types)) continue;
    const name = typeof res.name === "string" ? res.name.trim() : "";
    const geometry = res.geometry as Record<string, unknown> | undefined;
    const location = geometry?.location as Record<string, unknown> | undefined;
    if (!name || !location) continue;
    const { lat, lng } = location;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) continue;
    return { name, location: { lat, lng } };
  }
  return null;
}

/**
 * Nearest place of a factual category to a home. Returns a `{label, value}` chip
 * (place name + straight-line distance) or null. `rankby=distance` returns the
 * closest first; the distance is computed haversine from the home (no extra call).
 */
export async function nearestPlaceChip(
  home: LatLng,
  category: Exclude<ProximityCategory, "commute">,
  apiKey: string,
  deps: MapsDeps = {},
): Promise<DerivedChip | null> {
  const store: MapsKv = deps.kvImpl ?? kv;
  const doFetch = deps.fetchImpl ?? fetch;
  // `schools` moved to v2 when the qualification filter landed, so a chip cached
  // under the old loose logic (e.g. a yoga studio) can never be served again. The
  // other four layers are unchanged, so they keep their v1 cache.
  const version = category === "schools" ? "v2" : "v1";
  const cacheKey = `btb:place:${version}:${category}:${home.lat.toFixed(4)},${home.lng.toFixed(4)}`;
  try {
    const cached = await store.get<DerivedChip>(cacheKey);
    if (cached && cached.label && cached.value) return cached;
  } catch {
    /* non-fatal */
  }
  const url = new URL(PLACES_NEARBY_URL);
  url.searchParams.set("location", `${home.lat},${home.lng}`);
  url.searchParams.set("rankby", "distance");
  url.searchParams.set("type", PLACES_TYPE[category]);
  url.searchParams.set("key", apiKey);
  const raw = await fetchJson(url.toString(), doFetch);
  // Schools: pick the nearest result that is an ACTUAL school; the other layers keep
  // the nearest result of their type unchanged.
  const nearest =
    category === "schools" ? parseNearestSchool(raw) : parseNearestPlace(raw);
  if (!nearest) return null;
  const chip: DerivedChip = {
    category,
    label: nearest.name,
    value: formatMiles(haversineMeters(home, nearest.location)),
  };
  try {
    await store.set(cacheKey, chip, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* best-effort */
  }
  return chip;
}

/* ---- distance matrix (commute) -------------------------------------------- */

/** Read the drive-duration TEXT from a Distance Matrix response. */
export function parseDriveDuration(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "OK" || !Array.isArray(r.rows) || r.rows.length === 0) {
    return null;
  }
  const row = r.rows[0] as Record<string, unknown> | undefined;
  const elements = row?.elements as unknown;
  if (!Array.isArray(elements) || elements.length === 0) return null;
  const el = elements[0] as Record<string, unknown> | undefined;
  if (el?.status !== "OK") return null;
  const duration = el.duration as Record<string, unknown> | undefined;
  const text = typeof duration?.text === "string" ? duration.text.trim() : "";
  return text || null;
}

/**
 * Drive time from a home to the commute anchor. Returns a `{label, value}` chip
 * (anchor label + "X min drive") or null. KV-cached per home→anchor pair.
 */
export async function commuteChip(
  home: LatLng,
  anchor: LatLng,
  anchorLabel: string,
  apiKey: string,
  deps: MapsDeps = {},
): Promise<DerivedChip | null> {
  const store: MapsKv = deps.kvImpl ?? kv;
  const doFetch = deps.fetchImpl ?? fetch;
  const cacheKey = `btb:dist:v1:${home.lat.toFixed(4)},${home.lng.toFixed(4)}>${anchor.lat.toFixed(4)},${anchor.lng.toFixed(4)}`;
  try {
    const cached = await store.get<string>(cacheKey);
    if (typeof cached === "string" && cached) {
      return { category: "commute", label: anchorLabel, value: cached };
    }
  } catch {
    /* non-fatal */
  }
  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set("origins", `${home.lat},${home.lng}`);
  url.searchParams.set("destinations", `${anchor.lat},${anchor.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", apiKey);
  const durationText = parseDriveDuration(await fetchJson(url.toString(), doFetch));
  if (!durationText) return null;
  // Normalize "12 mins" → "12 min drive" for a tighter buyer-facing chip.
  const value = `${durationText.replace(/\bmins?\b/i, "min").replace(/\bhours?\b/i, "hr")} drive`;
  try {
    await store.set(cacheKey, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* best-effort */
  }
  return { category: "commute", label: anchorLabel, value };
}
