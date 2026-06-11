import type { AccessMode } from "./types";

/**
 * Cohort safety caps (v1.47 hotfix, cohort readiness 2026-05-28).
 *
 * Centralized so the server-only route handlers AND the offline unit
 * tests share one source of truth. The routes import @/lib/auth +
 * @vercel/kv (server-only), so the spec imports these PURE tables /
 * helpers directly rather than pulling a route handler into the test.
 */

// ----- Daily comp-import cap -----

/**
 * Daily comp-import cap per access mode. The flat 10/day was too tight
 * for back-to-back testing + curious cohort "playing with the tool" use.
 * KV key shape (ai_comp_import_count:<email>:<YYYY-MM-DD>) is unchanged —
 * only the comparison value moves.
 */
export const DAILY_COMP_IMPORT_CAPS: Record<AccessMode, number> = {
  "internal-test": 100, // Dallen testing — generous
  "team-invite": 50, // cohort agents — comfortable headroom for active + curious use
  trial: 15, // trial users — reasonable for a typical sales cycle
  paid: 25, // paid agents — 2-3 imports/day across multiple listings
};

export const DAILY_COMP_IMPORT_CAP_FALLBACK = 10;

export function dailyCompImportCap(mode: string | undefined): number {
  return (
    DAILY_COMP_IMPORT_CAPS[mode as AccessMode] ?? DAILY_COMP_IMPORT_CAP_FALLBACK
  );
}

// ----- Per-user video upload cap (rolling 30 days) -----

/**
 * Rolling-30-day per-user video upload cap per access mode. Bounds
 * Vercel Blob storage runaway from a single runaway uploader during the
 * 2-week cohort window — a worst-case agent pushing 100 × ~75 MB test
 * clips is otherwise unbounded today.
 */
export const VIDEO_UPLOAD_CAPS_30D: Record<AccessMode, number> = {
  "internal-test": 200, // Dallen testing
  "team-invite": 30, // cohort agents — ~10 listings × 1-2 videos with re-uploads
  trial: 15,
  paid: 25,
};

export const VIDEO_UPLOAD_CAP_FALLBACK = 10;

/** Rolling window TTL. 30 days = 2592000 seconds. */
export const VIDEO_UPLOAD_WINDOW_SECONDS = 30 * 24 * 60 * 60;

export function videoUploadCap30d(mode: string | undefined): number {
  return (
    VIDEO_UPLOAD_CAPS_30D[mode as AccessMode] ?? VIDEO_UPLOAD_CAP_FALLBACK
  );
}

// ----- Max simultaneous LIVE seller pages (SP-LIB "Your pages" library) -----

/**
 * Max number of LIVE (published, non-archived) seller pages an agent may
 * keep up at once, per access mode. Only Live pages count — Drafts and
 * Archived pages are free.
 *
 * SHOWN, NOT ENFORCED yet (pre-billing): the library's usage meter +
 * the calm at-limit banner read this number, but creating / publishing
 * beyond it is NOT blocked — enforcement waits for billing (`maxLivePages`
 * gate left as a single seam in the pages route). Values are deliberately
 * roomy so the soft nudge never gets in a real agent's way during the
 * cohort window, and so flipping enforcement on later never tightens the
 * limit on an existing user (grandfather-friendly).
 */
export const MAX_LIVE_PAGES_CAPS: Record<AccessMode, number> = {
  "internal-test": 100, // Dallen testing — effectively unlimited
  "team-invite": 25, // cohort agents — generous headroom across active listings
  trial: 3, // trial users — enough to feel the tool, gently bounded
  paid: 10, // paid agents — a healthy book of live listings
};

export const MAX_LIVE_PAGES_CAP_FALLBACK = 5;

export function maxLivePagesCap(mode: string | undefined): number {
  return (
    MAX_LIVE_PAGES_CAPS[mode as AccessMode] ?? MAX_LIVE_PAGES_CAP_FALLBACK
  );
}
