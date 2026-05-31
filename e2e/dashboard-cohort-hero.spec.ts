import { test, expect } from '@playwright/test';
import {
  seedBrandProfile,
  seedListingProfile,
} from './fixtures/seed-helpers';

/**
 * Dashboard — cohort-hero gating + welcome-name fallback (v1.47 polish).
 *
 * Two contracts, both surfaced in production smoke 2026-05-29:
 *
 *   1. The hero "Up next" primary CTA and "Then queue" chips never point
 *      to a tool outside COHORT_LIVE_SKILLS (plus the Social Studio
 *      flagship via the social-animator-* prefix). Pre-fix, an agent who
 *      seeded a listing was recommended Listing Flyer Generator — a
 *      Coming-soon tile from the grid. The filter is applied to the
 *      workflow candidate set BEFORE priority pick, so the next live
 *      workflow naturally wins (or the empty state fills in).
 *
 *   2. With no brand/agent name set, the greeting fallback reads
 *      "Welcome back, Agent." (not "there.").
 */

const COHORT_LIVE_HERO_HREFS = (href: string | null): boolean => {
  if (!href) return false;
  if (href === '/seller-presentation') return true; // COHORT_LIVE_SKILLS
  if (href.startsWith('/social-animator/')) return true; // Social Studio
  if (href === '/settings') return true; // empty-state fallback CTA
  return false;
};

test.describe('Dashboard — cohort hero gating', () => {
  test('listing-populated agent: hero never surfaces the gated Listing Flyer CTA', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    // Same state-detection input that surfaced "Listing Flyer Generator →"
    // in the 2026-05-29 production smoke (listing_launch_state via a
    // populated listing profile).
    await seedListingProfile(page, {
      address: '1234 Test Drive NE',
      status: 'Just Listed',
      price: '$685,000',
    });

    await page.goto('/dashboard');

    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toBeVisible({ timeout: 10_000 });
    const href = await primary.getAttribute('href');

    // Never the gated tool.
    expect(href).not.toBe('/listing-flyer');
    await expect(primary).not.toContainText(/listing flyer/i);

    // Must be a live destination (cohort-live skill or social-animator
    // template route, or the empty-state /settings fallback).
    expect(COHORT_LIVE_HERO_HREFS(href)).toBe(true);
  });

  test('no hero chip points to a cohort-gated tool', async ({ page }) => {
    // Drive the Seller Win hero (seller-presentation is live) — its
    // recommendedNextSkills includes 'listing-flyer' (gated) which must
    // be filtered out so the chip never renders. If no chip survives the
    // filter, the whole "Then queue" row drops out (acceptable).
    await seedBrandProfile(page);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'sellerIntelligenceReport:draft',
        JSON.stringify({
          propertyAddress: '1234 Test Drive NE',
          recommendedListPrice: '',
          comps: [],
          selectedObjectionIds: [],
          commitments: [],
          asks: [],
        }),
      );
    });

    await page.goto('/dashboard');

    // The Seller Win hero is up.
    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toHaveAttribute(
      'href',
      '/seller-presentation',
      { timeout: 10_000 },
    );

    // A chip pointing at the gated listing-flyer must not exist.
    await expect(
      page.getByTestId('sep-hero-chip-listing-flyer'),
    ).toHaveCount(0);

    // Any chip that does render must point to a live destination.
    const chips = page.locator('[data-testid^="sep-hero-chip-"]');
    const count = await chips.count();
    for (let i = 0; i < count; i++) {
      const chipHref = await chips.nth(i).getAttribute('href');
      expect(COHORT_LIVE_HERO_HREFS(chipHref)).toBe(true);
    }
  });
});

test.describe('Dashboard — welcome-name "Agent" fallback', () => {
  test('with no brand name set, the greeting reads "Welcome back, Agent."', async ({
    page,
  }) => {
    // No seedBrandProfile — socanim_brand_settings is absent so the
    // welcome snapshot falls through to the fallback.
    await page.goto('/dashboard');
    await expect(page.getByTestId('sep-welcome-name')).toContainText(
      'Agent.',
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('sep-welcome-name')).not.toContainText(
      /\bthere\.?\b/i,
    );
  });

  test('with a brand name set, the greeting still personalizes', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'socanim_brand_settings',
        JSON.stringify({ agentName: 'Aaron Thomas' }),
      );
    });
    await page.goto('/dashboard');
    await expect(page.getByTestId('sep-welcome-name')).toContainText(
      'Aaron.',
      { timeout: 10_000 },
    );
  });
});
