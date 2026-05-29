import { test, expect } from '@playwright/test';
import {
  COHORT_EXAMPLE_URL,
  COHORT_EXAMPLE_LABEL,
} from '../src/lib/config/cohort-example';

/**
 * Seller Presentation — Anticipation Layer cohort-example link (v1.47).
 *
 * The wizard puts all the reward at the end (publish), so the 5 input
 * steps feel like data entry. This packet surfaces the polished
 * destination up front + throughout via a single calm link routed
 * through one swappable config constant (@/lib/config/cohort-example).
 *
 * What this spec locks in:
 *   1. The chrome link renders on EVERY step (the chore-dread hits
 *      mid-flow, so the destination must be one tap away throughout).
 *   2. It points at COHORT_EXAMPLE_URL (a PRODUCTION url, never a
 *      *.vercel.app preview hash) and opens in a NEW tab
 *      (target="_blank" + rel includes noopener) so clicking never
 *      costs the agent their in-progress draft.
 *   3. Step 1 carries a reinforced, aspirationally framed version that
 *      also resolves to the same URL.
 *
 * Banked no-flake conventions (A5a/A6.1): no addInitScript localStorage
 * clear — each Playwright test gets a fresh context, and a clear would
 * re-fire on navigation.
 */

test.describe('Seller Presentation — Anticipation Layer cohort link', () => {
  test('chrome link renders on every step with the production URL + opens a new tab', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    // Guard against a regression that re-introduces a preview hash.
    expect(COHORT_EXAMPLE_URL).toContain('studio.simplyeditpro.com/h/');
    expect(COHORT_EXAMPLE_URL).not.toContain('vercel.app');

    const link = page.getByTestId('cohort-example-link');

    // --- Step 1: the persistent chrome link is present + correct. ---
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', COHORT_EXAMPLE_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    // rel must include noopener so the opened tab can't reach back into
    // window.opener and the wizard's draft stays untouched.
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toContainText(COHORT_EXAMPLE_LABEL);

    // Satisfy Step 1 gating so Next unlocks and we can traverse.
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('step-property-city').fill('Tacoma, WA');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();

    const next = page.getByTestId('wizard-next');

    // --- Steps 2–6: the SAME chrome link stays visible + correct on
    //     every step (it lives in the shared header, rendered once). ---
    const steps: Array<{ testid: string; label: string }> = [
      { testid: 'step-comps', label: 'Step 2 of 6' },
      { testid: 'step-strategy', label: 'Step 3 of 6' },
      { testid: 'step-pitch', label: 'Step 4 of 6' },
      { testid: 'step-editorial', label: 'Step 5 of 6' },
      { testid: 'step-review', label: 'Step 6 of 6' },
    ];
    for (const step of steps) {
      await expect(next).toBeEnabled();
      await next.click();
      await expect(page.getByTestId(step.testid)).toBeVisible();
      await expect(page.getByText(step.label)).toBeVisible();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', COHORT_EXAMPLE_URL);
      await expect(link).toHaveAttribute('target', '_blank');
    }
  });

  test('Step 1 reinforced anchor frames the destination as an EXAMPLE (never personalized)', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    const step1Link = page.getByTestId('cohort-example-link-step1');
    await expect(step1Link).toBeVisible();
    await expect(step1Link).toHaveAttribute('href', COHORT_EXAMPLE_URL);
    await expect(step1Link).toHaveAttribute('target', '_blank');
    await expect(step1Link).toHaveAttribute('rel', /noopener/);

    // v1.47 cohort copy fix: the canonical link opens a REAL agent's
    // example page, so it MUST read as someone else's finished example —
    // not as a preview of the agent's own in-progress draft. The old
    // "your seller receives" / preparedFor-personalized phrasing caused
    // exactly that confusion (Dallen's 2026-05-28 smoke).
    await expect(step1Link).toContainText('See an example finished page');
    await expect(step1Link).not.toContainText(/your seller receives/i);

    // The anchor must NOT personalize off preparedFor. Filling it changes
    // nothing about the example link's framing (the example is not the
    // agent's seller), and no "Building …'s presentation." lead-in appears.
    await page
      .getByTestId('step-property-prepared-for')
      .fill('the Halloran family');
    await expect(step1Link).toContainText('See an example finished page');
    await expect(page.getByText(/Building .+ presentation\./)).toHaveCount(0);
    await expect(step1Link).toHaveAttribute('href', COHORT_EXAMPLE_URL);
  });
});
