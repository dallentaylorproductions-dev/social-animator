import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seller State A - campaign-spread mobile layout + valuation status chip.
 *
 * Two State A visual-polish issues locked here:
 *
 *   1. CAMPAIGN MOBILE REFLOW - the "How I'll get your home seen" spread looked
 *      scattered on phones: the secondary capability frames (the agent's video-tour
 *      poster + marketing items) packed into a thin 2-up beside each other, so the
 *      imagery read as cramped, misaligned half-frames. On mobile (<= the 560px
 *      State A breakpoint) the secondary frames now stack into ONE column, so the
 *      image frames go full-width and legible and the text capability items sit
 *      beneath as compact full-width chips. Desktop keeps its deliberate 1.4fr/1fr
 *      side-by-side (>= 720px), untouched.
 *
 *   2. VALUATION STATUS CHIP - "Prepared estimate · pending walkthrough" was a plain
 *      bordered mono label. It is now an intentional status chip: a calm teal status
 *      dot with a soft halo + a faint glass fill, still quiet (no price, no
 *      countdown - the valuation stays understated).
 *
 * State-A-scoped only (.sa-spread* / .sa-frame* / .sa-val*). The full presentation
 * and flag-off render are untouched. Driven via the stateless preview route's State
 * A fixture (the same CSS the /h/ route serves).
 */

const STATE_A = "/seller-presentation-preview?fixture=state-a";
const MOBILE = { width: 390, height: 800 };
const DESKTOP = { width: 1200, height: 900 };

const STATE_A_CSS = resolve(
  process.cwd(),
  "src/tools/seller-presentation/output/flagship/state-a.css",
);

test.describe("State A - campaign spread reflows intentionally on mobile", () => {
  test.use({ viewport: MOBILE });

  test("on a phone the secondary capability frames stack into a single column", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const rest = page.locator(".fs-page.state-a .sa-spread__rest");
    await expect(rest).toHaveCount(1);

    // A single-column grid reports one track in grid-template-columns; a 2-up
    // would report two. This is the deliberate phone stack (no thin half-frames).
    const tracks = await rest.evaluate((el) =>
      getComputedStyle(el)
        .gridTemplateColumns.trim()
        .split(/\s+/)
        .filter(Boolean),
    );
    expect(
      tracks.length,
      "the secondary frames must stack full-width on mobile, not pack 2-up",
    ).toBe(1);
  });

  test("the capability video frame fills the column width on mobile (legible, not a sliver)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const video = page.getByTestId("fs-sa-spread-video");
    await expect(video).toBeVisible();
    const rest = page.locator(".fs-page.state-a .sa-spread__rest");

    const [frameW, restW] = await Promise.all([
      video.evaluate((el) => el.getBoundingClientRect().width),
      rest.evaluate((el) => el.getBoundingClientRect().width),
    ]);
    // Full-width within the single-column stack (allow a hair for sub-pixel).
    expect(frameW).toBeGreaterThan(restW - 2);
  });
});

test.describe("State A - campaign spread keeps its side-by-side on desktop", () => {
  test.use({ viewport: DESKTOP });

  test("desktop keeps the 2-up secondary grid (no regression from the mobile stack)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const rest = page.locator(".fs-page.state-a .sa-spread__rest");
    await expect(rest).toHaveCount(1);
    const tracks = await rest.evaluate((el) =>
      getComputedStyle(el)
        .gridTemplateColumns.trim()
        .split(/\s+/)
        .filter(Boolean),
    );
    expect(tracks.length, "desktop secondary frames stay 2-up").toBe(2);
  });
});

test.describe("State A - valuation status chip is upgraded but still quiet", () => {
  test("the chips render the prepared + pending labels with a status dot", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    // v1.5x: the single combined chip is split into two tinted chips.
    const label = page.getByTestId("fs-sa-valuation-label");
    await expect(label).toBeVisible();
    await expect(label.locator(".sa-val__chip")).toHaveCount(2);
    await expect(label).toContainText("Prepared estimate");
    await expect(label).toContainText("Pending walkthrough");
    // The intentional status marker sits on the prepared chip (one dot, not two).
    await expect(label.locator(".sa-val__dot")).toHaveCount(1);
    await expect(
      label.locator(".sa-val__chip--status .sa-val__dot"),
    ).toHaveCount(1);
  });

  test("the chip stays understated: no price and no countdown", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const label = page.getByTestId("fs-sa-valuation-label");
    await expect(label).toBeVisible();
    // The chip itself never shows a dollar figure or a timer (the neighborhood
    // sold-range context line beneath it MAY carry prices - that is allowed and
    // separate; this guard is scoped to the status chip the upgrade touched).
    const text = (await label.textContent()) ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/countdown|expires|days? left|hours? left|unlock/i);
  });

  test("source: the status dot is styled (calm halo), not a bare element", () => {
    const css = readFileSync(STATE_A_CSS, "utf8");
    const rule = css.match(/\.sa-val__dot\s*\{[\s\S]*?\}/);
    expect(rule, ".sa-val__dot rule not found").toBeTruthy();
    expect(rule![0]).toMatch(/border-radius:\s*50%/);
    expect(rule![0]).toMatch(/box-shadow:/);
  });
});
