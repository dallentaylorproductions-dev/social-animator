import { test, expect, devices } from '@playwright/test';

/**
 * Mobile-WebKit repro of Dallen's A7c.9 iPhone smoke: advancing from
 * Comps → Strategy on a real iPhone landed the user at the BOTTOM of
 * the Strategy step, hiding the recommended-price + price-rationale
 * fields. The mobile project is the canonical home for this regression
 * (the bug only mattered in practice on a small viewport — desktop has
 * enough vertical room that Strategy fits without scrolling).
 *
 * Same shape as the desktop spec, taps instead of clicks, narrower
 * viewport so the long Comps step is guaranteed to overflow.
 */
test.use({ ...devices['iPhone 14'] });

test('mobile: Comps → Strategy opens with recommended price visible at the top', async ({
  page,
}) => {
  await page.goto('/seller-presentation');
  await expect(page.getByTestId('step-property')).toBeVisible();

  await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
  await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
  await page.getByTestId('wizard-next').tap();

  await expect(page.getByTestId('step-comps')).toBeVisible();
  await page.getByTestId('step-comps-manual-link').tap();
  for (let i = 0; i < 3; i += 1) {
    if (i > 0) await page.getByTestId('step-comps-add').tap();
    await page
      .getByTestId('step-comps-add-address')
      .fill(`${1000 + i} Test Ave NE`);
    await page.getByLabel('comp-add-sold-price').fill(`${600000 + i * 5000}`);
    await page.getByTestId('step-comps-add-submit').tap();
    await expect(page.getByTestId(`step-comps-card-${i}`)).toBeVisible();
  }

  // Scroll the window to the bottom of the long Comps step before
  // tapping Next — the exact gesture that surfaced the bug on Dallen's
  // phone (he taps Next from where his finger already is, which on a
  // long step is the bottom).
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const scrolledY = await page.evaluate(() => window.scrollY);
  expect(scrolledY, 'precondition: mobile page actually scrolled')
    .toBeGreaterThan(50);

  await page.getByTestId('wizard-next').tap();
  await expect(page.getByTestId('step-strategy')).toBeVisible();

  const strategyScrollY = await page.evaluate(() => window.scrollY);
  expect(strategyScrollY).toBeLessThanOrEqual(10);

  await expect(page.getByLabel('recommended-price')).toBeInViewport();

  // Back navigation also lands at top.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.getByTestId('wizard-prev').tap();
  await expect(page.getByTestId('step-comps')).toBeVisible();
  const compsScrollY = await page.evaluate(() => window.scrollY);
  expect(compsScrollY).toBeLessThanOrEqual(10);
});
