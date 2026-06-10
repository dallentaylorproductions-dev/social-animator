import { test, expect } from "@playwright/test";

/**
 * By-the-numbers — P0 multi-digit typing on a real mobile-WebKit device.
 *
 * Dallen hit the deselect bug on mobile too: tapping a stat cell and typing
 * dropped focus after one digit. This runs on the iPhone-14 project (touch +
 * mobile UA) and types digit-by-digit to prove the field keeps focus so a
 * multi-digit number lands in one go. Mirror of the chromium P0 spec, scoped
 * to the touch path.
 */

const yourCell = (idx: number) => `[aria-label="whyus-stat-your-${idx}"]`;

test("a multi-digit count lands without deselecting (touch)", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByTestId("whyus-toggle").click();
  await expect(page.getByTestId("whyus-stats-body")).toBeVisible();

  // Average listing views (row 2) — NumberInput.
  const views = page.locator(yourCell(2));
  await views.scrollIntoViewIfNeeded();
  await views.tap();
  await views.pressSequentially("1240", { delay: 50 });

  await expect(views).toBeFocused();
  await expect(views).toHaveValue("1240");

  await views.blur();
  await expect(views).toHaveValue("1,240");
});
