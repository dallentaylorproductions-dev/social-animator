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
  /**
   * MP4 export length in seconds. Range [5, 15]. Entry timing is fixed —
   * only the trailing static dwell scales with this value.
   */
  duration: number;

  /**
   * MP4 format selection. H-7.2.2a added per-export opt-in. Reel
   * is the recommended default (vertical reels dominate realtor
   * social distribution); square is opt-in for agents who also
   * want an Instagram-feed asset. Rendering one format halves
   * the wait time vs always rendering both.
   */
  exportFormats: ExportFormatSelection;
}

export interface ExportFormatSelection {
  /** 9:16 vertical — Stories, Reels, TikTok. */
  reel: boolean;
  /** 1:1 square — Instagram feed, Facebook. */
  square: boolean;
}

/**
 * Coerce stored exportFormats into a valid selection. Pre-H-7.2.2a
 * drafts won't have this field; default to reel-only. Defensive
 * against the both-false state — must render at least one format.
 */
export function clampExportFormats(input: unknown): ExportFormatSelection {
  if (!input || typeof input !== "object") return { reel: true, square: false };
  const o = input as Record<string, unknown>;
  const reel = typeof o.reel === "boolean" ? o.reel : true;
  const square = typeof o.square === "boolean" ? o.square : false;
  if (!reel && !square) return { reel: true, square: false };
  return { reel, square };
}

export const MIN_DURATION = 5;
export const MAX_DURATION = 15;
export const DEFAULT_DURATION = 8;

export function clampDuration(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : DEFAULT_DURATION;
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(v)));
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
  duration: DEFAULT_DURATION,
  exportFormats: { reel: true, square: false },
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
