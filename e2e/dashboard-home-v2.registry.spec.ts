import { test, expect } from '@playwright/test';
import {
  DASHBOARD_TOOLS,
  flagshipTool,
  socialTool,
  quickOutputTools,
  comingNextTools,
  toolsByAvailability,
} from '../src/app/dashboard/tool-registry';
import { deriveTodayState } from '../src/app/dashboard/today-state';
import type { OwnerPagesActivity } from '../src/app/dashboard/use-owner-pages-activity';

/**
 * DASHBOARD_HOME_V2 (Pass 1) — registry + Today-state source contract.
 *
 * Pure-Node spec (no browser): the dashboard is registry-DRIVEN, so the
 * registry → availability-mode mapping IS the durable contract. The
 * e2e harness can't flip the server env flag mid-suite, so flag-on render
 * is verified on preview (Cowork); CI proves the data the render binds to.
 * Mirrors the Pages Library DARK passes' pure + source-contract approach.
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

  test('Quick Outputs are the built tools, reframed by job, all active', () => {
    const ids = quickOutputTools().map((t) => t.id);
    expect(ids).toEqual([
      'listing-presentation',
      'listing-flyer',
      'open-house-promo',
    ]);
    for (const tool of quickOutputTools()) {
      expect(tool.availability).toBe('active-quick');
      // Active, not a weak flagship: it has a real route + a job CTA label.
      expect(tool.primaryHref.startsWith('/')).toBe(true);
      expect(tool.primaryActionLabel.length).toBeGreaterThan(0);
    }
  });

  test('Social Studio is its own active-social tool', () => {
    const social = socialTool();
    expect(social?.id).toBe('social-studio');
    expect(social?.availability).toBe('active-social');
    expect(social?.primaryHref).toBe('/social-animator');
  });

  test('Coming next is quiet and never a greyed flagship card', () => {
    const ids = comingNextTools().map((t) => t.id);
    expect(ids).toContain('seller-intelligence-report');
    expect(ids).toContain('open-house-prep');
    for (const tool of comingNextTools()) {
      expect(tool.availability).toBe('coming-next');
      // No clickable CTA; carries a quiet status label instead.
      expect(tool.primaryActionLabel).toBe('');
      expect(tool.statusLabel).toBeTruthy();
    }
  });

  test('coming-next / internal-beta tools never leak into the active modes', () => {
    const active = new Set([
      ...toolsByAvailability('active-flagship'),
      ...toolsByAvailability('active-quick'),
      ...toolsByAvailability('active-social'),
    ]);
    for (const tool of DASHBOARD_TOOLS) {
      if (tool.availability === 'coming-next' || tool.availability === 'internal-beta') {
        expect(active.has(tool)).toBe(false);
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
