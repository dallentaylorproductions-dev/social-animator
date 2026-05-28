import { test, expect } from '@playwright/test';

/**
 * Unit coverage for the single entitlement resolver (Substrate §8.4 +
 * §8.5, v1.47 / A7f.2).
 *
 * Same Node-runner pattern as e2e/lib-data-primitives.spec.ts — no
 * browser, no page fixture, just pure-function assertions over the
 * resolver. The resolver is sync + dependency-free (the async KV reads
 * live in load-agent-profile.ts and aren't exercised here).
 *
 * Coverage targets (matching the A7f.2 acceptance criteria):
 *   - access-mode → effective-tier mapping for every named mode
 *   - team-invite → premium theme resolves to AVAILABLE (cohort gets
 *     full access, zero upgrade messaging)
 *   - internal-test forced to base → premium theme resolves to
 *     PREVIEW-ONLY with a Base fallbackAction (§8.6 trust rule)
 *   - Base agent → core Seller Presentation workflow is AVAILABLE
 *     (§8.6: never gate the Base core deliverable)
 *   - suppressUpgradeUi true for non-paying modes, false for paid/trial
 *   - undeclared availability (other skills) → all dimensions available
 */

import {
  resolveEntitlements,
  resolveSkill,
} from '../src/lib/entitlements/resolver';
import type {
  AgentProfile,
  ResolvedGate,
} from '../src/lib/entitlements/types';
import { SELLER_PRESENTATION_SKILL } from '../src/tools/seller-presentation/skill';
import { LISTING_FLYER_SKILL } from '../src/tools/listing-flyer/skill';

function profile(patch: Partial<AgentProfile> = {}): AgentProfile {
  return {
    email: 'test@example.com',
    devAccessGranted: false,
    hasActiveSubscription: false,
    ...patch,
  };
}

function expectAvailable(gate: ResolvedGate) {
  expect(gate.state).toBe('available');
  expect(typeof gate.label).toBe('string');
  expect(gate.label.length).toBeGreaterThan(0);
}

test.describe('resolveEntitlements — access mode mapping', () => {
  test('dev-access KV grant → team-invite / pro / suppress upgrade UI', () => {
    const ent = resolveEntitlements(profile({ devAccessGranted: true }));
    expect(ent.accessMode).toBe('team-invite');
    expect(ent.tier).toBe('pro');
    expect(ent.suppressUpgradeUi).toBe(true);
  });

  test('Stripe trialing → trial / pro / surface upgrade UI', () => {
    const ent = resolveEntitlements(
      profile({ hasActiveSubscription: true, subscriptionStatus: 'trialing' }),
    );
    expect(ent.accessMode).toBe('trial');
    expect(ent.tier).toBe('pro');
    expect(ent.suppressUpgradeUi).toBe(false);
  });

  test('Stripe active → paid / pro / surface upgrade UI', () => {
    const ent = resolveEntitlements(
      profile({ hasActiveSubscription: true, subscriptionStatus: 'active' }),
    );
    expect(ent.accessMode).toBe('paid');
    expect(ent.tier).toBe('pro');
    expect(ent.suppressUpgradeUi).toBe(false);
  });

  test('internalTestOverride wins over dev-access + sub state', () => {
    const ent = resolveEntitlements(
      profile({
        devAccessGranted: true,
        hasActiveSubscription: true,
        subscriptionStatus: 'active',
        internalTestOverride: 'base',
      }),
    );
    expect(ent.accessMode).toBe('internal-test');
    expect(ent.tier).toBe('base');
    expect(ent.suppressUpgradeUi).toBe(true);
  });

  test('internal-test defaults to base when no override tier supplied', () => {
    // No override field at all (the "unauthenticated reaches here" path —
    // e.g. E2E bypass) → internal-test with tier base.
    const ent = resolveEntitlements({
      email: null,
      devAccessGranted: false,
      hasActiveSubscription: false,
    });
    expect(ent.accessMode).toBe('internal-test');
    expect(ent.tier).toBe('base');
    expect(ent.suppressUpgradeUi).toBe(true);
  });

  test('internalTestOverride: pro climbs the ladder', () => {
    const ent = resolveEntitlements(profile({ internalTestOverride: 'pro' }));
    expect(ent.accessMode).toBe('internal-test');
    expect(ent.tier).toBe('pro');
  });
});

