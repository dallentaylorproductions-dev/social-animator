"use client";

import {
  type PromoDraft,
  EMPTY_DRAFT,
  clampDraft,
} from "./types";

const STORAGE_KEY = "openHousePromo:draft";

/** Load draft from localStorage, falling back to EMPTY_DRAFT on
 *  missing or corrupt data. clampDraft normalizes shape drift. */
export function loadDraft(): PromoDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    return clampDraft(JSON.parse(raw));
  } catch {
    return EMPTY_DRAFT;
  }
}

/** Best-effort save. Photo data URLs are the only field large enough
 *  to push into quota territory; if quota is exceeded, the last-saved
 *  draft remains and the user sees their changes after refresh
 *  except for the most recent photo additions — acceptable degraded
 *  state. */
export function saveDraft(draft: PromoDraft): void {
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
