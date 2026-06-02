import { test, expect, devices } from '@playwright/test';

/**
 * Mobile-Safari repro of Dallen's A7c.4 phone smoke, updated for the
 * Phase B2 inline-add flow. Same shape as the desktop add-comp spec but
 * with iPhone WebKit emulation (touchscreen, mobile UA, mobile viewport)
 * — that combination is what triggered the original freeze on a real
 * device. Asserts the wizard stays fully interactive after committing
 * several comps via touch, with no uncaught exceptions.
 *
 * Kept as a parallel file (not folded into the desktop spec) so it can
 * be opted-out independently if Mobile WebKit ever becomes flaky in CI.
 */
test.use({ ...devices['iPhone 14'] });

test('mobile: committing several comps keeps the wizard fully interactive', async ({
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
  await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
  await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
  await page.getByTestId('wizard-next').tap();

  await expect(page.getByTestId('step-comps')).toBeVisible();

  // Enter the manual add path + commit Comp 1.
  await page.getByTestId('step-comps-manual-link').tap();
  await expect(page.getByTestId('step-comps-add-form')).toBeVisible();
  await page.getByTestId('step-comps-add-address').fill('5678 Elm Ave NE');
  await page.getByLabel('comp-add-sold-price').fill('685000');
  await page.getByTestId('step-comps-add-submit').tap();
  await expect(page.getByTestId('step-comps-card-0')).toBeVisible();

  // Comp 2 via touch — the exact gesture path that froze the page.
  await page.getByTestId('step-comps-add').tap();
  await page.getByTestId('step-comps-add-address').fill('9012 Oak Pl NE');
  await page.getByLabel('comp-add-sold-price').fill('699000');
  await page.getByTestId('step-comps-add-submit').tap();
  await expect(page.getByTestId('step-comps-card-1')).toBeVisible();

  // The page should remain interactive — Add comp tappable again,
  // wizard nav tappable, top-of-page Start-new clickable.
  await page.getByTestId('step-comps-add').tap();
  await page.getByTestId('step-comps-add-address').fill('311 Birch Ln NE');
  await page.getByLabel('comp-add-sold-price').fill('672000');
  await page.getByTestId('step-comps-add-submit').tap();
  await expect(page.getByTestId('step-comps-card-2')).toBeVisible();

  await page.getByTestId('wizard-prev').tap();
  await expect(page.getByTestId('step-property')).toBeVisible();
  await page.getByTestId('wizard-next').tap();
  await expect(page.getByTestId('step-comps')).toBeVisible();
  await expect(page.getByTestId('wizard-start-new')).toBeEnabled();

  expect(pageErrors, `unhandled page errors: ${pageErrors.join(' | ')}`)
    .toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`)
    .toEqual([]);
});
