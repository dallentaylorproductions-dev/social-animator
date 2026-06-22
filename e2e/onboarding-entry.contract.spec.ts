import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ONBOARDING ENTRY contract — the new/returning/replay gate, pinned forever.
 *
 * Why this exists: onboarding is first-run-only (the dashboard gate routes a
 * brand-NEW account — zero owned pages, not already seen — into /welcome, and
 * everyone else to the dashboard). A returning/cohort user (Aaron) therefore
 * correctly NEVER re-sees it, which means it can't be demoed or re-smoked
 * without burning a fresh email. This spec pins three things so neither the
 * gate nor the replay escape hatch can silently drift:
 *
 *   1. The new-vs-returning DECISION (the pure `decideOnboardingEntry`), incl.
 *      the precedence of the "seen" marker over a zero-page count.
 *   2. The browser-leak invariant (A2): a stale "seen"/path-A marker from a
 *      PRIOR account on the same browser must NOT make a genuinely-new account
 *      skip onboarding — `reconcileAccountOwnership` clears it on account change
 *      BEFORE the gate reads it.
 *   3. REPLAY (`/welcome?replay=1`): renders the hybrid flow for ANY account
 *      regardless of the onboarding flags (so it works on prod), and is
 *      NON-DESTRUCTIVE (no real brand/page/draft/marker write) — proven by
 *      source-contract greps on every write seam, since the flag-off harness
 *      can't drive the authenticated flow (see pages-library harness note).
 *
 * Node-context (no browser), matching account-isolation-churn.smoke.spec.ts:
 * an in-memory localStorage shim flips the `typeof window` guards truthy.
 */

import {
  decideOnboardingEntry,
  isReplayRequested,
} from '../src/lib/onboarding/entry-gate';
import { reconcileAccountOwnership } from '../src/lib/account-storage';
import { hasSeenOnboarding, markOnboardingSeen } from '../src/lib/onboarding/seen';

/* ───────────────────── 1. new-vs-returning decision ─────────────────────── */

test.describe('onboarding entry — the new/returning decision (pure)', () => {
  test('a brand-NEW account (0 pages, not seen) routes to /welcome', () => {
    expect(
      decideOnboardingEntry({ seen: false, activityStatus: 'ready', totalPages: 0 }),
    ).toBe('welcome');
  });

  test('a RETURNING account (>=1 page) stays on the dashboard', () => {
    expect(
      decideOnboardingEntry({ seen: false, activityStatus: 'ready', totalPages: 1 }),
    ).toBe('stay');
    expect(
      decideOnboardingEntry({ seen: false, activityStatus: 'ready', totalPages: 9 }),
    ).toBe('stay');
  });

  test('an already-SEEN account at 0 pages stays (an intentional skip sticks)', () => {
    expect(
      decideOnboardingEntry({ seen: true, activityStatus: 'ready', totalPages: 0 }),
    ).toBe('stay');
  });

  test('while activity is loading the gate WAITS (no cold-dashboard flash)', () => {
    expect(
      decideOnboardingEntry({ seen: false, activityStatus: 'loading', totalPages: 0 }),
    ).toBe('wait');
  });

  test('an UNAVAILABLE activity source falls through to the dashboard', () => {
    expect(
      decideOnboardingEntry({ seen: false, activityStatus: 'unavailable', totalPages: 0 }),
    ).toBe('stay');
  });
});

/* ───────────────────── 2. replay request parsing ────────────────────────── */

test.describe('onboarding entry — replay request parsing', () => {
  test('?replay=1 is the only trigger', () => {
    expect(isReplayRequested('1')).toBe(true);
    expect(isReplayRequested(['1'])).toBe(true);
  });

  test('absent / any other value is NOT replay (no accidental entry)', () => {
    expect(isReplayRequested(undefined)).toBe(false);
    expect(isReplayRequested('')).toBe(false);
    expect(isReplayRequested('0')).toBe(false);
    expect(isReplayRequested('true')).toBe(false);
    expect(isReplayRequested(['0', '1'])).toBe(false);
  });
});

/* ──────────── 3. browser-leak: a stale marker can't skip onboarding ───────── */

type MutableGlobal = typeof globalThis & {
  window?: { localStorage: Storage };
};

function installLocalStorageShim(): void {
  const backing = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (k) => backing.get(k) ?? null,
    key: (i) => Array.from(backing.keys())[i] ?? null,
    removeItem: (k) => {
      backing.delete(k);
    },
    setItem: (k, v) => {
      backing.set(k, String(v));
    },
  };
  (globalThis as MutableGlobal).window = { localStorage: shim };
}

