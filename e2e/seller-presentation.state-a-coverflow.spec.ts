import { test, expect } from "@playwright/test";

/**
 * Seller State A · Zone 5 — listings coverflow render (the exposure proof).
 *
 * Drives the compiled-in preview fixtures (routed through the SAME
 * clampPublicPayload boundary as a real publish), so these assertions exercise
 * the read clamp too. Covers: the four flex states (full fan / 2-listing pair /
 * single / empty=capability-only), the number-as-hero treatment (WHITE, larger
 * than the address) with teal reserved for the keyline + aggregate, the honesty
 * branches (with/without per-card number, aggregate gated at ≥2), the mobile
 * peek-swipe vs. the desktop 3D bend, the reduced-motion flat fallback, and the
 * byte-identical guarantee (no listings ⇒ no coverflow, capability cards intact).
 */

const FULL = "/seller-presentation-preview?fixture=state-a-coverflow";
const PAIR = "/seller-presentation-preview?fixture=state-a-coverflow-pair";
const TRIO = "/seller-presentation-preview?fixture=state-a-coverflow-trio";
const SINGLE = "/seller-presentation-preview?fixture=state-a-coverflow-single";
const EMPTY = "/seller-presentation-preview?fixture=state-a"; // no recentListings

function px(value: string): number {
  return parseFloat(value || "0");
}

