import { test, expect } from '@playwright/test';

/**
 * Open House Prep — file-level Playwright tests (OH Prep Commit 6).
 *
 * No visual snapshots: per W-1 Half B + SIR convention, wizard /
 * dashboard content evolves through phases. Pixel snapshots would be
 * fragile. These tests prove the route renders, the wizard advances,
 * and the universal-default pre-selection logic works.
 */

test.describe('Open House Prep — wizard', () => {
  test('renders the 5-step wizard and advances Next / Previous', async ({ page }) => {
    // Start fresh — clear any prior OH Prep draft so the wizard opens on step 1.
    await page.addInitScript(() => {
      window.localStorage.removeItem('openHousePrep:draft');
    });

    await page.goto('/open-house-prep');
    await expect(page).not.toHaveURL(/\/login/i);

    // Step 1 heading from StepEventProperty
    await expect(
      page.getByRole('heading', { name: /event \+ property/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Advance through all 5 steps. Exact-string match on the arrow-suffixed
    // button label avoids collision with the Next.js dev-tools button (which
    // has aria-label "Open Next.js Dev Tools" — same trick the SIR spec uses).
    const next = page.getByRole('button', { name: 'Next →' });
    await next.click();
    await expect(page.getByRole('heading', { name: /recent area sales/i })).toBeVisible();

    await next.click();
    // Step 3's main h2 is "Talking points"; an inner h3 within the step also
    // carries the same name (a sub-section header). Pin to level: 2.
    await expect(
      page.getByRole('heading', { level: 2, name: /^talking points$/i }),
    ).toBeVisible();

    await next.click();
    await expect(
      page.getByRole('heading', { name: /notes, neighborhood, and commitments/i }),
    ).toBeVisible();

    await next.click();
    await expect(page.getByRole('heading', { name: /^review$/i })).toBeVisible();

    // Previous returns us to step 4.
    await page.getByRole('button', { name: '← Previous' }).click();
    await expect(
      page.getByRole('heading', { name: /notes, neighborhood, and commitments/i }),
    ).toBeVisible();
  });

  test('pre-checks universal defaults across all three content libraries', async ({ page }) => {
    // Guarantee a fresh draft so the page applies DEFAULT_SELECTED_*_IDS
    // from each library on first load.
    await page.addInitScript(() => {
      window.localStorage.removeItem('openHousePrep:draft');
    });

    await page.goto('/open-house-prep');
    await expect(page).not.toHaveURL(/\/login/i);

    // Navigate Event+property -> Comps -> Talking points (step 3).
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.getByRole('button', { name: 'Next →' }).click();

    // StepTalkingPoints renders three section counters in "{N} of {Total} selected"
    // form. Library defaults: 4 talking points, 4 common questions, 2 conversion
    // prompts. The library totals (10 / 15 / 6) anchor the regex so we'd notice
    // a library size shift without pinning to specific entry IDs.
    await expect(page.getByText(/4 of 10 selected/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/4 of 15 selected/i)).toBeVisible();
    await expect(page.getByText(/2 of 6 selected/i)).toBeVisible();
  });
});
