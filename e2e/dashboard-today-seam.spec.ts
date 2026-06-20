import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveTodayState,
  parseSeamPreview,
  previewTodayView,
  type OnboardingSignals,
} from '../src/app/dashboard/today-state';
import type { OwnerPagesActivity } from '../src/app/dashboard/use-owner-pages-activity';

/**
 * DASHBOARD_TODAY_SEAM (Pass 3) — the Today-card seam.
 *
 * Pure-Node + source-contract spec (no browser): the e2e harness can't flip a
 * server env flag mid-suite, so the four-state derivation + precedence + the
 * flag-off degrade are proven here as a pure contract, and the render wiring
 * (resume deep-link, real-onboarding path, byte-identical flag-off card) is
 * proven by reading the source. Flag-on render is verified on preview (Cowork).
 * Mirrors the Pass-1 + Pages-Library DARK passes' approach.
 */

const READY: OwnerPagesActivity = {
  status: 'ready',
  totalPages: 0,
  activeCount: 0,
  worthFollowUpCount: 0,
};

const NO_SIGNALS: OnboardingSignals = {
  partialInstanceId: null,
  partialLabel: null,
  hasWalkedSample: false,
};

const PARTIAL: OnboardingSignals = {
  partialInstanceId: 'workflow_abc123',
  partialLabel: '1742 Kenilworth Avenue',
  hasWalkedSample: false,
};

const SAMPLE: OnboardingSignals = {
  partialInstanceId: null,
  partialLabel: null,
  hasWalkedSample: true,
};

test.describe('Today seam — the four states (flag ON)', () => {
  test('new — no pages, no draft, no sample → create-first-page', () => {
    const view = deriveTodayState(READY, NO_SIGNALS);
    expect(view.state).toBe('new');
    expect(view.partialInstanceId).toBeNull();
  });

  test('sample-only — walked the sample, made nothing → convert', () => {
    const view = deriveTodayState(READY, SAMPLE);
    expect(view.state).toBe('sample-only');
    expect(view.needsAttention).toBe(false);
  });

  test('partial — an in-progress never-published draft → resume that page', () => {
    const view = deriveTodayState(READY, PARTIAL);
    expect(view.state).toBe('partial');
    // The exact draft is surfaced so the card can deep-link `?id=`.
    expect(view.partialInstanceId).toBe('workflow_abc123');
    expect(view.partialLabel).toBe('1742 Kenilworth Avenue');
  });

  test('returning — has published pages → unchanged Pass-1 behavior', () => {
    const view = deriveTodayState(
      { ...READY, totalPages: 2, activeCount: 2, worthFollowUpCount: 1 },
      NO_SIGNALS,
    );
    expect(view.state).toBe('returning');
    expect(view.needsAttention).toBe(true);
    expect(view.worthFollowUpCount).toBe(1);
  });
});

test.describe('Today seam — precedence (returning > partial > sample-only > new)', () => {
  test('returning beats partial — a published page wins over a stray draft', () => {
    const view = deriveTodayState(
      { ...READY, totalPages: 1, activeCount: 1 },
      { ...PARTIAL, hasWalkedSample: true },
    );
    expect(view.state).toBe('returning');
    // Partial fields are NOT surfaced when returning wins.
    expect(view.partialInstanceId).toBeNull();
  });

  test('partial beats sample-only — both signals present → resume', () => {
    const view = deriveTodayState(READY, {
      ...PARTIAL,
      hasWalkedSample: true,
    });
    expect(view.state).toBe('partial');
    expect(view.partialInstanceId).toBe('workflow_abc123');
  });

  test('sample-only beats new — sample walked but no draft', () => {
    const view = deriveTodayState(READY, SAMPLE);
    expect(view.state).toBe('sample-only');
  });
});

test.describe('Today seam — degrade + flag-off byte-identical', () => {
  test('flag OFF (no onboarding arg) derives ONLY Pass-1 states', () => {
    // What would be partial/sample-only collapses to new with no seam input.
    expect(deriveTodayState(READY).state).toBe('new');
    expect(
      deriveTodayState({ ...READY, totalPages: 3, activeCount: 3 }).state,
    ).toBe('returning');
    // No partial fields ever leak on the flag-off path.
    expect(deriveTodayState(READY).partialInstanceId).toBeNull();
  });

  test('undetectable partial/sample degrade to new (null id, no marker)', () => {
    const view = deriveTodayState(READY, NO_SIGNALS);
    expect(view.state).toBe('new');
  });

  test('loading short-circuits before any seam state', () => {
    const view = deriveTodayState({ ...READY, status: 'loading' }, PARTIAL);
    expect(view.state).toBe('loading');
  });

  test('unavailable source degrades neutral even with local signals', () => {
    // No authoritative count → never show resume/convert (could contradict
    // reality); fall to the neutral create CTA, same as Pass 1.
    const view = deriveTodayState(
      { ...READY, status: 'unavailable' },
      { ...PARTIAL, hasWalkedSample: true },
    );
    expect(view.state).toBe('unavailable');
    expect(view.partialInstanceId).toBeNull();
  });

  test('partial with no label still resumes (headline falls back)', () => {
    const view = deriveTodayState(READY, {
      partialInstanceId: 'workflow_xyz',
      partialLabel: null,
      hasWalkedSample: false,
    });
    expect(view.state).toBe('partial');
    expect(view.partialInstanceId).toBe('workflow_xyz');
    expect(view.partialLabel).toBeNull();
  });
});

