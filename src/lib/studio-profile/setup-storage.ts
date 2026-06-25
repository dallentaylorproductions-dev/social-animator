"use client";

/**
 * Studio Profile — crash-safety draft buffer (Slice 1, CLIENT).
 *
 * The explicit per-step "Save & continue" is the reward commit to BrandSettings
 * (via useBrandSettings().update). THIS is the quiet background safety net: the
 * agent's UNSAVED overlay (what they've typed but not yet committed) + their
 * current screen are debounced here so a refresh / accidental close mid-typing
 * doesn't lose work. It is NOT the brand record and never reaches a public page.
 *
 * Stored under `socanim_studio_setup` — a per-account key REGISTERED in
 * account-storage.ts's clear list, so it is wiped on account change (the known
 * cross-account leak class). The overlay holds only the Slice-1 Studio fields,
 * never the whole brand blob.
 */
import type { BrandSettings } from "@/lib/brand";

export const STUDIO_SETUP_STORAGE_KEY = "socanim_studio_setup";

export interface StudioSetupBuffer {
  /** The screen the agent was on (intro | you | reach | proof | checkpoint | phase2). */
  screen?: string;
  /** Uncommitted edits (a partial BrandSettings overlay) — restored on reload. */
  overlay?: Partial<BrandSettings>;
  /** Epoch ms the flow started, so time-to-client-ready survives a reload. */
  startedAt?: number;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function loadStudioBuffer(): StudioSetupBuffer | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STUDIO_SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioSetupBuffer;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStudioBuffer(buffer: StudioSetupBuffer): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STUDIO_SETUP_STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // storage disabled / full — safety net degrades silently.
  }
}

export function clearStudioBuffer(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STUDIO_SETUP_STORAGE_KEY);
  } catch {
    // ignore
  }
}
