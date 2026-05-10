/**
 * Types and validation for the Open House Promo Generator.
 *
 * Stateless tool: every input is part of PromoDraft, persisted as a
 * single localStorage entry. Photos store as compressed JPEG data
 * URLs inline (1600px max edge, q=0.85, ~150-300KB each) so a draft
 * survives reload without separate file handling. Multiple photos
 * push localStorage usage but stay well under the 5MB practical
 * quota (5 photos × 300KB = 1.5MB worst case).
 *
 * H-7f added focal-point per-photo so the crop honors what the
 * realtor wants framed (the front door of a house is rarely at the
 * geometric center of a phone photo). PhotoEntry replaces the
 * earlier string[] shape; clampDraft migrates old drafts in-place.
 */

import { DEFAULT_FOCAL_X, DEFAULT_FOCAL_Y } from "./crop";

export interface PhotoEntry {
  /** Compressed JPEG data URL (1600px max edge, q=0.85). */
  src: string;
  /** Horizontal focal point as a percent of source width (0-100). */
  focalX: number;
  /** Vertical focal point as a percent of source height (0-100). */
  focalY: number;
}

export interface PromoDraft {
  // Event window
  /** ISO date "YYYY-MM-DD". */
  eventDate: string;
  /** 24h "HH:mm". */
  eventStartTime: string;
  /** 24h "HH:mm". */
  eventEndTime: string;

  // Property
  propertyAddress: string;
  /** "City, ST 12345". */
  propertyCity: string;
  /** Display string — "$685,000". */
  listingPrice: string;
  /** 1-2 sentence pitch shown below the property block. */
  description: string;

  // Highlights — short bullets like "4BR/3BA" or "Mountain views"
  propertyHighlights: string[];

  // Photos — compressed data URLs (1600px max edge, JPEG q=0.85)
  // with per-photo focal-point pair for crop framing.
  photos: PhotoEntry[];

  // QR target — fully-qualified URL ("https://..."). clampDraft
  // auto-prefixes "https://" for bare-domain input.
  qrTargetUrl: string;

  // Optional event-day notes (refreshments, RSVP, parking, etc.)
  eventNotes: string;

  // Per-promo color overrides — same pattern as flyer/presentation.
  // Empty falls through to BrandSettings.
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;

  // MP4 export length in seconds. H-7.1 added user-configurable
  // duration (5-15s) matching the Listing Flyer's slider.
  // Animation timing in timeline.ts adapts: entrance window stays
  // fixed at 0-1.55s so the intro feels snappy regardless of
  // total length; Ken Burns and QR pulse scale to fit.
  mp4DurationSeconds: number;
}

export const MIN_MP4_DURATION = 5;
export const MAX_MP4_DURATION = 15;
/** 6s preserves H-7's pre-slider behavior so existing drafts
 *  render identically without explicit migration. */
export const DEFAULT_MP4_DURATION = 6;

export function clampMp4Duration(n: unknown): number {
  const v =
    typeof n === "number" && Number.isFinite(n)
      ? n
      : DEFAULT_MP4_DURATION;
  return Math.max(
    MIN_MP4_DURATION,
    Math.min(MAX_MP4_DURATION, Math.round(v))
  );
}

export const MAX_HIGHLIGHTS = 5;
export const MAX_PHOTOS = 5;
/** Compress photos to ≤1600px on the longest side, JPEG q=0.85. Same
 *  budget the flyer uses for its react-pdf input — print-quality at a
 *  manageable file size. */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.85;

/** Today's date as YYYY-MM-DD in the user's local timezone. Used as
 *  the EMPTY_DRAFT default so a fresh draft starts on the user's
 *  current day rather than 1970-01-01. */
function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const EMPTY_DRAFT: PromoDraft = {
  eventDate: todayIsoDate(),
  eventStartTime: "12:00",
  eventEndTime: "15:00",
  propertyAddress: "",
  propertyCity: "",
  listingPrice: "",
  description: "",
  propertyHighlights: ["", "", ""],
  photos: [],
  qrTargetUrl: "",
  eventNotes: "",
  primaryColor: "",
  accentColor: "",
  backgroundColor: "",
  mp4DurationSeconds: DEFAULT_MP4_DURATION,
};

/** Build a fresh PhotoEntry from a compressed data URL with default
 *  focal point (slight downward bias for typical real-estate
 *  exteriors). Used by the form upload handler. */
export function makePhotoEntry(src: string): PhotoEntry {
  return {
    src,
    focalX: DEFAULT_FOCAL_X,
    focalY: DEFAULT_FOCAL_Y,
  };
}