test.describe('resolveSkill — Seller Presentation (declared availability)', () => {
  test('team-invite agent: every dimension AVAILABLE (cohort full access)', () => {
    const ent = resolveEntitlements(profile({ devAccessGranted: true }));
    const r = resolveSkill(SELLER_PRESENTATION_SKILL, ent);
    expectAvailable(r.coreAccess);
    expectAvailable(r.themeAccess);
    expectAvailable(r.aiAccess);
    expectAvailable(r.exportAccess);
  });

  test('internal-test forced to base: theme is PREVIEW-ONLY + Base fallback (§8.6)', () => {
    const ent = resolveEntitlements(profile({ internalTestOverride: 'base' }));
    const r = resolveSkill(SELLER_PRESENTATION_SKILL, ent);

    // Core is ALWAYS available for a Base skill — §8.6's load-bearing
    // trust rule: never gate the Base core deliverable.
    expectAvailable(r.coreAccess);

    // Premium theme: preview-but-lock with Base fallback.
    expect(r.themeAccess.state).toBe('preview-only');
    expect(r.themeAccess.reason).toBe('premium-theme');
    expect(r.themeAccess.fallbackAction).toBeTruthy();
    expect(r.themeAccess.fallbackAction).toMatch(/base/i);

    // AI plug-points: upgrade-required (no preview UX yet — Lane C).
    expect(r.aiAccess.state).toBe('upgrade-required');
    expect(r.aiAccess.reason).toBe('tier-pro-required');
    expect(r.aiAccess.fallbackAction).toMatch(/manual/i);
  });

  test('paid agent (active sub): every dimension AVAILABLE', () => {
    const ent = resolveEntitlements(
      profile({ hasActiveSubscription: true, subscriptionStatus: 'active' }),
    );
    const r = resolveSkill(SELLER_PRESENTATION_SKILL, ent);
    expectAvailable(r.coreAccess);
    expectAvailable(r.themeAccess);
    expectAvailable(r.aiAccess);
  });
});

test.describe('resolveSkill — skill without availability declaration', () => {
  test('listing-flyer (no availability field): every dimension AVAILABLE', () => {
    // Sanity: until other skills declare availability, the resolver
    // resolves them to fully-available. This is the "purely additive"
    // contract that lets A7f.2 ship without changing any other tool.
    const ent = resolveEntitlements(profile({ internalTestOverride: 'base' }));
    const r = resolveSkill(LISTING_FLYER_SKILL, ent);
    expectAvailable(r.coreAccess);
    expectAvailable(r.themeAccess);
    expectAvailable(r.aiAccess);
    expectAvailable(r.exportAccess);
  });
});

test.describe('Every ResolvedGate carries the §8.4 fields', () => {
  test('available + preview-only + upgrade-required all carry state/reason/label', () => {
    const baseEnt = resolveEntitlements(profile({ internalTestOverride: 'base' }));
    const r = resolveSkill(SELLER_PRESENTATION_SKILL, baseEnt);
    for (const gate of [r.coreAccess, r.themeAccess, r.aiAccess, r.exportAccess]) {
      expect(gate).toHaveProperty('state');
      expect(gate).toHaveProperty('reason');
      expect(gate).toHaveProperty('label');
      // preview-only must carry fallbackAction (§8.6 trust rule).
      if (gate.state === 'preview-only') {
        expect(gate.fallbackAction).toBeTruthy();
      }
    }
  });
});
