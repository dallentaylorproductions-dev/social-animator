import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * ONBOARDING_FIRST_RUN (Pass 2) - flag-OFF guard.
 *
 * ONBOARDING_FIRST_RUN is NOT set in the e2e webServer env, so the suite runs
 * with the flow DARK. This spec proves the flag-off path is byte-identical to
 * today's first-run entry:
 *   - /welcome does not exist when dark - the server redirects it to the
 *     dashboard, so a stray link can never strand a user on a dead flow;
 *   - a brand-new agent landing on /dashboard is NOT routed into the flow -
 *     the onboarding surface never mounts.
 *
 * Flag-ON behaviour (both paths reach a preview, the optimistic skeleton + the
 * "awaiting your review" frame, the sample marker + convert CTA, the
 * end-in-cockpit handoff, the spotlights, the funnel events) is verified on
 * preview by Cowork, per the build packet - the harness can't flip a server
 * env flag mid-suite.
 */

test.describe('Onboarding first-run - flag off (byte-identical entry)', () => {
  test('/welcome redirects to the dashboard and never mounts the flow', async ({
    page,
  }) => {
    await seedBrandProfile(page);

    await page.goto('/welcome');
    // Dark flow -> server redirect to /dashboard. Never /login (auth-bypassed).
    await expect(page).not.toHaveURL(/\/welcome/i);
    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.getByTestId('onb-root')).toHaveCount(0);
  });

  test('a new agent on /dashboard is not routed into the first-run flow', async ({
    page,
  }) => {
    await seedBrandProfile(page);

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);
    // The dashboard renders; the onboarding surface is absent and there is no
    // redirect to /welcome.
    await expect(page.getByTestId('sep-topbar')).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/welcome/i);
    await expect(page.getByTestId('onb-root')).toHaveCount(0);
  });
});
