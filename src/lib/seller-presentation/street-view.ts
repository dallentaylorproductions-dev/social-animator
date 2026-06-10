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

/** Default static-image size. ~600x400 keeps the card crisp; billed per request. */
export const STREET_VIEW_IMG_SIZE = "600x400";

/** Resolved coverage for one address. `hasStreetView` is the durable flag. */
export interface StreetViewMeta {
  panoId?: string;
  hasStreetView: boolean;
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
  size: string = STREET_VIEW_IMG_SIZE,
): string | null {
  const key = streetViewBrowserKey();
  const pano = typeof panoId === "string" ? panoId.trim() : "";
  if (!key || !pano) return null;
  const params = new URLSearchParams({ size, pano, key });
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
