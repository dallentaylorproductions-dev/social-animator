import { test, expect } from '@playwright/test';

/**
 * Seller Intelligence Report — file-level Playwright tests (SIR Commit 3).
 *
 * No visual snapshots: per W-1 Half B convention, dashboard / wizard content
 * evolves through phases (behavior tracking, calendar awareness, AI
 * orchestration). Pixel snapshots would be fragile. These tests prove the
 * route renders, the wizard advances, and the default-selection logic works.
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
