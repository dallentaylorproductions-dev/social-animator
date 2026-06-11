/**
 * Seller Presentation — Google Street View helpers (COMP_PHOTOS).
 *
 * Auto-populates a per-comp home photo from Google Street View, sourced
 * street-level by address. MLS / listing photos are copyright-blocked for
 * redistribution; Street View is the compliant source.
 *
 * COMPLIANCE (Google Maps Platform Terms) — hard gate, see the PR:
 *   - We NEVER store, cache, bake, proxy, or rehost Street View IMAGERY.
 *     No image bytes ever touch Vercel Blob / KV / the published payload.
 *   - The ONLY Google datum we persist is the panorama id + a coverage
 *     flag (`streetViewPanoId` + `hasStreetView`). The pano id is the one
 *     value explicitly EXEMPT from the caching restriction.
 *   - The image is always requested FRESH from Google at view time via a
 *     client-side `<img>` pointing at the Street View Static URL (this
 *     module only builds that URL — it never fetches the bytes itself).
 *   - Google's attribution watermark (baked into the image) stays visible;
 *     the renderer must not crop it off.
 *
 * KEY: ONE browser key, HTTP-referrer-restricted to our domains and
 * API-restricted to the Street View Static API. It is exposed in the page
 * (the referrer restriction is the protection), so it MUST carry the
 * `NEXT_PUBLIC_` prefix to be readable from the wizard's client-side
 * metadata resolve AND the client-rendered live preview. Reference the env
 * var as a literal so Next can statically inline it into the client bundle.
 */

export const STREET_VIEW_STATIC_BASE =
  "https://maps.googleapis.com/maps/api/streetview";
export const STREET_VIEW_METADATA_BASE =
  "https://maps.googleapis.com/maps/api/streetview/metadata";
export const GEOCODE_BASE =
  "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Default static-image size. ~600x400 (a 3:2 landscape) matches the flagship
 * comp card's display aspect (≈16:10 desktop, cover-cropped on the mobile
 * strip), so `object-fit: cover` fills the slot WITHOUT distortion at any card
 * size. Billed per request.
 */
export const STREET_VIEW_IMG_SIZE = "600x400";

/**
 * Default framing for the rendered comp image. `STREET_VIEW_FOV` slightly
 * narrows the field of view from Google's ~90° default so the home reads
 * larger and the wide-angle warp (which looks "squished") is reduced;
 * `STREET_VIEW_PITCH` tilts the camera up a touch for a flattering frame.
 * Applied at render only — neither is persisted.
 */
export const STREET_VIEW_FOV = 80;
export const STREET_VIEW_PITCH = 6;

/** Resolved coverage for one address. `hasStreetView` is the durable flag. */
export interface StreetViewMeta {
  panoId?: string;
  hasStreetView: boolean;
}

/** A geographic point. Both fields are finite decimal degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * The durable per-comp coverage record resolved at authoring time. Beyond the
 * pano id + coverage flag, this adds the COMPLIANT aiming data: a computed
 * `heading` (compass bearing pano -> house) and the resolved house lat/lng.
 * Per Google's terms lat/lng is storable and a heading is a derived number —
 * NO raw geocode payload and NO imagery is ever carried here.
 */
export interface CompCoverage {
  panoId?: string;
  hasStreetView: boolean;
  heading?: number;
  houseLat?: number;
  houseLng?: number;
}

