"use client";

import { useEffect, useRef, useState } from "react";

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

export function saveListingProfile(profile: ListingProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore quota / storage-disabled
  }
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
    setSettings(merged);
    saveListingProfile(merged);
  };

  return { settings, heroPhotoImg, update, hydrated };
}
