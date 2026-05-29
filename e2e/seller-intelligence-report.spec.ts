import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * Seller Intelligence Report — file-level Playwright tests (SIR Commit 3 +
 * v1.44.1 dashboard-discovery regression).
 *
 * No visual snapshots: per W-1 Half B convention, dashboard / wizard content
 * evolves through phases (behavior tracking, calendar awareness, AI
 * orchestration). Pixel snapshots would be fragile. These tests prove the
 * route renders, the wizard advances, the default-selection logic works,
 * and SIR is discoverable from the dashboard's All Skills section.
 */

test.describe('Seller Intelligence Report — wizard', () => {
  test('renders the 5-step wizard and advances Next / Previous', async ({ page }) => {
    // Start fresh — clear any prior SIR draft so the wizard opens on step 1.
    await page.addInitScript(() => {
      // v1.45.1: Step 1 Next now gates on required fields. Seed a minimal
      // valid draft so the wizard can advance.
      window.localStorage.setItem(
        'sellerIntelligenceReport:draft',
        JSON.stringify({
          propertyAddress: '1234 Test Drive NE',
          recommendedListPrice: '$685,000',
          comps: [],
          selectedObjectionIds: [],
          commitments: [],
          asks: [],
        }),
      );
    });

    await page.goto('/seller-intelligence-report');
    await expect(page).not.toHaveURL(/\/login/i);

    // Step 1 heading from StepProperty
    await expect(
      page.getByRole('heading', { name: /property \+ pricing strategy/i })
    ).toBeVisible({ timeout: 10_000 });

    // Advance through all 5 steps via the Next button.
    const next = page.getByRole('button', { name: 'Next →' });
    await next.click();
    await expect(page.getByRole('heading', { name: /comparable sales/i })).toBeVisible();

    await next.click();
    await expect(page.getByRole('heading', { name: /talking points/i })).toBeVisible();

    await next.click();
    await expect(
      page.getByRole('heading', { name: /notes, commitments, asks/i })
    ).toBeVisible();

    await next.click();
    await expect(page.getByRole('heading', { name: /^review$/i })).toBeVisible();

    // Previous returns us to step 4.
    await page.getByRole('button', { name: '← Previous' }).click();
    await expect(
      page.getByRole('heading', { name: /notes, commitments, asks/i })
    ).toBeVisible();
  });

  test('pre-checks the universal-default objections on a fresh draft', async ({ page }) => {
    // Guarantee a fresh draft so DEFAULT_SELECTED_OBJECTION_IDS gets applied.
    await page.addInitScript(() => {
      // v1.45.1: Step 1 Next now gates on required fields. Seed a minimal
      // valid draft so the wizard can advance.
      window.localStorage.setItem(
        'sellerIntelligenceReport:draft',
        JSON.stringify({
          propertyAddress: '1234 Test Drive NE',
          recommendedListPrice: '$685,000',
          comps: [],
          selectedObjectionIds: [],
          commitments: [],
          asks: [],
        }),
      );
    });

    await page.goto('/seller-intelligence-report');
    await expect(page).not.toHaveURL(/\/login/i);

    // Navigate Property -> Comps -> Talking points (step 3).
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.getByRole('button', { name: 'Next →' }).click();

    // The selected/total counter is rendered as "{N} of {Total} selected".
    // The current library defaults are 4 universal entries; assert the count
    // shape is visible without pinning the total (lets future library growth
    // not break this test). The "X of Y selected" pattern is stable.
    await expect(page.getByText(/4 of \d+ selected/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Seller Intelligence Report — dashboard discovery', () => {
  test('SIR is visible in the dashboard All Skills section', async ({ page }) => {
    // v1.44 shipped SIR but missed adding it to the dashboard's tile
    // discovery — agents could only reach it by typing the URL. v1.47
    // Lane A re-brand reorganized the dashboard into three named stages
    // (Win → Launch → Stay visible); SIR lives under "Win the listing"
    // because its `category` is 'Seller pitch'. This test asserts the
    // tile still surfaces post-rebrand and routes correctly.
    //
    // Brand profile seeded so the dashboard isn't in its empty-state
    // hero (HeroEmptyState replaces the hero card when no brand exists).
    // Stage tiles always render once brand is configured.
    await seedBrandProfile(page);

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    // Win stage header — the rebrand's new SkillCategory → stage mapping
    // routes 'Seller pitch' skills here.
    await expect(page.getByTestId('sep-stage-win')).toBeVisible({
      timeout: 10_000,
    });

    // SIR still surfaces as a discoverable tile, but during the v1.47
    // cohort it's gated to "Coming soon" (COHORT_LIVE_SKILLS = only
    // seller-presentation) — rendered as a non-interactive <div>, so it no
    // longer carries an href. The tool's route still exists and is covered
    // by this file's functional tests (page.goto('/seller-intelligence-report')).
    const sirTile = page.getByTestId('sep-tile-seller-intelligence-report');
    await expect(sirTile).toBeVisible();
    await expect(sirTile).toHaveAttribute('data-coming-soon', 'true');
    await expect(sirTile).not.toHaveAttribute('href');
  });
});