test.describe("State A · Zone 5 — listings coverflow", () => {
  test("full fan: portal-scale numbers, the number is the WHITE hero, plain 'Views' label", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(FULL);

    const cf = page.getByTestId("fs-sa-cf");
    await expect(cf).toBeVisible();
    await expect(cf).toContainText("Recent listings, real reach");

    // The center card carries the hero number (portal-scale) + the plain label.
    const center = page.getByTestId("fs-sa-cf-card-2");
    await expect(center).toContainText("41,184");
    await expect(center).toContainText("Views");
    await expect(center).toContainText("1240 Hawthorne St");
    // Source-agnostic: never a named portal on a number we don't control.
    await expect(cf).not.toContainText("Zillow views");

    // The number is the hero: WHITE (light, not the teal accent) and LARGER than
    // the address beneath it.
    const num = page.getByTestId("fs-sa-cf-views-2").locator(".sa-cf__num");
    const numColor = await num.evaluate((el) => getComputedStyle(el).color);
    const m = numColor.match(/\d+/g)!.map(Number);
    expect(m[0]).toBeGreaterThan(220);
    expect(m[1]).toBeGreaterThan(220);
    expect(m[2]).toBeGreaterThan(220);
    const numSize = px(
      await num.evaluate((el) => getComputedStyle(el).fontSize),
    );
    const addrSize = px(
      await center
        .locator(".sa-cf__addr")
        .evaluate((el) => getComputedStyle(el).fontSize),
    );
    expect(numSize).toBeGreaterThan(addrSize);
  });

  test("honesty: a visible card with NO view count shows address only (no empty slot)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(FULL);
    // Index 1 (418 Linden) is a visible inner card with no viewCount.
    const noNum = page.getByTestId("fs-sa-cf-card-1");
    await expect(noNum).toContainText("418 Linden Ave");
    await expect(page.getByTestId("fs-sa-cf-views-1")).toHaveCount(0);
  });

  test("aggregate: summed from real per-card numbers, total is the teal accent", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(FULL);
    const agg = page.getByTestId("fs-sa-cf-aggregate");
    await expect(agg).toBeVisible();
    // 32,246 + 41,184 + 37,610 + 28,560 = 139,600 (incl. the two peek numbers).
    // The aggregate now reads in the shared proof-number lockup (mono label ·
    // Newsreader teal number · mono caption); the number counts up to the total.
    await expect(agg).toContainText("139,600");
    await expect(agg).toContainText("Across recent listings");
    await expect(agg).toContainText("Buyer views");
    // The total reads teal (blue channel dominant), distinct from the white card
    // numbers — proving teal is reserved for the keyline + aggregate.
    const aggColor = await agg
      .locator(".sa-cf__aggnum")
      .evaluate((el) => getComputedStyle(el).color);
    const c = aggColor.match(/\d+/g)!.map(Number);
    expect(c[2]).toBeGreaterThan(c[0]); // blue > red → teal, not white
  });

  test("center card earns the one teal keyline", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(FULL);
    const width = await page
      .getByTestId("fs-sa-cf-card-2")
      .evaluate((el) => getComputedStyle(el, "::after").borderTopWidth);
    expect(px(width)).toBeGreaterThanOrEqual(2);
  });

  test("desktop engages the 3D bend; mobile degrades to a flat peek-swipe", async ({
    page,
  }) => {
    // Desktop: the fan is a perspective stage.
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(FULL);
    const persp = await page
      .getByTestId("fs-sa-cf")
      .locator(".sa-cf__fan")
      .evaluate((el) => getComputedStyle(el).perspective);
    expect(persp).not.toBe("none");

    // Mobile: no perspective; a horizontal scroll-snap carousel instead.
    await page.setViewportSize({ width: 390, height: 1600 });
    await page.goto(FULL);
    const fan = page.getByTestId("fs-sa-cf").locator(".sa-cf__fan");
    const mobilePersp = await fan.evaluate(
      (el) => getComputedStyle(el).perspective,
    );
    expect(mobilePersp).toBe("none");
    const overflowX = await fan.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe("auto");
    // The hero number still renders at portal scale on mobile (parity).
    await expect(page.getByTestId("fs-sa-cf-card-2")).toContainText("41,184");
  });

  test("reduced-motion: the fan falls back to a flat static row (no perspective)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(FULL);
    const fan = page.getByTestId("fs-sa-cf").locator(".sa-cf__fan");
    expect(await fan.evaluate((el) => getComputedStyle(el).perspective)).toBe(
      "none",
    );
    // A center card is still readable (transform removed → upright).
    const transform = await page
      .getByTestId("fs-sa-cf-card-2")
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform === "none" || transform === "").toBeTruthy();
  });

  test("2-listing state: a SEPARATED pair (no overlap/clip), aggregate present", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(PAIR);
    await expect(page.getByTestId("fs-sa-cf")).toBeVisible();
    const card0 = page.getByTestId("fs-sa-cf-card-0");
    const card1 = page.getByTestId("fs-sa-cf-card-1");
    await expect(card0).toBeVisible();
    await expect(card1).toBeVisible();
    await expect(page.getByTestId("fs-sa-cf-card-2")).toHaveCount(0);
    // The v1.5x few-card fix: the pair is pushed to ±54% so the cards never cross
    // (the old ±30% overlapped ~118px and clipped the address). Let the entrance
    // settle into the arrangement, then assert the two cards do NOT overlap.
    await page.getByTestId("fs-sa-cf").scrollIntoViewIfNeeded();
    await expect(page.locator(".sa-cf.reveal.in")).toHaveCount(1);
    await page.waitForTimeout(900); // entrance transition (.6s) + stagger
    const b0 = await card0.boundingBox();
    const b1 = await card1.boundingBox();
    expect(b0).not.toBeNull();
    expect(b1).not.toBeNull();
    const overlap =
      Math.min(b0!.x + b0!.width, b1!.x + b1!.width) - Math.max(b0!.x, b1!.x);
    // No meaningful overlap (negative/near-zero = a clean gap between the cards).
    expect(overlap).toBeLessThan(b0!.width * 0.2);
    // The centers are clearly separated (not stacked, as the broken state was).
    const c0 = b0!.x + b0!.width / 2;
    const c1 = b1!.x + b1!.width / 2;
    expect(Math.abs(c1 - c0)).toBeGreaterThan(b0!.width * 0.8);
    // Neither card carries the center keyline (a balanced pair has no single focus).
    await expect(page.locator(".sa-cf__card--center")).toHaveCount(0);
    // Both carry a number → aggregate (78,794) renders.
    await expect(page.getByTestId("fs-sa-cf-aggregate")).toContainText("78,794");
  });

  test("3-listing state: a trio with a center keyline + separated inner pair", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(TRIO);
    await expect(page.getByTestId("fs-sa-cf")).toBeVisible();
    // Middle card is the center (earns the keyline); the inner pair flank it.
    await expect(page.getByTestId("fs-sa-cf-card-0")).toBeVisible();
    const center = page.getByTestId("fs-sa-cf-card-1");
    await expect(center).toHaveClass(/sa-cf__card--center/);
    await expect(page.getByTestId("fs-sa-cf-card-2")).toBeVisible();
    await expect(page.getByTestId("fs-sa-cf-card-3")).toHaveCount(0);
    // No card clips its address (full street name present on each banded card).
    await expect(center).toContainText("Hawthorne");
  });

  test("single-listing state: one card, aggregate hidden (below the ≥2 gate)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(SINGLE);
    await expect(page.getByTestId("fs-sa-cf")).toBeVisible();
    await expect(page.getByTestId("fs-sa-cf-card-0")).toContainText("41,184");
    await expect(page.getByTestId("fs-sa-cf-card-1")).toHaveCount(0);
    // Only one number → no hollow one-listing aggregate.
    await expect(page.getByTestId("fs-sa-cf-aggregate")).toHaveCount(0);
  });

  test("byte-identical: no listings ⇒ NO coverflow, capability cards intact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(EMPTY);
    // The exposure section still renders its capability cards + reach line...
    await expect(page.getByTestId("fs-sa-spread")).toBeVisible();
    await expect(page.getByTestId("fs-sa-spread-photo")).toContainText(
      "Photography that sells",
    );
    await expect(page.getByTestId("fs-sa-spread-reach")).toBeVisible();
    // ...but the coverflow is entirely absent (flex-out / flag-off parity).
    await expect(page.getByTestId("fs-sa-cf")).toHaveCount(0);
  });

  test("State B (full) never renders the coverflow", async ({ page }) => {
    await page.goto("/seller-presentation-preview?fixture=full&template=flagship");
    await expect(page.getByTestId("fs-sa-cf")).toHaveCount(0);
  });
});
