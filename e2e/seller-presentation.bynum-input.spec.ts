import { test, expect } from "@playwright/test";

/**
 * By-the-numbers — Profile stat inputs (P0 regression + clarity + invitingness).
 *
 * P0 regression: the stat value cells used to deselect after a single keystroke
 * because the value <input> was wrapped in a component DEFINED INSIDE the
 * group's render body — a fresh identity each render remounted the field and
 * dropped focus. Hoisted to module scope, the field keeps focus while the agent
 * types, so a multi-digit number lands in one go. This drives the REAL Settings
 * → Profile form and types digit-by-digit (pressSequentially), which is what
 * triggered the remount; `fill()` would mask it.
 *
 * Also asserts the clarity + invitingness work: plain labels, example
 * placeholders, the prominent collapsible header, and the filled indicator.
 */

// The pre-labeled skeleton rows (defaultWhyUs order): 0 sale-to-list (%),
// 1 days, 2 views, 3 homes sold, 4 reviews. Value cells expose an aria-label
// of `whyus-stat-your-${idx}` (set by NumberInput / PercentInput).
const yourCell = (idx: number) => `[aria-label="whyus-stat-your-${idx}"]`;

async function openByTheNumbers(page: import("@playwright/test").Page) {
  await page.goto("/settings");
  // Open the collapsible "Why us" group (the by-numbers card lives inside it,
  // already expanded by default).
  await page.getByTestId("whyus-toggle").click();
  await expect(page.getByTestId("whyus-stats-body")).toBeVisible();
}

test.describe("By-the-numbers — P0 multi-digit typing (no deselect)", () => {
  test("a multi-digit count lands in one focused run (NumberInput cell)", async ({
    page,
  }) => {
    await openByTheNumbers(page);

    // Average listing views (row 2) — a comma-grouped NumberInput.
    const views = page.locator(yourCell(2));
    await views.click();
    await views.pressSequentially("1240", { delay: 40 });

    // The field never lost focus, so EVERY digit landed (pre-fix: only "1").
    await expect(views).toBeFocused();
    await expect(views).toHaveValue("1240");

    // Formats on blur, not per keystroke.
    await views.blur();
    await expect(views).toHaveValue("1,240");
  });

  test("a multi-character percentage lands in one focused run (PercentInput cell)", async ({
    page,
  }) => {
    await openByTheNumbers(page);

    // Average sale-to-list (row 0) — a PercentInput.
    const saleToList = page.locator(yourCell(0));
    await saleToList.click();
    await saleToList.pressSequentially("101", { delay: 40 });

    await expect(saleToList).toBeFocused();
    await expect(saleToList).toHaveValue("101");

    // "%" is appended on blur.
    await saleToList.blur();
    await expect(saleToList).toHaveValue("101%");
  });
});

test.describe("By-the-numbers — clarity + invitingness", () => {
  test("plain labels and usable example placeholders", async ({ page }) => {
    await openByTheNumbers(page);

    // Plain prompts, no unit-prefixed jargon.
    await expect(page.getByText("Your number").first()).toBeVisible();
    await expect(
      page.getByText("Market average (optional)").first(),
    ).toBeVisible();

    // Placeholders are real example values, not format descriptions.
    await expect(page.locator(yourCell(0))).toHaveAttribute(
      "placeholder",
      "99%",
    );
    await expect(page.locator(yourCell(2))).toHaveAttribute(
      "placeholder",
      "1,240",
    );
  });

  test("prominent collapsible header with a filled/unfilled indicator", async ({
    page,
  }) => {
    await openByTheNumbers(page);

    await expect(page.getByTestId("whyus-stats-toggle")).toBeVisible();
    await expect(
      page.getByText("This is your track record. It is what earns you the listing."),
    ).toBeVisible();

    // Starts unfilled, then reflects a typed number.
    const indicator = page.getByTestId("whyus-stats-filled");
    await expect(indicator).toHaveText("Not started");

    const homesSold = page.locator(yourCell(3));
    await homesSold.click();
    await homesSold.pressSequentially("32", { delay: 40 });
    await expect(indicator).toHaveText("1 filled");
  });
});
