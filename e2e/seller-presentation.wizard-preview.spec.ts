import { test, expect, type Page } from "@playwright/test";

/**
 * Wizard live-preview panel (capstone).
 *
 * The wizard docks a live phone-frame preview of the agent's own seller page,
 * rendered from the in-progress draft (direct client render — no iframe, no
 * round-trip). A sparse draft shows the fully-filled SAMPLE in the agent's brand
 * color, badged EXAMPLE; once the draft has anything to show, the panel becomes
 * the real page. The static "See an example" link is retired.
 */

const BLUE = "rgb(3, 114, 144)"; // flagship default signature #037290 (F3)
const TERRACOTTA = "rgb(194, 106, 78)"; // #C26A4E — the v1 default; must NOT leak

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe("Wizard live preview — desktop dock", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("fresh draft → the panel shows the BLUE example, badged", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    const dock = page.getByTestId("wizard-preview-dock");
    await expect(dock).toBeVisible();

    // Sparse → EXAMPLE badge + the real flagship rendered inside.
    const badge = page.getByTestId("wizard-preview-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("EXAMPLE");
    await expect(dock.getByTestId("seller-presentation-flagship")).toBeVisible();

    // The sample renders in the agent's brand color = the blue default, never
    // the v1 terracotta.
    const color = await read(dock.locator(".fs-price__big").first(), "color");
    expect(color).toBe(BLUE);
    expect(color).not.toBe(TERRACOTTA);
  });

  test("typing an address swaps the panel to the agent's real draft", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();
    await expect(page.getByTestId("wizard-preview-badge")).toBeVisible();

    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma, WA");

    const dock = page.getByTestId("wizard-preview-dock");
    // Debounced swap: badge → Live, and the typed address appears in the page.
    await expect(page.getByTestId("wizard-preview-live")).toBeVisible();
    await expect(page.getByTestId("wizard-preview-badge")).toHaveCount(0);
    await expect(dock.getByTestId("wizard-preview-screen")).toContainText(
      "1234 Test Drive NE",
    );
  });

  test("the retired static example link is gone from the wizard", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();
    await expect(page.getByTestId("cohort-example-link")).toHaveCount(0);
    await expect(page.getByTestId("cohort-example-link-step1")).toHaveCount(0);
  });
});

test.describe("Wizard live preview — mobile", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("mobile shows a Preview button (no dock); it opens full-screen", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // No docked panel on mobile — a floating button instead (no layout shift).
    await expect(page.getByTestId("wizard-preview-dock")).toHaveCount(0);
    const fab = page.getByTestId("wizard-preview-fab");
    await expect(fab).toBeVisible();

    await fab.click();
    await expect(page.getByTestId("wizard-preview-overlay")).toBeVisible();
    await expect(page.getByTestId("wizard-preview-screen")).toBeVisible();
    await expect(
      page.getByTestId("wizard-preview-overlay").getByTestId(
        "seller-presentation-flagship",
      ),
    ).toBeVisible();

    await page.getByTestId("wizard-preview-close").click();
    await expect(page.getByTestId("wizard-preview-overlay")).toHaveCount(0);
  });
});
