import { test, expect } from '@playwright/test';

/**
 * A7c.4.1 → Phase B2 — regression: adding multiple comps must not
 * freeze the wizard.
 *
 * Original repro (A7c.4): the old editor added a BLANK comp row on
 * every "Add comp" tap, and the blank row crashed during render,
 * halting React event delegation so EVERY button on the page went
 * dead (page still painted, handlers were not).
 *
 * Phase B2 replaced the blank-row model with an inline add form
 * (fill-then-commit) — so the original blank-render path no longer
 * exists — but the interactivity guarantee still matters: after
 * committing several comps the whole wizard (add row, nav, top-nav
 * affordances) must stay clickable with no uncaught exceptions. This
 * spec exercises the new flow and asserts the same invariants.
 */
test.describe('SellerPresentation - Add multiple comps interactivity', () => {
  test('committing several comps keeps the wizard fully interactive', async ({
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

    // Step 2: empty state. Enter the manual add path.
    await expect(page.getByTestId('step-comps')).toBeVisible();
    await page.getByTestId('step-comps-manual-link').click();

    // Comp 1 — fill the inline form (currency formats live) + commit.
    await expect(page.getByTestId('step-comps-add-form')).toBeVisible();
    await page.getByTestId('step-comps-add-address').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-add-sold-price').fill('685000');
    await expect(page.getByLabel('comp-add-sold-price')).toHaveValue('$685,000');
    await page.getByTestId('step-comps-add-submit').click();
    await expect(page.getByTestId('step-comps-card-0')).toBeVisible();

    // Comp 2 — "+ Add a comp" row is the gesture that must not freeze.
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-add-address').fill('9012 Oak Pl NE');
    await page.getByLabel('comp-add-sold-price').fill('699000');
    await page.getByTestId('step-comps-add-submit').click();
    await expect(page.getByTestId('step-comps-card-1')).toBeVisible();

    // Comp 3 — same path a second time.
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-add-address').fill('311 Birch Ln NE');
    await page.getByLabel('comp-add-sold-price').fill('672000');
    await page.getByTestId('step-comps-add-submit').click();
    await expect(page.getByTestId('step-comps-card-2')).toBeVisible();

    // Wizard nav at the BOTTOM still responds.
    await page.getByTestId('wizard-prev').click();
    await expect(page.getByTestId('step-property')).toBeVisible();
    await nextButton.click();
    await expect(page.getByTestId('step-comps')).toBeVisible();

    // "Start a new presentation" affordance at the TOP still responds.
    await expect(page.getByTestId('wizard-start-new')).toBeEnabled();

    // Removing a comp (via its edit panel) + adding again still works.
    await page.getByTestId('step-comps-edit-2').click();
    await page.getByTestId('step-comps-remove-2').click();
    await expect(page.getByTestId('step-comps-card-2')).toHaveCount(0);
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-add-address').fill('44 Maple Ct NE');
    await page.getByLabel('comp-add-sold-price').fill('690000');
    await page.getByTestId('step-comps-add-submit').click();
    await expect(page.getByTestId('step-comps-card-2')).toBeVisible();

    // No uncaught exceptions during the whole flow.
    expect(pageErrors, `unhandled page errors: ${pageErrors.join(' | ')}`)
      .toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`)
      .toEqual([]);
  });
});
