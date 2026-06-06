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

  test("the preview surface is sticky (follows the form as it scrolls)", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();
    const surface = page
      .getByTestId("wizard-preview-dock")
      .locator(".sep-preview-surface");
    // Top-anchored sticky so the panel stays in view as the form scrolls.
    expect(await read(surface, "position")).toBe("sticky");
    expect(await read(surface, "top")).toBe("40px");
    // The dock column stretches so the sticky surface has slack to travel.
    expect(
      await read(page.getByTestId("wizard-preview-dock"), "align-self"),
    ).toBe("stretch");
  });
});

test.describe("Wizard live preview — field-level scroll-sync", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // The anchored element's vertical center lies within the phone screen's
  // visible band — i.e. the panel scrolled it into view.
  const anchorInView = (
    screen: ReturnType<Page["locator"]>,
    anchorTestId: string,
  ) =>
    screen.evaluate((s: HTMLElement, id: string) => {
      const t = s.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!t) return false;
      const sr = s.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const center = tr.top + tr.height / 2;
      return center >= sr.top && center <= sr.bottom;
    }, anchorTestId);

  const scrollScreenTop = (screen: ReturnType<Page["locator"]>) =>
    screen.evaluate((s: HTMLElement) => s.scrollTo(0, 0));

  test("focusing price / a comp / a pitch point scrolls the preview to it", async ({
    page,
  }) => {
    // Instant scroll (reduced motion) → deterministic, no smooth-scroll wait.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Property → make the draft real (non-sparse) so the panel shows it.
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma, WA");
    await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();
    await page.getByTestId("wizard-next").click();

    // Comps → add one so fs-comp-0 exists, then focus it.
    await expect(page.getByTestId("step-comps")).toBeVisible();
    await page.getByTestId("step-comps-manual-link").click();
    await page.getByTestId("step-comps-add-address").fill("5678 Elm Ave NE");
    await page.getByLabel("comp-add-sold-price").fill("685000");
    await page.getByTestId("step-comps-add-submit").click();
    await expect(page.getByTestId("step-comps-card-0")).toBeVisible();

    const screen = page.getByTestId("wizard-preview-screen");
    await expect(screen.getByTestId("fs-comp-0")).toBeAttached();
    await scrollScreenTop(screen);
    await page.getByTestId("step-comps-edit-0").focus();
    await expect
      .poll(() => anchorInView(screen, "fs-comp-0"))
      .toBe(true);

    // Strategy → focus the recommended-price input; preview reveals fs-price.
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-strategy")).toBeVisible();
    await page.getByLabel("recommended-price").fill("$650,000");
    await scrollScreenTop(screen);
    await page.getByLabel("recommended-price").focus();
    await expect.poll(() => anchorInView(screen, "fs-price")).toBe(true);

    // Pitch → cards seed on entry; focusing point 0 reveals fs-pitch-0.
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-pitch")).toBeVisible();
    await expect(page.getByTestId("step-pitch-card-0")).toBeVisible();
    await expect(screen.getByTestId("fs-pitch-0")).toBeAttached();
    await scrollScreenTop(screen);
    await page.getByTestId("step-pitch-title-0").focus();
    await expect.poll(() => anchorInView(screen, "fs-pitch-0")).toBe(true);
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