/** Render-time framing options for the Street View Static image. */
export interface StreetViewImageOpts {
  /** Image size, e.g. "600x400". Defaults to STREET_VIEW_IMG_SIZE. */
  size?: string;
  /** Compass heading 0–360 (camera direction). Omitted when undefined. */
  heading?: number;
  /** Horizontal field of view in degrees (lower = more zoomed). */
  fov?: number;
  /** Up/down camera angle in degrees (positive looks up). */
  pitch?: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Normalize any finite bearing into the [0,360) compass range. A value already
 * in range is returned UNCHANGED (no modulo), so an exact heading like 123.45
 * doesn't pick up floating-point drift from the wrap arithmetic.
 */
export function normalizeHeading(deg: number): number {
  if (deg >= 0 && deg < 360) return deg;
  return ((deg % 360) + 360) % 360;
}

/**
 * The browser key. Literal `process.env.NEXT_PUBLIC_*` access so Next inlines
 * it client-side. Returns undefined when unset (e.g. CI, or before Dallen
 * provisions the key) — every caller degrades to "no photo" cleanly.
 */
export function streetViewBrowserKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_STREETVIEW_BROWSER_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

/** COMP_PHOTOS_ENABLED kill switch (server-side gate for the publish path). */
export function isCompPhotosEnabled(): boolean {
  return process.env.COMP_PHOTOS_ENABLED === "true";
}

/**
 * Build the Street View Static IMAGE url for a known pano id. Returns null
 * when there's no pano or no key, so the renderer falls back to text-only.
 * Addressed by `pano` (exact + stable) rather than `location` so the image
 * matches the coverage we resolved at authoring time. The browser fetches
 * this fresh; we never request the bytes server-side.
 */
export function streetViewStaticUrl(
  panoId: string | undefined,
  opts: StreetViewImageOpts = {},
): string | null {
  const key = streetViewBrowserKey();
  const pano = typeof panoId === "string" ? panoId.trim() : "";
  if (!key || !pano) return null;
  const size = opts.size ?? STREET_VIEW_IMG_SIZE;
  const params = new URLSearchParams({ size, pano, key });
  // Aiming + framing are added ONLY when supplied, so an opts-less call stays
  // byte-identical to the pre-quality URL (size + pano + key). `heading` aims
  // the camera at the home (computed at authoring time); fov/pitch frame it.
  if (isFiniteNumber(opts.heading)) {
    params.set("heading", String(normalizeHeading(opts.heading)));
  }
  if (isFiniteNumber(opts.fov)) params.set("fov", String(opts.fov));
  if (isFiniteNumber(opts.pitch)) params.set("pitch", String(opts.pitch));
  return `${STREET_VIEW_STATIC_BASE}?${params.toString()}`;
}

/**
 * Build the FREE Street View metadata url for an address. Returns null when
 * there's no usable address or no key. No quota is consumed by metadata, so
 * the authoring resolve costs nothing.
 */
export function streetViewMetadataUrl(address: string | undefined): string | null {
  const key = streetViewBrowserKey();
  const loc = typeof address === "string" ? address.trim() : "";
  if (!key || !loc) return null;
  const params = new URLSearchParams({ location: loc, key });
  return `${STREET_VIEW_METADATA_BASE}?${params.toString()}`;
}

/**
 * Project a raw metadata response into our durable two-field shape. Pure +
 * defensive so it's unit-testable against mock Google fixtures. Only a
 * `status: "OK"` with a string `pano_id` counts as coverage; anything else
 * (ZERO_RESULTS / NOT_FOUND / REQUEST_DENIED / malformed) → no coverage.
 */
export function parseStreetViewMetadata(raw: unknown): StreetViewMeta {
  if (!raw || typeof raw !== "object") return { hasStreetView: false };
  const r = raw as Record<string, unknown>;
  const pano = typeof r.pano_id === "string" ? r.pano_id.trim() : "";
  if (r.status === "OK" && pano) {
    return { panoId: pano, hasStreetView: true };
  }
  return { hasStreetView: false };
}

/**
 * Resolve coverage for an address by calling the FREE metadata endpoint.
 * Client-side only (the browser key is referrer-restricted). `fetchImpl` is
 * injectable so tests can mock Google without hitting the live API. Any
 * failure (no key, network error, CORS block, non-OK status) resolves to
 * `{ hasStreetView: false }` — the comp lays out text-only, never broken.
 */
export async function resolveStreetViewMeta(
  address: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<StreetViewMeta> {
  const url = streetViewMetadataUrl(address);
  if (!url) return { hasStreetView: false };
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { hasStreetView: false };
    const json = (await res.json()) as unknown;
    return parseStreetViewMetadata(json);
  } catch {
    return { hasStreetView: false };
  }
}

/* ---- aiming: geocode the home + compute the camera heading ------------- */

/**
 * Extract the PANO's location from a raw Street View metadata response. The
 * metadata `location: { lat, lng }` is the coordinate of the panorama itself
 * (where the camera stood). We read it transiently to compute the heading
 * toward the home; the pano latlng is NOT persisted. Returns null when absent
 * or malformed. Kept SEPARATE from `parseStreetViewMetadata` so that helper's
 * durable two-field shape (and its tests) stay unchanged.
 */
export function parsePanoLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const loc = (raw as Record<string, unknown>).location;
  if (!loc || typeof loc !== "object") return null;
  const { lat, lng } = loc as Record<string, unknown>;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { lat, lng };
}

/**
 * Build the Google Geocoding url for an address. Returns null when there's no
 * usable address or no key. The browser key must have the Geocoding API added
 * to its API restrictions (Street-View-only keys return REQUEST_DENIED, which
 * `parseGeocode` treats as "no location" → the comp keeps its default heading).
 */
