import { test, expect, type Page } from "@playwright/test";

/**
 * Flagship (v2) print pass (F4 · Change 3). Sellers save these pages as PDF, so
 * the print stylesheet must (1) keep the brand surfaces — the dark hero/agent/
 * footer bands print as-is rather than dropping to invisible cream-on-white,
 * (2) force every motion/chart end-state so a saved PDF is never mid-animation
 * (the `@media print` block IS the "beforeprint" contract — motion is CSS-only,
 * there is no JS print handler), and (3) avoid splitting self-contained units
 * across a page fold.
 *
 * Verified via `emulateMedia({ media: "print" })` + computed-style reads — no
 * manual print dialog. Driven through the stateless flagship preview route.
 */

const FLAGSHIP = "/seller-presentation-preview?fixture=full&template=flagship";

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe("Flagship — print pass", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FLAGSHIP);
    await page.emulateMedia({ media: "print" });
  });

  test("brand surfaces print exactly (color-adjust forced on the root)", async ({
    page,
  }) => {
    const root = page.getByTestId("seller-presentation-flagship");
    const std = await read(root, "print-color-adjust");
    const webkit = await read(root, "-webkit-print-color-adjust");
    // At least one alias resolves to `exact` — the dark bands + tints print.
    expect([std, webkit]).toContain("exact");
  });

  test("motion end-states are forced (reveals shown, no mid-animation PDF)", async ({
    page,
  }) => {
    // A reveal deep in the page (never scrolled into view) must still be at its
    // final opacity under print — proving the CSS contract, not the observer.
    const lateReveal = page.locator(".fs-page .fs-stat.reveal").first();
    expect(await read(lateReveal, "opacity")).toBe("1");
    expect(await read(lateReveal, "transform")).toBe("none");
  });

  test("chart prints at its end-state", async ({ page }) => {
    const line = page.locator(".fs-page .chart .line-stroke").first();
    // The draw-on line is fully drawn (offset 0), not mid-stroke (600).
    expect(parseFloat(await read(line, "stroke-dashoffset"))).toBe(0);
    const area = page.locator(".fs-page .chart .area-fill").first();
    expect(parseFloat(await read(area, "opacity"))).toBeCloseTo(0.08, 2);
    const point = page.locator(".fs-page .chart .point").first();
    expect(await read(point, "opacity")).toBe("1");
  });

  test("self-contained units avoid page-fold splits", async ({ page }) => {
    for (const sel of [
      ".fs-page .fs-comp",
      ".fs-page .fs-stat",
      ".fs-page .fs-pitch__item",
    ]) {
      const value = await read(page.locator(sel).first(), "break-inside");
      expect(value, sel).toBe("avoid");
    }
  });

  test("nothing content-bearing is hidden by the print pass", async ({
    page,
  }) => {
    // The major sections still occupy layout under print media.
    for (const id of ["fs-hero", "fs-price", "fs-why", "fs-agent", "fs-foot"]) {
      const display = await read(page.getByTestId(id), "display");
      expect(display, id).not.toBe("none");
    }
  });
});