test.describe('Today seam — QA display override (?todaySeam=)', () => {
  test('parses the four QA values to forced states', () => {
    expect(parseSeamPreview('new')).toBe('new');
    expect(parseSeamPreview('sample')).toBe('sample-only');
    expect(parseSeamPreview('partial')).toBe('partial');
    expect(parseSeamPreview('returning')).toBe('returning');
  });

  test('ignores absent / unknown / array values (no forced state)', () => {
    expect(parseSeamPreview(undefined)).toBeNull();
    expect(parseSeamPreview('bogus')).toBeNull();
    expect(parseSeamPreview('')).toBeNull();
    // Repeated param → first wins; still null when not a QA value.
    expect(parseSeamPreview(['nope', 'partial'])).toBeNull();
    expect(parseSeamPreview(['partial', 'new'])).toBe('partial');
  });

  test('synthetic view renders each forced state with no real data', () => {
    // partial → a placeholder resume target so the resume link still renders.
    const partial = previewTodayView('partial');
    expect(partial.state).toBe('partial');
    expect(partial.partialInstanceId).toBe('preview');
    expect(partial.partialLabel).toBe('123 Sample Avenue');

    // returning → forced attention line so the full card shows.
    const returning = previewTodayView('returning');
    expect(returning.state).toBe('returning');
    expect(returning.needsAttention).toBe(true);
    expect(returning.worthFollowUpCount).toBeGreaterThan(0);

    // sample-only + new → plain create/convert cards, no attention/resume.
    expect(previewTodayView('sample-only').state).toBe('sample-only');
    expect(previewTodayView('sample-only').needsAttention).toBe(false);
    const fresh = previewTodayView('new');
    expect(fresh.state).toBe('new');
    expect(fresh.partialInstanceId).toBeNull();
  });
});

/* ── Source contract — render wiring the pure deriver can't prove ────────── */

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

test.describe('Today seam — source contract', () => {
  test('the flag config reads DASHBOARD_TODAY_SEAM (server-side, no NEXT_PUBLIC)', () => {
    const src = read('src/lib/config/dashboard-today-seam.ts');
    expect(src).toContain('process.env.DASHBOARD_TODAY_SEAM');
    // No client-exposed env prefix — the flag stays server-resolved + threaded.
    expect(src).not.toContain('NEXT_PUBLIC_');
  });

  test('the QA override is double-gated: feature ON and preview/dev env', () => {
    const src = read('src/lib/config/dashboard-today-seam.ts');
    // Hard off in production via VERCEL_ENV; NODE_ENV fallback blocks
    // non-Vercel production. Composed with the feature flag.
    expect(src).toContain("process.env.VERCEL_ENV");
    expect(src).toContain('isDashboardTodaySeamEnabled() && isPreviewOrDevEnv()');
    expect(src).toContain('export function isTodaySeamPreviewAllowed');
  });

  test('the override is gated BEFORE parsing in the server page', () => {
    const src = read('src/app/dashboard/page.tsx');
    // parseSeamPreview only runs when isTodaySeamPreviewAllowed() cleared it,
    // so production resolves the override to null.
    expect(src).toContain('isTodaySeamPreviewAllowed()');
    expect(src).toContain('parseSeamPreview(sp.todaySeam)');
  });

  test('the override is a pure render swap (synthetic view, no data read)', () => {
    const src = read('src/app/dashboard/DashboardHomeV2.tsx');
    expect(src).toContain('previewState ? previewTodayView(previewState) : derived');
  });

  test('partial action deep-links the exact draft (?id=) into the cockpit', () => {
    const src = read('src/app/dashboard/DashboardHomeV2.tsx');
    expect(src).toContain('?id=${partialInstanceId}');
  });

  test('sample-only action opens the real onboarding path (/welcome)', () => {
    const src = read('src/app/dashboard/DashboardHomeV2.tsx');
    expect(src).toContain("ONBOARDING_HREF = '/welcome'");
  });

  test('the partial signal excludes a published draft (never double-counts)', () => {
    const src = read('src/app/dashboard/use-today-seam-signals.ts');
    expect(src).toContain('!draft.publishedSlug');
  });

  test('the sample marker is its own key, distinct from the seen flag', () => {
    const src = read('src/lib/onboarding/seen.ts');
    expect(src).toContain('socanim_onboarding_sample_walked');
    expect(src).toContain('export function markSampleWalked');
    expect(src).toContain('export function hasWalkedSample');
  });

  test('walking the sample writes the marker (the one onboarding-flow touch)', () => {
    const src = read('src/app/welcome/WelcomeFlowV2.tsx');
    expect(src).toContain('markSampleWalked()');
  });

  test('no em-dash in the seam Today-card copy', () => {
    const src = read('src/app/dashboard/DashboardHomeV2.tsx');
    // Scoped to the Today copy strings the seam added/owns.
    for (const phrase of [
      'You have seen what it does. Now make one for your listing.',
      'Your in-progress page is saved. Finish it whenever you are ready.',
      'Start with your address and build the page for your real listing.',
      'Pick up where you left off on ',
    ]) {
      expect(src).toContain(phrase);
      expect(phrase.includes('—')).toBe(false);
    }
  });
});
