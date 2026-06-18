import { test, expect } from '@playwright/test';
import { seedBrandProfile, seedListingProfile } from './fixtures/seed-helpers';

/**
 * DASHBOARD_HOME_V2 (Pass 1) — flag-OFF guard.
 *
 * DASHBOARD_HOME_V2 is NOT set in the e2e webServer env, so the suite runs
 * with the flag OFF. This spec proves the flag-off path is the v1.47 Lane A
 * dashboard, byte-identical at the structural level: the V1 hero + stage
 * grids render, and NONE of the V2-only surfaces (Today card, flagship
 * activity card, Coming-next) appear. Flag-on render is verified on preview
 * (Cowork), per the build packet.
 */

test.describe('Dashboard — DASHBOARD_HOME_V2 flag off (byte-identical V1)', () => {
  test('renders the V1 shell and none of the V2 surfaces', async ({ page }) => {
    await seedBrandProfile(page);
    await seedListingProfile(page, {
      address: '1234 Test Drive NE',
      status: 'Just Listed',
      price: '$685,000',
    });

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    // V1 shell is present.
    await expect(page.getByTestId('sep-topbar')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('sep-hero')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('sep-stage-win-grid')).toBeVisible();
    await expect(page.getByTestId('sep-stage-launch-grid')).toBeVisible();

    // V2-only surfaces must be absent on the flag-off path.
    await expect(page.getByTestId('sep-today')).toHaveCount(0);
    await expect(page.getByTestId('sep-flagship-seller')).toHaveCount(0);
    await expect(page.getByTestId('sep-coming-next')).toHaveCount(0);
  });
});
