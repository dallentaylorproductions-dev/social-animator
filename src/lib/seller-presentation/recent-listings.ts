/**
 * Seller State A · Zone 5 — the SETTINGS-side shape of the agent's recent
 * listings (the editable source of truth) plus the load-boundary clamp and the
 * mapping into the publish projector's input.
 *
 * The agent enters these once in Settings (their OWN recent listings); the data
 * persists on BrandSettings (localStorage) and rides the same `brandWhyUs`
 * channel every other agent-constant field uses. The publish projector
 * (`projectRecentListings` in public-payload.ts) is the public-safe boundary:
 * it enumerates every field, clamps the view count to a non-negative integer,
 * caps the array, and drops un-renderable rows. This module is the *write* side
 * — the agent's working draft — and is deliberately permissive (no public
 * shape leaks here): the projector does the hardening.
 *
 * View count is stored as the FORMATTED display string ("41,184") exactly like
 * the "Why us" performance-stat numbers, so the `NumberInput` control round-
 * trips it verbatim. `recentListingsToPublishInput` parses it to an integer at
 * publish, where `clampViewCount` (a number gate) can accept it.
 */

import {
  RECENT_LISTINGS_CAP,
  type PublicRecentListing,
} from "@/tools/seller-presentation/output/public-payload";
import { stripToDigits } from "@/components/inputs/formatHelpers";

export { RECENT_LISTINGS_CAP };

/**
 * One recent listing as edited in Settings. Address is the only field that
 * makes a row renderable (the projector drops a row without one); everything
 * else is optional. The photo is a hosted upload URL OR a Street View pano id
 * resolved from the address (never image bytes), the SAME pattern as the comp
 * thumbnails.
 */
export interface SettingsRecentListing {
  address: string;
  city?: string;
  /**
   * Formatted display string from `NumberInput`, e.g. "41,184". Optional and
   * never fabricated: blank means the card renders photo + address with no
   * number. Parsed to a non-negative integer at publish.
   */
  viewCount?: string;
  /**
   * Optional source label. Plumbed end-to-end but per the one-label decision
   * the consumer card always shows a plain "Views"; the Settings UI does not
   * surface this yet (deferred), so it stays absent for now.
   */
  sourceLabel?: string;
  /** Hosted cover photo (camera-roll upload → Vercel Blob). Wins over Street View. */
  photoUrl?: string;
  /** Street View fallback — pano id only (no bytes), resolved from the address. */
  streetViewPanoId?: string;
  hasStreetView?: boolean;
  /** Derived compass bearing (0–360), pano → house, aimed at the home. */
  streetViewHeading?: number;
  /**
   * Photo FRAMING (display-only, like the agent headshot): `photoFocalX/Y` are
   * the CSS object-position as 0–100% (default centered 50/50) and `photoScale`
   * is a 1.0–2.0 display zoom (default 1). They reposition the cover photo on the
   * coverflow card so an uploaded photo no longer sits "wonky". The image bytes
   * are never re-cropped. All optional; unset = centered, no zoom (byte-identical).
   */
  photoFocalX?: number;
  photoFocalY?: number;
  photoScale?: number;
}

/** A fresh, empty listing row for the "+ Add" affordance. */
export function emptyRecentListing(): SettingsRecentListing {
  return { address: "" };
}

function clampHeading(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 360
    ? value
    : undefined;
}

/** Photo-framing focal percentage [0,100]; anything else → undefined (centered). */
function clampFocalPct(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : undefined;
}

/** Photo-framing zoom [1,2]; anything else → undefined (no zoom). */
function clampPhotoScale(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 2
    ? value
    : undefined;
}

/**
 * Load-boundary clamp (mirrors `clampStoredReviews`). Coerces a stored
 * `recentListings` blob to the declared shape, hard-caps at
 * `RECENT_LISTINGS_CAP`, and KEEPS empty-address rows (unlike the projector)
 * so an agent's in-progress row they haven't filled in yet survives a reload.
 * Returns undefined when nothing usable survives so "no listings" is a single
 * state. Defense-at-boundary: a tampered record can't smuggle nested junk or a
 * non-string field into the editor.
 */