export function geocodeUrl(address: string | undefined): string | null {
  const key = streetViewBrowserKey();
  const loc = typeof address === "string" ? address.trim() : "";
  if (!key || !loc) return null;
  const params = new URLSearchParams({ address: loc, key });
  return `${GEOCODE_BASE}?${params.toString()}`;
}

/**
 * Project a raw Geocoding response into JUST the resolved lat/lng. Pure +
 * defensive against the full geocode payload — we read ONLY
 * `results[0].geometry.location.{lat,lng}` and DROP everything else (no
 * formatted_address, place_id, address_components, viewport, etc. is ever
 * returned, so the raw geocode JSON can never be persisted downstream).
 * Anything other than a `status: "OK"` with finite coords → null.
 */
export function parseGeocode(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "OK" || !Array.isArray(r.results) || r.results.length === 0) {
    return null;
  }
  const first = r.results[0];
  if (!first || typeof first !== "object") return null;
  const geometry = (first as Record<string, unknown>).geometry;
  if (!geometry || typeof geometry !== "object") return null;
  const location = (geometry as Record<string, unknown>).location;
  if (!location || typeof location !== "object") return null;
  const { lat, lng } = location as Record<string, unknown>;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { lat, lng };
}

/**
 * Geocode an address to its lat/lng via the FREE-tier Geocoding API. Client-
 * side (the browser key is referrer-restricted); `fetchImpl` is injectable for
 * tests. Any failure (no key, network/CORS error, non-OK status, REQUEST_DENIED
 * when the key lacks the Geocoding API) resolves to null — the caller then
 * skips the heading and the comp renders at Street View's default heading.
 */
export async function resolveGeocode(
  address: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<LatLng | null> {
  const url = geocodeUrl(address);
  if (!url) return null;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return parseGeocode(json);
  } catch {
    return null;
  }
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Initial great-circle compass bearing from `from` toward `to`, in degrees in
 * [0,360). 0 = due north, 90 = east. Used to aim the Street View camera from
 * the panorama's position at the home. Pure — known coords give a known
 * heading, so it's directly unit-testable.
 */
export function computeHeading(from: LatLng, to: LatLng): number {
  const lat1 = from.lat * DEG2RAD;
  const lat2 = to.lat * DEG2RAD;
  const dLng = (to.lng - from.lng) * DEG2RAD;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeHeading(Math.atan2(y, x) * RAD2DEG);
}

/**
 * Resolve a comp's full coverage record: coverage (pano id + flag) PLUS the
 * compliant aiming data (heading + house lat/lng). One metadata fetch (free)
 * gives the pano id + the pano's own latlng; a geocode (free-tier) gives the
 * home's latlng; the heading is the bearing between them.
 *
 * Compliance: persists ONLY { panoId, hasStreetView, heading, houseLat,
 * houseLng } — the pano latlng is used transiently to compute the heading and
 * discarded, and NO raw geocode payload or imagery is ever returned. Degrades
 * cleanly at every step: no coverage → `{ hasStreetView: false }`; coverage but
 * a failed/CORS-blocked/denied geocode → coverage WITHOUT a heading (the comp
 * still shows a photo, just at the default heading).
 */
export async function resolveCompCoverage(
  address: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<CompCoverage> {
  const metaUrl = streetViewMetadataUrl(address);
  if (!metaUrl) return { hasStreetView: false };

  let rawMeta: unknown;
  try {
    const res = await fetchImpl(metaUrl);
    if (!res.ok) return { hasStreetView: false };
    rawMeta = (await res.json()) as unknown;
  } catch {
    return { hasStreetView: false };
  }

  const coverage = parseStreetViewMetadata(rawMeta);
  if (!coverage.hasStreetView || !coverage.panoId) {
    return { hasStreetView: false };
  }

  const out: CompCoverage = {
    panoId: coverage.panoId,
    hasStreetView: true,
  };

  // Aim the camera: need BOTH the pano's latlng (from metadata) and the home's
  // latlng (from geocoding). Missing either → coverage without a heading.
  const panoLoc = parsePanoLatLng(rawMeta);
  if (panoLoc) {
    const house = await resolveGeocode(address, fetchImpl);
    if (house) {
      out.houseLat = house.lat;
      out.houseLng = house.lng;
      out.heading = computeHeading(panoLoc, house);
    }
  }

  return out;
}
