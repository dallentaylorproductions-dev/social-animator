import { clampDraft, EMPTY_DRAFT, type SellerIntelligenceReportDraft } from './types';

const STORAGE_KEY = 'sellerIntelligenceReport:draft';

export function loadDraft(): SellerIntelligenceReportDraft {
  if (typeof window === 'undefined' || !window.localStorage) return { ...EMPTY_DRAFT };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...EMPTY_DRAFT };
  try {
    return clampDraft(JSON.parse(raw));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function saveDraft(draft: SellerIntelligenceReportDraft): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