export function clampStoredRecentListings(
  raw: unknown,
): SettingsRecentListing[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SettingsRecentListing[] = [];
  for (const item of raw) {
    if (out.length >= RECENT_LISTINGS_CAP) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const listing: SettingsRecentListing = {
      address: typeof r.address === "string" ? r.address : "",
    };
    if (typeof r.city === "string" && r.city.length > 0) listing.city = r.city;
    if (typeof r.viewCount === "string" && r.viewCount.length > 0)
      listing.viewCount = r.viewCount;
    if (typeof r.sourceLabel === "string" && r.sourceLabel.length > 0)
      listing.sourceLabel = r.sourceLabel;
    if (typeof r.photoUrl === "string" && r.photoUrl.length > 0)
      listing.photoUrl = r.photoUrl;
    if (typeof r.streetViewPanoId === "string" && r.streetViewPanoId.length > 0)
      listing.streetViewPanoId = r.streetViewPanoId;
    if (typeof r.hasStreetView === "boolean")
      listing.hasStreetView = r.hasStreetView;
    const heading = clampHeading(r.streetViewHeading);
    if (heading !== undefined) listing.streetViewHeading = heading;
    const fx = clampFocalPct(r.photoFocalX);
    if (fx !== undefined) listing.photoFocalX = fx;
    const fy = clampFocalPct(r.photoFocalY);
    if (fy !== undefined) listing.photoFocalY = fy;
    const scale = clampPhotoScale(r.photoScale);
    if (scale !== undefined) listing.photoScale = scale;
    out.push(listing);
  }
  return out.length ? out : undefined;
}

/**
 * Parse a stored view-count display string ("41,184") to a non-negative
 * integer, or undefined when blank / unparseable. The projector's
 * `clampViewCount` is a number gate, so a string would silently drop — this is
 * the one place the Settings string becomes the projector's number.
 */
export function parseStoredViewCount(
  value: string | undefined,
): number | undefined {
  const digits = stripToDigits(value);
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Map the Settings listings to the projector's permissive input shape
 * (`brandWhyUs.recentListings`). The only transform is `viewCount` string →
 * integer; every other field passes through verbatim for the projector to
 * enumerate, clamp, cap, and drop. Returns undefined when there's nothing to
 * project, so the `recentListings` key never appears on the payload as an empty
 * husk. The publish projector is still the public-safe boundary — this is a
 * convenience mapper, not a security gate.
 */
export function recentListingsToPublishInput(
  listings: SettingsRecentListing[] | undefined,
): unknown[] | undefined {
  if (!Array.isArray(listings) || listings.length === 0) return undefined;
  return listings.map((l) => {
    const out: Record<string, unknown> = { address: l.address };
    if (l.city) out.city = l.city;
    const viewCount = parseStoredViewCount(l.viewCount);
    if (viewCount !== undefined) out.viewCount = viewCount;
    if (l.sourceLabel) out.sourceLabel = l.sourceLabel;
    if (l.photoUrl) out.photoUrl = l.photoUrl;
    if (l.streetViewPanoId) out.streetViewPanoId = l.streetViewPanoId;
    if (typeof l.hasStreetView === "boolean") out.hasStreetView = l.hasStreetView;
    if (l.streetViewHeading !== undefined)
      out.streetViewHeading = l.streetViewHeading;
    if (typeof l.photoFocalX === "number") out.photoFocalX = l.photoFocalX;
    if (typeof l.photoFocalY === "number") out.photoFocalY = l.photoFocalY;
    if (typeof l.photoScale === "number") out.photoScale = l.photoScale;
    return out;
  });
}

/**
 * Map ONE Settings listing to the public card shape (`PublicRecentListing`) for a
 * read-only, in-Settings preview that mounts the real coverflow `ListingCard`.
 *
 * It mirrors the publish projector's field enumeration but is a DISPLAY
 * convenience, NOT a public-safe boundary: the publish path still hardens through
 * `projectRecentListings`. The only transform is the view-count display string
 * ("41,184") -> integer, the same one `recentListingsToPublishInput` does;
 * everything else passes through verbatim, and fields the card never reads are
 * simply omitted. Unset framing stays unset, so the preview centers exactly like
 * the published card does for a freshly uploaded photo.
 */
export function settingsListingToPublicCard(
  l: SettingsRecentListing,
): PublicRecentListing {
  const out: PublicRecentListing = { address: l.address };
  if (l.city) out.city = l.city;
  const viewCount = parseStoredViewCount(l.viewCount);
  if (viewCount !== undefined) out.viewCount = viewCount;
  if (l.sourceLabel) out.sourceLabel = l.sourceLabel;
  if (l.photoUrl) out.photoUrl = l.photoUrl;
  if (l.streetViewPanoId) out.streetViewPanoId = l.streetViewPanoId;
  if (typeof l.hasStreetView === "boolean") out.hasStreetView = l.hasStreetView;
  if (l.streetViewHeading !== undefined)
    out.streetViewHeading = l.streetViewHeading;
  if (typeof l.photoFocalX === "number") out.photoFocalX = l.photoFocalX;
  if (typeof l.photoFocalY === "number") out.photoFocalY = l.photoFocalY;
  if (typeof l.photoScale === "number") out.photoScale = l.photoScale;
  return out;
}
