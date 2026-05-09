/**
 * Types and validation for the Open House Promo Generator.
 *
 * Stateless tool: every input is part of PromoDraft, persisted as a
 * single localStorage entry. Photos store as compressed JPEG data
 * URLs inline (1600px max edge, q=0.85, ~150-300KB each) so a draft
 * survives reload without separate file handling. Multiple photos
 * push localStorage usage but stay well under the 5MB practical
 * quota (5 photos × 300KB = 1.5MB worst case).
 */

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
  photos: string[];

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
};

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
  const photos = Array.isArray(o.photos)
    ? o.photos
        .filter((p): p is string => typeof p === "string" && p.startsWith("data:"))
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