function uninstallLocalStorageShim(): void {
  delete (globalThis as MutableGlobal).window;
}

test.describe('onboarding entry — stale-marker leak (A2)', () => {
  test.beforeEach(installLocalStorageShim);
  test.afterEach(uninstallLocalStorageShim);

  test('a prior account\'s "seen" marker does NOT make a new account skip onboarding', () => {
    // Account A finishes onboarding on this browser (marker set), then signs out.
    reconcileAccountOwnership('aaron@aaronthomashometeam.com');
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);

    // A genuinely-NEW account B signs in on the SAME browser. Reconcile (which
    // every entry path runs before the gate reads anything) clears A's markers.
    expect(reconcileAccountOwnership('fresh@newrealtor.com').reason).toBe('switch');
    expect(hasSeenOnboarding()).toBe(false);

    // So with B's real server signal (0 owned pages) the gate routes B INTO
    // onboarding — the stale marker never short-circuited it.
    expect(
      decideOnboardingEntry({
        seen: hasSeenOnboarding(),
        activityStatus: 'ready',
        totalPages: 0,
      }),
    ).toBe('welcome');
  });

  test('a same-account round-trip KEEPS the marker (no re-nag for the real agent)', () => {
    reconcileAccountOwnership('aaron@aaronthomashometeam.com');
    markOnboardingSeen();
    // Sign out → back in as self (case-insensitively): marker survives, so the
    // agent who already skipped/finished is not dragged back into onboarding.
    expect(reconcileAccountOwnership('AARON@aaronthomashometeam.com').reason).toBe('match');
    expect(hasSeenOnboarding()).toBe(true);
    expect(
      decideOnboardingEntry({
        seen: hasSeenOnboarding(),
        activityStatus: 'ready',
        totalPages: 0,
      }),
    ).toBe('stay');
  });
});

/* ─────────────── 4. source contracts: gate + replay wiring ──────────────── */

function readSrc(rel: string): string {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

test.describe('onboarding entry — the gate reads the one pure decision', () => {
  test('DashboardEntry decides via decideOnboardingEntry (no inline drift)', () => {
    const src = readSrc('src/app/dashboard/DashboardEntry.tsx');
    expect(src).toContain('decideOnboardingEntry');
    expect(src).toContain("router.replace('/welcome')");
  });
});

test.describe('onboarding entry — replay renders on prod regardless of flags', () => {
  test('/welcome checks replay BEFORE the flag-off redirect', () => {
    const src = readSrc('src/app/welcome/page.tsx');
    // The redirect is suppressed when replay is requested, so replay renders
    // even with onboarding fully dark (the prod-demo requirement).
    expect(src).toContain('!isOnboardingFirstRunEnabled() && !v2 && !v3 && !replay');
    expect(src).toContain('isReplayRequested(sp.replay)');
    // Replay always renders the hybrid V3 flow in replay mode.
    expect(src).toMatch(/replay[\s\S]*<WelcomeFlowV3[\s\S]*replay/);
  });
});

test.describe('onboarding entry — replay is non-destructive (source contract)', () => {
  test('WelcomeFlowV3: replay suppresses the "seen" marker + the Path B mint', () => {
    const src = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    // Skip/exit does not flip the live gate's "seen" marker in replay.
    expect(src).toContain('if (!replay) markOnboardingSeen()');
    // Path B early-returns to the read-only example BEFORE any createInstance.
    const replayGuard = src.indexOf('if (replay) {');
    const mint = src.indexOf('createInstance<SellerPresentationDraft>(');
    expect(replayGuard).toBeGreaterThan(-1);
    expect(replayGuard).toBeLessThan(mint);
    // Funnel emits route through the replay-suppressing tracker, not directly.
    expect(src).toContain('if (replay) return;');
  });

  test('AgentLayerSetup: replay sandboxes brand writes + suppresses markers', () => {
    const src = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    // Capture writes go to a local sandbox in replay, never the real brand.
    expect(src).toContain('replayDraft');
    expect(src).toContain('replayTouched');
    expect(src).toContain('setReplayDraft(next)');
    // Completing replay writes NEITHER marker (both change live gate / Today state).
    expect(src).toMatch(/if \(replay\) \{[\s\S]*router\.replace\('\/dashboard'\)[\s\S]*return;/);
  });
});
