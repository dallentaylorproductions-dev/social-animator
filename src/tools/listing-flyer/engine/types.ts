/**
 * Listing flyer form data shape. Photos are tracked separately because they
 * carry runtime objects (File, HTMLImageElement, blob URLs) that can't be
 * JSON-serialized for localStorage.
 */
export interface FlyerDraft {
  status: string;
  addressLine1: string;
  addressLine2: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  /** Up to 5 short feature bullets. */
  features: string[];
  /**
   * Per-flyer color override. Empty string means "use brand profile color"
   * — the form displays brand colors via `draft.primaryColor || brand.primaryColor`,
   * the user typing into the input sets the override, and Reset clears
   * back to "" to fall through to brand again.
   */
  primaryColor: string;
  accentColor: string;
  /**
   * Per-flyer PDF background color override. Empty string means "use white"
   * (brand profile doesn't currently expose a background color, so the
   * fallback is the tool default rather than a brand value).
   */
  backgroundColor: string;
}

/** Photo entry held in component state only (NOT persisted to localStorage). */
export interface FlyerPhoto {
  /** Stable id for keyed lists + reordering. */
  id: string;
  /** Source File from the upload input. */
  file: File;
  /** Object URL — used by preview UI and react-pdf <Image>. */
  url: string;
  /** Materialized HTMLImageElement — used by canvas pipeline (MP4 export). */
  img: HTMLImageElement | null;
}

export const EMPTY_DRAFT: FlyerDraft = {
  status: "",
  addressLine1: "",
  addressLine2: "",
  price: "",
  beds: "",
  baths: "",
  sqft: "",
  features: [],
  primaryColor: "",
  accentColor: "",
  backgroundColor: "",
};

export const MAX_PHOTOS = 5;
export const MAX_FEATURES = 5;

/**
 * URL-safe slug from an address line. Used to name downloaded PDF/MP4 files.
 * Falls back to "listing-flyer" for empty input.
 */
export function addressSlug(line1: string): string {
  const slug = line1
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "listing-flyer";
}

/**
 * Required fields for export. Returns null when ready, or a short message
 * naming the first missing piece.
 */
export function validateForExport(
  draft: FlyerDraft,
  photoCount: number
): string | null {
  if (!draft.addressLine1.trim()) return "Add a street address";
  if (!draft.price.trim()) return "Add a list price";
  if (photoCount === 0) return "Add at least one photo";
  return null;
}
