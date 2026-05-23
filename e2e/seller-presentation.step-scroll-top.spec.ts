import { test, expect } from '@playwright/test';

/**
 * A7c.9 — every wizard step transition (Next AND Back) must open the
 * new step scrolled to the top. Dallen's iPhone smoke surfaced that
 * advancing from Comps → Strategy was landing on the BOTTOM of the
 * Strategy step (pricing-strategy framework + comp-set confidence),
 * hiding the recommended-price + price-rationale fields that should
 * appear first.
 *
 * Mechanism under test: the wizard shell's per-step-change effect
 * resets window.scrollY to 0 after React commits the new step's DOM.
 *
 * Repro shape:
 *   1. Step 1 → Step 2 (Comps)
 *   2. Add comps + scroll the window down so the Next button is not
 *      already at scrollY=0 when clicked.
 *   3. Click Next → assert StepStrategy is visible AND scrollY is at
 *      the top.
 *   4. Repeat for Back navigation (Strategy → Comps).
 */
test.describe('SellerPresentation - step transitions land at top of step', () => {
  test('Comps → Strategy lands at the top, recommended price visible', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    // Step 1: minimum to pass shell gating.
    await page
      .getByTestId('step-property-address')
      .fill('1234 Test Drive NE');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
    await page.getByTestId('wizard-next').click();

    // Step 2: Comps. Fill enough rows that the page is taller than the
    // viewport so scrollY can plausibly land non-zero before clicking
    // Next. (Without this we wouldn't actually be testing the reset.)
    await expect(page.getByTestId('step-comps')).toBeVisible();
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('step-comps-add').click();
      await expect(page.getByTestId(`step-comps-card-${i}`)).toBeVisible();
    }

    // Force the window to the bottom — same shape as a phone user who
    // tapped Next from the page bottom after editing comps.
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const scrolledY = await page.evaluate(() => window.scrollY);
    expect(scrolledY, 'precondition: page must actually be scrolled down')
      .toBeGreaterThan(50);

    // Advance to Strategy.
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-strategy')).toBeVisible();

    // Acceptance: viewport landed near the top. Allow a small slack to
    // tolerate browser bar / focus-shift jitter; the failing pre-fix
    // behavior left scrollY in the hundreds (full prior Comps height).
    const strategyScrollY = await page.evaluate(() => window.scrollY);
    expect(strategyScrollY).toBeLessThanOrEqual(10);

    // And the most-important field on Strategy is in the viewport.
    await expect(page.getByLabel('recommended-price')).toBeInViewport();

    // Symmetric assertion for Back navigation. First make the Strategy
    // step long enough to scroll, then go Back and assert Comps lands
    // at the top.
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const strategyBottomY = await page.evaluate(() => window.scrollY);
    expect(strategyBottomY, 'precondition for Back: Strategy scrolled down')
      .toBeGreaterThan(50);

    await page.getByTestId('wizard-prev').click();
    await expect(page.getByTestId('step-comps')).toBeVisible();
    const compsScrollY = await page.evaluate(() => window.scrollY);
    expect(compsScrollY).toBeLessThanOrEqual(10);
  });
});
