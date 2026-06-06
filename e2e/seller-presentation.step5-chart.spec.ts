import { test, expect, type Page } from "@playwright/test";

/**
 * Step 5 area-chart preview (capstone). The production flagship chart, inline,
 * in two honest states (frozen geometry — skin only):
 *   • no monthly series yet → the sample chart in NEUTRAL gray, badged EXAMPLE.
 *   • a month entered → the agent's real chart in their brand color (blue).
 */

const BLUE = "rgb(3, 114, 144)"; // flagship default signature #037290
const GRAY = "rgb(154, 154, 154)"; // #9A9A9A neutral sample stroke

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function reachEditorial(page: Page) {
  await page.goto("/seller-presentation");
  await expect(page.getByTestId("step-property")).toBeVisible();
  await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
  await page.getByTestId("step-property-city").fill("Tacoma, WA");
  await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();
  // property → comps → strategy → pitch → editorial (non-property steps pass).
  for (let i = 0; i < 4; i++) {
    await page.getByTestId("wizard-next").click();
  }
  await expect(page.getByTestId("step-editorial")).toBeVisible();
}

test.describe("Step 5 area-chart preview", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("neutral-gray EXAMPLE before data → brand-blue live after a month is entered", async ({
    page,
  }) => {
    await reachEditorial(page);

    // Open the Area-snapshot section so its editor + chart preview render.
    await page.getByTestId("step-editorial-areaStats-add").click();

    const preview = page.getByTestId("step-editorial-chart-preview");
    await expect(preview).toBeVisible();

    // EXAMPLE state: badged, chart drawn in neutral gray (NOT the brand color).
    await expect(preview).toHaveAttribute("data-state", "example");
    await expect(page.getByTestId("step-editorial-chart-badge")).toBeVisible();
    const line = preview.locator(".line-stroke").first();
    await expect(line).toBeVisible();
    expect(await read(line, "stroke")).toBe(GRAY);

    // Enter one month's price → the chart becomes the agent's, in brand blue.
    await page.getByLabel("area-month-0-price").fill("$640,000");

    await expect(preview).toHaveAttribute("data-state", "live");
    await expect(page.getByTestId("step-editorial-chart-live")).toBeVisible();
    await expect(page.getByTestId("step-editorial-chart-badge")).toHaveCount(0);
    expect(await read(preview.locator(".line-stroke").first(), "stroke")).toBe(
      BLUE,
    );
  });
});
