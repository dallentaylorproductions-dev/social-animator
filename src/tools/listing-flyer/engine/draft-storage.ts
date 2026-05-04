import { type FlyerDraft, EMPTY_DRAFT, clampDuration } from "./types";

const STORAGE_KEY = "listingFlyer:draft";

/**
 * localStorage persistence for the in-progress flyer form. Photos are NOT
 * persisted (they're File / HTMLImageElement objects that don't serialize
 * usefully); they restart blank on reload. Text fields, status, features all
 * round-trip.
 *
 * Cleared on successful export of either output (PDF or MP4) so the next
 * listing starts fresh.
 */
export function loadDraft(): FlyerDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      status: str(parsed.status),
      addressLine1: str(parsed.addressLine1),
      addressLine2: str(parsed.addressLine2),
      price: str(parsed.price),
      beds: str(parsed.beds),
      baths: str(parsed.baths),
      sqft: str(parsed.sqft),
      features: Array.isArray(parsed.features)
        ? parsed.features.filter((f): f is string => typeof f === "string")
        : [],
      primaryColor: str(parsed.primaryColor),
      accentColor: str(parsed.accentColor),
      backgroundColor: str(parsed.backgroundColor),
      // Clamp to [MIN_DURATION, MAX_DURATION]; missing field (drafts saved
      // before H-1.6) falls through to the DEFAULT_DURATION inside clampDuration.
      duration: clampDuration(parsed.duration),
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: FlyerDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota errors etc — auto-save is best-effort.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
