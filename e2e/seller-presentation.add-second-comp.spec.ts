import { test, expect } from '@playwright/test';

/**
 * A7c.4.1 — regression: adding a SECOND (blank) comp must not freeze
 * the wizard.
 *
 * Repro Dallen's A7c.4 phone smoke: the user enters Comp 1 with
 * formatted values, then taps "Add comp" again. Before the fix, the
 * new blank Comp 2 row crashed during render, halting React event
 * delegation so EVERY button on the page (Add comp / Next / Previous /
 * Dashboard / Start new) stopped responding to taps.
 *
 * The page still rendered after the crash — only event handlers were
 * dead. So the assertion is: after adding the second comp, both the
 * Add-comp button AND the wizard nav remain clickable, AND no uncaught
 * exception was logged to the console.
 */
test.describe('SellerPresentation - Add second comp interactivity', () => {
  test('adding a second blank comp keeps the wizard fully interactive', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`${err.name}: ${err.message}`);
    });

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    // Step 1: minimum to pass shell gating.
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();

    // Step 2: Comps.
    await expect(page.getByTestId('step-comps')).toBeVisible();

    // Add Comp 1 + fill all the A7c.1 inputs (currency, decimal %,
    // numeric integer, decimal miles, native date, sqft NumberInput,
    // notes). This is the on-phone shape that surfaced the freeze.
    await page.getByTestId('step-comps-add').click();
    await expect(page.getByTestId('step-comps-card-0')).toBeVisible();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-1-sold-price').fill('685000');
    await expect(page.getByLabel('comp-1-sold-price')).toHaveValue('$685,000');

    // Add Comp 2 — THIS is the click that froze the page in A7c.4.
    await page.getByTestId('step-comps-add').click();

    // 1) The new blank row renders.
    await expect(page.getByTestId('step-comps-card-1')).toBeVisible();

    // 2) Add-comp button is still clickable (the page didn't freeze).
    //    Click it again to add Comp 3 and watch the same blank-render
    //    path a second time.
    await page.getByTestId('step-comps-add').click();
    await expect(page.getByTestId('step-comps-card-2')).toBeVisible();

    // 3) Wizard nav at the BOTTOM still responds.
    await page.getByTestId('wizard-prev').click();
    await expect(page.getByTestId('step-property')).toBeVisible();
    await nextButton.click();
    await expect(page.getByTestId('step-comps')).toBeVisible();

    // 4) "Start a new presentation" affordance at the TOP still responds
    //    (it's the same React tree — if the freeze were real, this would
    //    be dead too).
    await expect(page.getByTestId('wizard-start-new')).toBeEnabled();

    // 5) Removing a comp + adding again still works post-freeze-window.
    await page.getByTestId('step-comps-remove-2').click();
    await expect(page.getByTestId('step-comps-card-2')).toHaveCount(0);
    await page.getByTestId('step-comps-add').click();
    await expect(page.getByTestId('step-comps-card-2')).toBeVisible();

    // 6) No uncaught exceptions during the whole flow. (An error
    //    boundary catch would also surface as a console error in dev.)
    expect(pageErrors, `unhandled page errors: ${pageErrors.join(' | ')}`)
      .toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`)
      .toEqual([]);
  });
});
