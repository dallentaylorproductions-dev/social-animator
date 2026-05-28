import { test, expect, devices } from '@playwright/test';

/**
 * Mobile-Safari repro of Dallen's A7c.4 phone smoke. Same shape as
 * the desktop add-second-comp spec, but with iPhone WebKit emulation
 * (touchscreen, mobile UA, mobile viewport) — that combination is
 * what triggered the freeze on a real device.
 *
 * Kept as a parallel file (not folded into the desktop spec) so it can
 * be opted-out independently if Mobile WebKit ever becomes flaky in CI.
 */
test.use({ ...devices['iPhone 14'] });

test('mobile: adding a second blank comp keeps the wizard fully interactive', async ({
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

  await page.getByTestId('step-comps-add').tap();
  await expect(page.getByTestId('step-comps-card-0')).toBeVisible();
  await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
  await page.getByLabel('comp-1-sold-price').fill('685000');

  // Add second blank comp via tap (touch) — the exact gesture that froze
  // the page on Dallen's phone.
  await page.getByTestId('step-comps-add').tap();
  await expect(page.getByTestId('step-comps-card-1')).toBeVisible();

  // The page should remain interactive — Add comp clickable again,
  // wizard nav clickable, top-of-page Start-new clickable.
  await page.getByTestId('step-comps-add').tap();
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
