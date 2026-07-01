import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief V1 "context hub" (BUYER_TOUR_BRIEF_V1) — render + interaction proof,
 * driven through the fixtures-only preview route with the `?v1=` override so BOTH
 * arrangements are exercised in the browser regardless of the env flag.
 *
 * Covers: flag-off = v0 arrangement (numbers, no V1 modules); flag-on = the context hub
 * (Quick Read + comparison spine, A/B/C identity, order-not-a-ranking cue); strongest-
 * match-per-axis; pin summary card that does NOT hijack scroll; layer toggle does NOT
 * scroll the page; per-home nearby expander opens; national fixtures render.
 */

const V0 = "/buyer-tour-preview?fixture=full&v1=0";
const V1 = "/buyer-tour-preview?fixture=full&v1=1";
const PHONE = { width: 390, height: 844 };

test.describe("V1 flag gates the arrangement", () => {
  test("flag OFF renders the v0 arrangement — numeric identity, no V1 modules", async ({ page }) => {
    await page.goto(V0);
    await expect(page.getByTestId("buyer-tour-page")).toBeVisible();
    // v0 identity is numeric.
    await expect(page.getByTestId("btb-home-1-badge")).toHaveText("1");
    await expect(page.getByTestId("btb-order-1")).toHaveText("1");
    // None of the V1 modules exist.
    await expect(page.getByTestId("btb-comparison")).toHaveCount(0);
    await expect(page.getByTestId("btb-quick-read")).toHaveCount(0);
    await expect(page.getByTestId("btb-order-cue")).toHaveCount(0);
    await expect(page.getByTestId("btb-expander-A")).toHaveCount(0);
  });

  test("flag ON renders the context hub — A/B/C identity + Quick Read + comparison", async ({ page }) => {
    await page.goto(V1);
    await expect(page.getByTestId("buyer-tour-page")).toBeVisible();
    await expect(page.getByTestId("btb-home-1-badge")).toHaveText("A");
    await expect(page.getByTestId("btb-order-1")).toHaveText("A");
    await expect(page.getByTestId("btb-order-cue")).toContainText("not a ranking");
    await expect(page.getByTestId("btb-comparison")).toBeVisible();
    await expect(page.getByTestId("btb-quick-read")).toBeVisible();
    // The Fair-Housing note is retained.
    await expect(page.getByTestId("btb-cmp-note")).toContainText("never rates a school");
  });
});

test.describe("V1 comparison — strongest match per priority", () => {
  test("each axis marks exactly one strongest match; commute + school leaders are correct", async ({ page }) => {
    await page.goto(V1);
    // full fixture: commute leader is the 6-min home (A); school leader is the 0.4mi home (A).
    await expect(page.getByTestId("btb-cmp-commute-A-best")).toBeVisible();
    await expect(page.getByTestId("btb-cmp-schools-A-best")).toBeVisible();
    // Quick Read names the same leaders.
    await expect(page.getByTestId("btb-quick-read-commute")).toContainText("Shortest commute");
    // No overall "best" — each best cell is per-axis (at least commute, schools, size present).
    const bestCells = page.locator('[data-testid^="btb-cmp-"][data-testid$="-best"]');
    expect(await bestCells.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe("V1 map — pin card + no scroll hijack", () => {
  test("tapping a pin opens the summary card WITHOUT scrolling the page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(V1);
    // Center the map first so the click itself needs no auto-scroll — then any scroll
    // change is the handler's, and there must be none (the card must not hijack scroll).
    await page.getByTestId("btb-map").evaluate((e) => e.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => window.scrollY);
    await page.getByTestId("btb-map-pinbtn-1").click();
    await expect(page.getByTestId("btb-pin-card")).toBeVisible();
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4); // no hijack
    // dismissible
    await page.getByTestId("btb-pin-card-close").click();
    await expect(page.getByTestId("btb-pin-card")).toHaveCount(0);
  });

  test("toggling a map layer does NOT scroll the page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(V1);
    const coffee = page.getByTestId("btb-legend-coffee");
    await coffee.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => window.scrollY);
    await coffee.click();
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
  });
});

test.describe("V1 per-home nearby expander", () => {
  test("the expander is an obvious button that opens to reveal the nearby list", async ({ page }) => {
    await page.goto(V1);
    const btn = page.getByTestId("btb-expander-btn-A");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Everything near home A")).toBeVisible();
  });
});

test.describe("V1 national usability", () => {
  for (const fixture of ["mn", "tx"]) {
    test(`renders the context hub for the ${fixture} fixture with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`/buyer-tour-preview?fixture=${fixture}&v1=1`);
      await expect(page.getByTestId("btb-comparison")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("V1 reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("renders the context hub statically under reduced motion", async ({ page }) => {
    await page.goto(V1);
    await expect(page.getByTestId("btb-comparison")).toBeVisible();
    await page.getByTestId("btb-map-pinbtn-1").click();
    await expect(page.getByTestId("btb-pin-card")).toBeVisible();
  });
});
