import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Flagship (v2) §02 comp card: the address must never collide with the sold
 * price. On a real iPhone a long single-word address ("1705 N Anderson St") used
 * to expand to the full narrow column and the pinned price ($580,000) landed on
 * top of "St". The fix stacks the body into a single column on mobile (address,
 * then a price row, then meta) and adds an all-width word-wrap safety net, while
 * keeping the desktop side-by-side layout byte-identical.
 *
 * The comp card is a SINGLE shared component (WhyPrice.tsx → CompCard), so this
 * route exercises the same DOM the sample, the in-wizard live preview, and the
 * published /h page all render.
 *
 * Driven via the stateless flagship preview route. fixture=full's comp index 1
 * is "1705 N Anderson St" / "$580,000".
 */

const FLAGSHIP = "/seller-presentation-preview?fixture=full&template=flagship";
const MOBILE = { width: 390, height: 800 };
const DESKTOP = { width: 1280, height: 900 };

type Box = { x: number; y: number; width: number; height: number };

async function box(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  expect(b, "element must have a bounding box").not.toBeNull();
  return b as Box;
}

// Axis-aligned rectangle intersection (positive overlap on BOTH axes).
function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function addr(page: Page, index: number): Locator {
  return page.getByTestId(`fs-comp-${index}`).locator(".comp-card__addr");
}
function price(page: Page, index: number): Locator {
  return page.getByTestId(`fs-comp-${index}`).locator(".comp-card__price");
}

test.describe("Flagship comp card: mobile stacks the price under the address (no overlap)", () => {
  test.use({ viewport: MOBILE });

  test('the "1705 N Anderson St" address and its price never intersect, and nothing overflows the card', async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const card = page.getByTestId("fs-comp-1");
    await expect(card).toBeVisible();

    const a = await box(addr(page, 1));
    const p = await box(price(page, 1));
    const c = await box(card);

    // The whole point of the bug: these two boxes must not overlap.
    expect(intersects(a, p), "address and price boxes must not intersect").toBe(
      false,
    );
    // Stacked: the price row sits BELOW the full-width address (top-down reading
    // order: which home, then how much). Half-pixel tolerance for sub-pixel rounding.
    expect(p.y).toBeGreaterThanOrEqual(a.y + a.height - 0.5);
    // Nothing overflows the card horizontally.
    expect(a.x + a.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(a.x).toBeGreaterThanOrEqual(c.x - 0.5);
  });

  test("a synthetic long single-word address still cannot overlap the price or overflow", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const card = page.getByTestId("fs-comp-1");
    await expect(card).toBeVisible();

    // Stress the safety net: replace the address with one un-spaced long word
    // (the exact shape that triggered the original overlap on a real iPhone).
    await addr(page, 1).evaluate((el) => {
      el.textContent = "1705 N Andersonnnnnnnnnn St";
    });

    const a = await box(addr(page, 1));
    const p = await box(price(page, 1));
    const c = await box(card);

    expect(intersects(a, p), "address and price must not intersect").toBe(false);
    expect(p.y).toBeGreaterThanOrEqual(a.y + a.height - 0.5);
    // overflow-wrap: anywhere must keep even this word inside the card.
    expect(a.x + a.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  });
});

test.describe("Flagship comp card: desktop keeps the side-by-side layout", () => {
  test.use({ viewport: DESKTOP });

  test("the price sits to the RIGHT of the address on the SAME row (not stacked)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    await expect(page.getByTestId("fs-comp-1")).toBeVisible();

    const a = await box(addr(page, 1));
    const p = await box(price(page, 1));

    // Same row: the boxes share a vertical band.
    const sameRow = a.y < p.y + p.height && a.y + a.height > p.y;
    expect(sameRow, "address and price must share a row on desktop").toBe(true);
    // Side-by-side: the price is to the right of the address.
    expect(p.x).toBeGreaterThan(a.x);
  });
});
