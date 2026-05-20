"use client";

import { useEffect, useRef, useState } from "react";
import { generateId } from "./ids";

/**
 * Per-listing property data shared across templates that render
 * a single listing (currently listing-card + listing-showcase).
 *
 * Mirrors the `useBrandSettings` pattern from src/lib/brand.ts:
 * localStorage-backed, hydrates client-side on mount (SSR-safe),
 * single-profile (not named profiles — agents typically work
 * on one listing at a time).
 *
 * Write-back semantics — C.3 from the H-7.12 audit:
 *   - On the initial render of a listing-consumer template, the
 *     editor populates empty form fields from the saved profile
 *     ("first-edit-only" defaults injection).
 *   - Subsequent edits stay LOCAL to the template's form state.
 *   - A "Save changes to listing profile" button appears when the
 *     current template state diverges from the saved profile; the
 *     user explicitly commits via that button (no auto-save).
 *
 * Hero photo storage: data URL string (matches the brand profile's
 * logoDataUrl pattern). The hook materializes the data URL into
 * an HTMLImageElement so templates can pass it straight into the
 * canvas timeline's assets map.
 */
export interface ListingProfile {
  /**
   * Stable identifier for this property (Substrate §2.3). Optional in
   * the type because legacy records persisted before v1.47 don't carry
   * one; `saveListingProfile` backfills on the next write so the field
   * becomes effectively-present for any record the user touches. The
   * Seller Presentation workflow requires a populated value before it
   * can construct a WorkflowInstance.
   */
  propertyId?: string;
  heroPhoto: string;       // data URL or empty
  status: string;          // "Just Listed", "Just Sold", "Open House", etc.
  address: string;
  cityState: string;
  price: string;           // formatted display, e.g. "$685,000" (H-7.10 state=display contract)
  beds: string;
  baths: string;
  sqft: string;            // formatted display, e.g. "2,840"
}

const STORAGE_KEY = "socanim_listing_profile";

const DEFAULT_LISTING_PROFILE: ListingProfile = {
  // propertyId intentionally absent — the default record represents
  // "no listing yet", and a stable id is only assigned once the user
  // saves real data (see saveListingProfile).
  heroPhoto: "",
  status: "Just Listed",
  address: "",
  cityState: "",
  price: "",
  beds: "",
  baths: "",
  sqft: "",
};

/** Keys of ListingProfile that map directly to template state fields. */
export const LISTING_PROFILE_FIELDS: Array<keyof ListingProfile> = [
  "status",
  "address",
  "cityState",
  "price",
  "beds",
  "baths",
  "sqft",
];

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

export function loadListingProfile(): ListingProfile {
  if (typeof window === "undefined") return DEFAULT_LISTING_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LISTING_PROFILE;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      propertyId:
        typeof parsed.propertyId === "string" && parsed.propertyId.length > 0
          ? parsed.propertyId
          : undefined,
      heroPhoto: str(parsed.heroPhoto),
      status: str(parsed.status, DEFAULT_LISTING_PROFILE.status),
      address: str(parsed.address),
      cityState: str(parsed.cityState),
      price: str(parsed.price),
      beds: str(parsed.beds),
      baths: str(parsed.baths),
      sqft: str(parsed.sqft),
    };
  } catch {
    return DEFAULT_LISTING_PROFILE;
  }
}

/**
 * Persist the profile, backfilling `propertyId` when absent (Substrate
 * §2.3 — stable IDs on first write). Returns the exact shape that was
 * persisted so callers (in particular `useListingProfile.update`) can
 * mirror the newly-assigned id into their in-memory state without a
 * round-trip through `loadListingProfile`.
 */
export function saveListingProfile(profile: ListingProfile): ListingProfile {
  const withId: ListingProfile = profile.propertyId
    ? profile
    : { ...profile, propertyId: generateId("property") };
  if (typeof window === "undefined") return withId;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withId));
  } catch {
    // ignore quota / storage-disabled
  }
  return withId;
}

/**
 * React hook that hydrates the listing profile from localStorage on
 * mount and exposes a setter that persists writes back. Returns:
 *
 *   settings       — the current profile (DEFAULT until first useEffect runs)
 *   heroPhotoImg   — materialized HTMLImageElement from settings.heroPhoto,
 *                    or null if no hero photo / still loading
 *   update         — partial updater that merges-and-persists
 *   hydrated       — true once initial load from localStorage has completed,
 *                    so callers can defer "first-edit-only" merge until the
 *                    profile is known
 */
export function useListingProfile() {
  const [settings, setSettings] = useState<ListingProfile>(
    DEFAULT_LISTING_PROFILE
  );
  const [hydrated, setHydrated] = useState(false);
  const [heroPhotoImg, setHeroPhotoImg] =
    useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setSettings(loadListingProfile());
    setHydrated(true);
  }, []);

  // Materialize hero photo from its data URL whenever settings change.
  // Mirrors useBrandSettings.logoImg's pattern in src/lib/brand.ts.
  const lastSrcRef = useRef<string>("");
  useEffect(() => {
    const src = settings.heroPhoto;
    if (!src) {
      if (lastSrcRef.current !== "") {
        setHeroPhotoImg(null);
        lastSrcRef.current = "";
      }
      return;
    }
    if (src === lastSrcRef.current) return;
    const img = new Image();
    img.onload = () => setHeroPhotoImg(img);
    img.onerror = () => setHeroPhotoImg(null);
    img.src = src;
    lastSrcRef.current = src;
  }, [settings.heroPhoto]);

  const update = (next: Partial<ListingProfile>) => {
    const merged = { ...settings, ...next };
    // saveListingProfile backfills propertyId when absent and returns
    // the persisted shape — mirror that into local state so the id
    // shows up in the same render cycle as the user's first save.
    const persisted = saveListingProfile(merged);
    setSettings(persisted);
  };

  return { settings, heroPhotoImg, update, hydrated };
}
