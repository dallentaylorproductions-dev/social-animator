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
      window.localStorage.removeItem('sellerIntelligenceReport:draft');
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
      window.localStorage.removeItem('sellerIntelligenceReport:draft');
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
    // v1.44 shipped SIR but missed adding it to the dashboard's All Skills
    // categorization map — agents could only reach it by typing the URL.
    // This test asserts SIR is rendered as a discoverable tile.
    //
    // Brand profile must be seeded so the dashboard renders past its
    // empty-state CTA (gated by hasBrandProfileConfigured() in
    // src/app/dashboard/state-detection.ts). No listing/SIR drafts needed —
    // All Skills always renders once brand profile is configured.
    await seedBrandProfile(page);

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    // All Skills section header — match against the actual copy ("All skills",
    // case-insensitive against any future capitalization shift).
    await expect(page.getByText(/^All skills$/i)).toBeVisible({ timeout: 10_000 });

    // SIR's SkillTile is a Link element. Its accessible name is composed of
    // the skill's name plus its output-format badge (per SkillTile's render
    // shape from W-1 Half B impl 2). Anchor on the skill name with a leading
    // match so we hit the tile, then assert it points at the SIR route.
    const sirTile = page.getByRole('link', { name: /^Seller Intelligence Report/i });
    await expect(sirTile).toBeVisible();
    await expect(sirTile).toHaveAttribute('href', '/seller-intelligence-report');
  });
});