function clampPhotoEntry(input: unknown): PhotoEntry | null {
  // Old-format string is migrated to a PhotoEntry with default focal.
  if (typeof input === "string" && input.startsWith("data:")) {
    return makePhotoEntry(input);
  }
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.src !== "string" || !o.src.startsWith("data:")) return null;
  const fx =
    typeof o.focalX === "number" && Number.isFinite(o.focalX)
      ? Math.max(0, Math.min(100, o.focalX))
      : DEFAULT_FOCAL_X;
  const fy =
    typeof o.focalY === "number" && Number.isFinite(o.focalY)
      ? Math.max(0, Math.min(100, o.focalY))
      : DEFAULT_FOCAL_Y;
  return { src: o.src, focalX: fx, focalY: fy };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Coerce arbitrary localStorage-shaped input into a valid PromoDraft.
 * Handles missing keys, wrong types, oversized arrays, malformed dates
 * and times, and bare-domain QR URLs (auto-prefixes https://).
 */
export function clampDraft(input: unknown): PromoDraft {
  if (!input || typeof input !== "object") return EMPTY_DRAFT;
  const o = input as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  const date =
    typeof o.eventDate === "string" && ISO_DATE_RE.test(o.eventDate)
      ? o.eventDate
      : EMPTY_DRAFT.eventDate;
  const startTime =
    typeof o.eventStartTime === "string" && TIME_RE.test(o.eventStartTime)
      ? o.eventStartTime
      : EMPTY_DRAFT.eventStartTime;
  const endTime =
    typeof o.eventEndTime === "string" && TIME_RE.test(o.eventEndTime)
      ? o.eventEndTime
      : EMPTY_DRAFT.eventEndTime;

  const highlights = Array.isArray(o.propertyHighlights)
    ? o.propertyHighlights
        .filter((s): s is string => typeof s === "string")
        .slice(0, MAX_HIGHLIGHTS)
    : [];
  const photos: PhotoEntry[] = Array.isArray(o.photos)
    ? o.photos
        .map(clampPhotoEntry)
        .filter((p): p is PhotoEntry => p !== null)
        .slice(0, MAX_PHOTOS)
    : [];

  return {
    eventDate: date,
    eventStartTime: startTime,
    eventEndTime: endTime,
    propertyAddress: str(o.propertyAddress),
    propertyCity: str(o.propertyCity),
    listingPrice: str(o.listingPrice),
    description: str(o.description),
    propertyHighlights: highlights,
    photos,
    qrTargetUrl: normalizeUrl(str(o.qrTargetUrl)),
    eventNotes: str(o.eventNotes),
    primaryColor: str(o.primaryColor),
    accentColor: str(o.accentColor),
    backgroundColor: str(o.backgroundColor),
    // Old drafts (pre-H-7.1) won't have this field; default to
    // 6s preserves their original render behavior.
    mp4DurationSeconds: clampMp4Duration(o.mp4DurationSeconds),
  };
}

/**
 * Normalize a user-typed URL: trim, then prefix "https://" if the
 * value looks like a bare domain (e.g. "example.com/path"). Empty
 * input passes through as empty so callers can detect "user has not
 * entered a URL yet".
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Allow "mailto:" and "tel:" and other protocols too — only prefix
  // https when input has no scheme separator.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Slug for filenames — lowercase, hyphens, no special chars. */
export function addressSlug(address: string): string {
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "open-house";
}

/** Build the export filename prefix: "[YYYY-MM-DD]-[address-slug]". */
export function exportFilenamePrefix(draft: PromoDraft): string {
  return `${draft.eventDate}-${addressSlug(draft.propertyAddress)}`;
}

/** "12:00" + "15:00" → "12:00 PM – 3:00 PM" for display. Returns
 *  the raw "HH:mm" if either input is unparseable. */
export function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string): string | null => {
    const m = t.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    const hour12 = ((h + 11) % 12) + 1;
    const ampm = h < 12 ? "AM" : "PM";
    const minStr = mi === 0 ? "" : `:${String(mi).padStart(2, "0")}`;
    return `${hour12}${minStr} ${ampm}`;
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s || !e) return `${start} – ${end}`;
  return `${s} – ${e}`;
}

/** "2026-05-15" → "Saturday, May 15" (or "Friday, May 15, 2026" if
 *  the year differs from now). Returns the raw ISO string on parse
 *  failure. */
export function formatEventDate(iso: string): string {
  if (!ISO_DATE_RE.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  const now = new Date();
  const includeYear = y !== now.getFullYear();
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
  });
}

/** Returns a user-facing error message, or null if the draft can be
 *  exported. eventDate / eventStartTime / propertyAddress are
 *  required; the rest is optional. */
export function validateForExport(draft: PromoDraft): string | null {
  if (!draft.eventDate) return "Pick the event date";
  if (!draft.eventStartTime) return "Set the event start time";
  if (!draft.propertyAddress.trim()) return "Add the property address";
  return null;
}
