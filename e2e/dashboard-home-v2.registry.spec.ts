import { test, expect } from '@playwright/test';
import {
  DASHBOARD_TOOLS,
  flagshipTool,
  socialTool,
  hiddenTools,
  toolsByAvailability,
} from '../src/app/dashboard/tool-registry';
import { deriveTodayState } from '../src/app/dashboard/today-state';
import type { OwnerPagesActivity } from '../src/app/dashboard/use-owner-pages-activity';

/**
 * DASHBOARD_HOME_V2 (launch model) — registry + Today-state source contract.
 *
 * Pure-Node spec (no browser): the dashboard is registry-DRIVEN, so the
 * registry → availability-mode mapping IS the durable contract. The
 * e2e harness can't flip the server env flag mid-suite, so flag-on render
 * is verified on preview (Cowork); CI proves the data the render binds to.
 * Mirrors the Pages Library DARK passes' pure + source-contract approach.
 *
 * Launch model: the home surfaces exactly TWO tools (Seller Presentation
 * flagship + Social Studio); every other built tool is `hidden` — no card,
 * no "Coming soon" tile, no graveyard.
 */

test.describe('dashboard tool registry', () => {
  test('the flagship is the one Seller Presentation card', () => {
    const flagship = flagshipTool();
    expect(flagship?.id).toBe('seller-presentation');
    expect(flagship?.availability).toBe('active-flagship');
    expect(flagship?.primaryActionLabel).toBe('Create seller page');
    // Exactly one flagship — never four equal sibling cards.
    expect(toolsByAvailability('active-flagship')).toHaveLength(1);
  });

  test('Social Studio is its own active-social tool', () => {
    const social = socialTool();
    expect(social?.id).toBe('social-studio');
    expect(social?.availability).toBe('active-social');
    expect(social?.primaryHref).toBe('/social-animator');
  });

  test('the home surfaces exactly Seller Presentation + Social Studio', () => {
    const surfaced = DASHBOARD_TOOLS.filter(
      (t) => t.availability !== 'hidden',
    ).map((t) => t.id);
    // No Quick Outputs tier, no Coming-soon tiles — only the two launch cards.
    expect(surfaced.sort()).toEqual(['seller-presentation', 'social-studio']);
  });

  test('every other built tool is hidden (a data flip away from returning)', () => {
    const ids = hiddenTools().map((t) => t.id);
    expect(ids).toContain('listing-presentation');
    expect(ids).toContain('listing-flyer');
    expect(ids).toContain('open-house-promo');
    expect(ids).toContain('seller-intelligence-report');
    expect(ids).toContain('open-house-prep');
    for (const tool of hiddenTools()) {
      expect(tool.availability).toBe('hidden');
      // Keeps its record (route + job CTA) for the later surface-it flip.
      expect(tool.primaryHref.startsWith('/')).toBe(true);
      expect(tool.primaryActionLabel.length).toBeGreaterThan(0);
    }
  });

  test('hidden tools never leak into the surfaced modes', () => {
    const surfaced = new Set([
      ...toolsByAvailability('active-flagship'),
      ...toolsByAvailability('active-social'),
    ]);
    for (const tool of DASHBOARD_TOOLS) {
      if (tool.availability === 'hidden') {
        expect(surfaced.has(tool)).toBe(false);
      }
    }
  });

  test('every tool declares a tier (pricing-ladder data captured now)', () => {
    for (const tool of DASHBOARD_TOOLS) {
      expect(['base', 'pro', 'ai']).toContain(tool.tier);
    }
  });
});

test.describe('Today card state derivation', () => {
  const base: OwnerPagesActivity = {
    status: 'ready',
    totalPages: 0,
    activeCount: 0,
    worthFollowUpCount: 0,
  };

  test('loading while the source has not resolved', () => {
    const view = deriveTodayState({ ...base, status: 'loading' });
    expect(view.state).toBe('loading');
    expect(view.needsAttention).toBe(false);
  });

  test('new agent (no pages) → create-first-page', () => {
    const view = deriveTodayState({ ...base, status: 'ready', totalPages: 0 });
    expect(view.state).toBe('new');
    expect(view.needsAttention).toBe(false);
  });

  test('returning, all caught up → no attention line', () => {
    const view = deriveTodayState({
      ...base,
      totalPages: 3,
      activeCount: 3,
      worthFollowUpCount: 0,
    });
    expect(view.state).toBe('returning');
    expect(view.needsAttention).toBe(false);
  });

  test('returning with follow-ups → needs-attention into Your pages', () => {
    const view = deriveTodayState({
      ...base,
      totalPages: 3,
      activeCount: 3,
      worthFollowUpCount: 2,
    });
    expect(view.state).toBe('returning');
    expect(view.needsAttention).toBe(true);
    expect(view.worthFollowUpCount).toBe(2);
  });

  test('source unavailable (library off / signed out) → neutral, no attention', () => {
    const view = deriveTodayState({ ...base, status: 'unavailable' });
    expect(view.state).toBe('unavailable');
    expect(view.needsAttention).toBe(false);
  });
});
