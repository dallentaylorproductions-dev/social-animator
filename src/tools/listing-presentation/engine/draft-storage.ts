"use client";

import {
  type PresentationDraft,
  EMPTY_DRAFT,
  clampDraft,
} from "./types";

const STORAGE_KEY = "listingPresentation:draft";

/** Load draft from localStorage, falling back to EMPTY_DRAFT on missing
 *  or corrupt data. clampDraft normalizes any shape drift across versions. */
export function loadDraft(): PresentationDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    return clampDraft(JSON.parse(raw));
  } catch {
    return EMPTY_DRAFT;
  }
}

/** Best-effort save. Silently swallows quota errors (the headshot data
 *  URL is the only field large enough to push into quota territory; if
 *  it does, the user will see their changes after refresh except for
 *  the headshot — acceptable degraded state). */
export function saveDraft(draft: PresentationDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / serialization errors — auto-save is best-effort
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
