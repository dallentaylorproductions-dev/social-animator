import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  deriveTodayState,
  parseSeamPreview,
  previewTodayView,
  type OnboardingSignals,
} from '../src/app/dashboard/today-state';
import type { OwnerPagesActivity } from '../src/app/dashboard/use-owner-pages-activity';

/**
 * ONBOARDING_HYBRID_V3 — Phase 5, the dashboard handoff state + stack-wide gate.
 *
 * The Today-seam logic is pure, so the new "profile-ready" state is proven by
 * pure deriveTodayState/parseSeamPreview assertions; the gate + funnel wiring is
 * flag-gated DARK, so it is proven by source-contract greps (the harness can't
 * flip a server env flag mid-suite). Flag-on routing + the rendered card are the
 * end-of-stack Cowork preview check.
 */

const READY: OwnerPagesActivity = {
  status: 'ready',
  totalPages: 0,
  activeCount: 0,
  worthFollowUpCount: 0,
};

const BASE: OnboardingSignals = {
  partialInstanceId: null,
  partialLabel: null,
  hasWalkedSample: false,
};

/* ── pure: the profile-ready state (completed Path A, no page yet) ── */

test.describe('Today seam — profile-ready (hybrid Path A complete)', () => {
  test('a completed Path A agent with no page reads as profile-ready', () => {
    const view = deriveTodayState(READY, { ...BASE, hasCompletedPathA: true });
    expect(view.state).toBe('profile-ready');
  });

  test('without the completion marker it is NOT profile-ready (byte-identical)', () => {
    // No hasCompletedPathA → exactly the pre-Phase-5 state set. A brand-new
    // agent stays `new`; this is what keeps flag-off identical.
    expect(deriveTodayState(READY, BASE).state).toBe('new');
    expect(deriveTodayState(READY).state).toBe('new');
  });

  test('precedence: returning > partial > profile-ready > sample-only', () => {
    // A real page always wins.
    expect(
      deriveTodayState(
        { ...READY, totalPages: 2, activeCount: 2 },
        { ...BASE, hasCompletedPathA: true },
      ).state,
    ).toBe('returning');
    // A resumable draft (Path B) outranks profile-ready.
    expect(
      deriveTodayState(READY, {
        ...BASE,
        partialInstanceId: 'workflow_abc',
        hasCompletedPathA: true,
      }).state,
    ).toBe('partial');
    // Profile-ready outranks a mere sample walk.
    expect(
      deriveTodayState(READY, {
        ...BASE,
        hasCompletedPathA: true,
        hasWalkedSample: true,
      }).state,
    ).toBe('profile-ready');
  });

  test('the ?todaySeam=profile-ready QA override maps + renders its shape', () => {
    expect(parseSeamPreview('profile-ready')).toBe('profile-ready');
    const view = previewTodayView('profile-ready');
    expect(view.state).toBe('profile-ready');
    expect(view.partialInstanceId).toBeNull();
    expect(view.needsAttention).toBe(false);
  });
});

/* ── source-contract: the card copy/CTA + the stack-wide V3 gate ── */

function readSrc(rel: string): string {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

test.describe('Phase 5 — card + gate + funnel (source contract)', () => {
  test('the profile-ready card carries the §10 copy + CTAs (G6/G7, no new component)', () => {
    const src = readSrc('src/app/dashboard/DashboardHomeV2.tsx');
    expect(src).toContain('Your seller page details are ready.');
    expect(src).toContain("ctaLabel = 'Create your first seller page'");
    // Secondary = "View an example" → the read-only fixture route.
    expect(src).toContain('View an example');
    expect(src).toContain("EXAMPLE_HREF = '/seller-presentation-preview?fixture=full'");
  });

  test('the completion marker is the only profile-ready signal, set by the hybrid', () => {
    const setup = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    expect(setup).toContain('markPathAComplete()');
    const signals = readSrc('src/app/dashboard/use-today-seam-signals.ts');
    expect(signals).toContain('hasCompletedPathA: hasCompletedPathA()');
  });

  test('the dashboard entry gate fires for V3 too (precedence V3 > V2 > V1)', () => {
    const src = readSrc('src/app/dashboard/page.tsx');
    expect(src).toContain('isOnboardingHybridV3Enabled()');
    // Still includes V1/V2 in the OR chain (V2 contract assertions hold).
    expect(src).toContain('isOnboardingFirstRunEnabled() ||');
    expect(src).toContain('isOnboardingFirstRunV2Enabled()');
  });

  test('the funnel route stays dark unless one of the THREE flags is on', () => {
    const src = readSrc('src/app/api/onboarding/event/route.ts');
    // All three flags are negated in the dark-gate (formatting-agnostic).
    expect(src).toContain('!isOnboardingFirstRunEnabled()');
    expect(src).toContain('!isOnboardingFirstRunV2Enabled()');
    expect(src).toContain('!isOnboardingHybridV3Enabled()');
  });
});
