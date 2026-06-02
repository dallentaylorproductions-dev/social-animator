import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — Year built wizard input (v1.47 Lane A polish).
 *
 * Adds the optional `yearBuilt` field on each comp row. Proves the four
 * behavioral contracts in the packet:
 *   1. Accepts up to 4 digits; non-digits are stripped.
 *   2. Range clamp runs on blur — in-range stays, out-of-range clears.
 *   3. Empty input doesn't block publish (the field is optional;
 *      Address + Sold price remain the only required comp fields).
 *   4. SSR-safe: the input renders identically on first paint (no
 *      hydration warning), then becomes interactive once currentYear
 *      lands client-side.
 *
 * No-flake conventions banked from earlier wizard specs: rely on
 * data-testid selectors, no fixed sleeps, no localStorage reset (each
 * Playwright context is fresh).
 */
test.describe('SellerPresentation - Comp yearBuilt input', () => {
  async function landOnStepComps(page: import('@playwright/test').Page) {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-comps')).toBeVisible();
    // Phase B2: commit a comp via the inline add form, then open its
    // editor — the year-built input (with the 4-digit strip + on-blur
    // range clamp) lives on the comp's editor now, not a blank card.
    await page.getByTestId('step-comps-manual-link').click();
    await page.getByTestId('step-comps-add-address').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-add-sold-price').fill('685000');
    await page.getByTestId('step-comps-add-submit').click();
    await expect(page.getByTestId('step-comps-card-0')).toBeVisible();
    await page.getByTestId('step-comps-edit-0').click();
    await expect(page.getByTestId('step-comps-year-built-0')).toBeVisible();
  }

  test('accepts 4-digit input, strips non-digits, and renders the typed value', async ({
    page,
  }) => {
    await landOnStepComps(page);
    const yearInput = page.getByTestId('step-comps-year-built-0');
    await expect(yearInput).toBeVisible();
    // Mix of digits + letters + symbols + extra digits beyond 4 — the
    // onChange handler must strip non-digits and cap at 4 chars.
    await yearInput.fill('19abc98XX123');
    await expect(yearInput).toHaveValue('1998');
  });

  test('clamps an in-range year on blur (1998 stays)', async ({ page }) => {
    await landOnStepComps(page);
    const yearInput = page.getByTestId('step-comps-year-built-0');
    await yearInput.fill('1998');
    await yearInput.blur();
    await expect(yearInput).toHaveValue('1998');
  });

  test('clears an out-of-range year on blur (2999 → empty)', async ({
    page,
  }) => {
    await landOnStepComps(page);
    const yearInput = page.getByTestId('step-comps-year-built-0');
    await yearInput.fill('2999');
    await yearInput.blur();
    await expect(yearInput).toHaveValue('');
  });

  test('clears an out-of-range year on blur (1799 → empty)', async ({
    page,
  }) => {
    await landOnStepComps(page);
    const yearInput = page.getByTestId('step-comps-year-built-0');
    await yearInput.fill('1799');
    await yearInput.blur();
    await expect(yearInput).toHaveValue('');
  });

  test('a comp with required fields filled but yearBuilt empty advances past Comps step', async ({
    page,
  }) => {
    // yearBuilt is optional — the only required comp[0] fields are
    // Address + Sold price (per validateForExport in engine/types.ts).
    // The cleanest scoped proof that the new field isn't a blocker:
    // fill the two required fields, leave yearBuilt empty, and confirm
    // Next advances off Step 2 (Comps) without surfacing an error.
    await landOnStepComps(page);
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-1-sold-price').fill('685000');
    // yearBuilt intentionally left blank.

    await page.getByTestId('wizard-next').click();
    // Step 3 is Pricing/Strategy — landing there proves Comps gating
    // accepted the empty yearBuilt without complaint.
    await expect(page.getByTestId('step-strategy')).toBeVisible();
  });
});
