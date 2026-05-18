import { clampDraft, EMPTY_DRAFT, type OpenHousePrepDraft } from './types';

/**
 * localStorage-backed draft persistence for the Open House Prep tool.
 * Mirrors SIR's draft-storage shape — colon-prefixed key, defense-at-
 * boundary on JSON.parse, clear-on-revoke semantics for testability.
 */

const STORAGE_KEY = 'openHousePrep:draft';

export function loadDraft(): OpenHousePrepDraft {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...EMPTY_DRAFT };
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...EMPTY_DRAFT };
  try {
    return clampDraft(JSON.parse(raw));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function saveDraft(draft: OpenHousePrepDraft): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
