import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief — buyer-facing page interactions (BUYER_TOUR_BRIEF).
 *
 * Driven through the stateless preview route's fixtures — the same render path
 * /tour/<slug> takes for a published payload. Proves the acceptance-criteria
 * interactions: no horizontal overflow, a static planned-around card, a wrapping
 * legend of real ≥44px controls, layer toggle → map markers + matching chips,
 * pin tap → scroll + highlight, and the reduced-motion static-highlight path.
 */

const FULL = "/buyer-tour-preview?fixture=full";
const MINIMAL = "/buyer-tour-preview?fixture=minimal";
const PHONE = { width: 390, height: 844 };

test.describe("buyer-tour page — layout + controls", () => {
  test("renders with no horizontal overflow at phone width", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(FULL);
    await expect(page.getByTestId("buyer-tour-page")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    // Allow a 1px rounding slack; anything more is a real horizontal slider.
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("planned-around hero + agent note are visible without scrolling to reveal", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(FULL);
    await expect(page.getByTestId("btb-tour-date")).toBeVisible();
    await expect(page.getByTestId("btb-agent-note")).toBeVisible();
  });

  test("legend controls are real switches with ≥44px tap targets", async ({
    page,
  }) => {
    await page.goto(FULL);
    const coffee = page.getByTestId("btb-legend-coffee");
    await expect(coffee).toBeVisible();
    await expect(coffee).toHaveAttribute("role", "switch");
    await expect(coffee).toHaveAttribute("aria-checked", "true");
    const box = await coffee.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("school layer label reads 'School locations'", async ({ page }) => {
    await page.goto(FULL);
    await expect(page.getByTestId("btb-legend-schools")).toContainText(
      "School locations",
    );
  });

  test("footer Fair Housing disclaimer renders", async ({ page }) => {
    await page.goto(FULL);
    await expect(page.getByTestId("btb-disclaimer")).toContainText(
      "served equally",
    );
  });

  test("an absent home photo renders the branded placeholder (no broken image)", async ({
    page,
  }) => {
    await page.goto(FULL);
    // Home 3 has no photoUrl at all → placeholder, never a broken <img>.
    await expect(page.getByTestId("btb-home-3-placeholder")).toBeVisible();
    await expect(page.getByTestId("btb-home-3-photo")).toHaveCount(0);
  });

  test("a home photo that FAILS to load falls back to the branded placeholder", async ({
    page,
  }) => {
    await page.goto(FULL);
    // Home 2 has a non-loadable URL. Drive the failure deterministically (a bad URL
    // just hangs in CI rather than firing `error`), then assert the swap.
    const img = page.getByTestId("btb-home-2-photo");
    await expect(img).toBeAttached();
    await img.evaluate((el) => el.dispatchEvent(new Event("error")));
    await expect(page.getByTestId("btb-home-2-placeholder")).toBeVisible();
    await expect(page.getByTestId("btb-home-2-photo")).toHaveCount(0);
  });

  test("an absent agent headshot renders a monogram", async ({ page }) => {
    await page.goto(MINIMAL); // minimal fixture agent (Alex Rivera) has no photoUrl
    await expect(page.getByTestId("btb-agent-avatar")).toHaveText("AR");
  });

  test("a failed agent headshot load falls back to a monogram", async ({
    page,
  }) => {
    await page.goto(FULL); // FULL agent is Jordan Avery → monogram "JA"
    const avatar = page.getByTestId("btb-agent-avatar");
    await avatar.evaluate((el) => el.dispatchEvent(new Event("error")));
    await expect(page.getByTestId("btb-agent-avatar")).toHaveText("JA");
  });
});

test.describe("buyer-tour page — layer toggle ties map ↔ chips", () => {
  test("toggling a layer off updates BOTH the map markers and the matching chips", async ({
    page,
  }) => {
    await page.goto(FULL);

    // Home 1 carries a parks chip; it starts active (priority enabled).
    const parksChip = page.getByTestId("btb-chip-1-parks");
    await expect(parksChip).toHaveAttribute("data-active", "true");
    // Its map marker is present while active.
    await expect(page.getByTestId("btb-map-marker-1-parks")).toHaveCount(1);

    // Toggle the parks layer OFF.
    await page.getByTestId("btb-legend-parks").click();

    // Chip dims (inactive) AND the map marker disappears.
    await expect(parksChip).toHaveAttribute("data-active", "false");
    await expect(page.getByTestId("btb-map-marker-1-parks")).toHaveCount(0);

    // A different active layer's chip is unaffected.
    await expect(page.getByTestId("btb-chip-1-commute")).toHaveAttribute(
      "data-active",
      "true",
    );
  });
});

test.describe("buyer-tour page — v0.2 polish", () => {
  test("Planned around shows the buyer's CUSTOM priorities, not map-layer labels", async ({
    page,
  }) => {
    await page.goto(FULL);
    const planned = page.getByTestId("btb-planned-around");
    await expect(planned).toContainText("Home office");
    await expect(planned).toContainText("Short commute");
    // It must NOT be the fixed map-layer set.
    await expect(planned).not.toContainText("School locations");
  });

  test("Tour Snapshot renders the full 2x2 (Date / Start / Homes / Length)", async ({
    page,
  }) => {
    await page.goto(FULL);
    const body = page.getByTestId("buyer-tour-page");
    await expect(body).toContainText("Start");
    await expect(body).toContainText("9:30 AM");
    await expect(body).toContainText("Length");
    await expect(page.getByTestId("btb-tour-date")).toContainText("Saturday");
  });

  test("'stops' copy has a space (no 4stops trap)", async ({ page }) => {
    await page.goto(FULL);
    await expect(page.getByTestId("btb-map-section")).toContainText(
      "The 4 stops in order",
    );
  });

  test("home cards show at most 3 proximity chips", async ({ page }) => {
    await page.goto(FULL);
    const chipCount = await page
      .getByTestId("btb-home-1-chips")
      .locator("li")
      .count();
    expect(chipCount).toBeLessThanOrEqual(3);
  });

  test("the map commute tag uses a short dynamic anchor label (no clip)", async ({
    page,
  }) => {
    await page.goto(FULL); // anchor label "JBLM main gate" → short form "JBLM"
    await expect(page.getByTestId("btb-map-anchor")).toContainText("JBLM");
  });
});

test.describe("buyer-tour page — national usability (non-WA sample)", () => {
  const MN = "/buyer-tour-preview?fixture=mn";

  test("commute label is dynamic from the tour's anchor; no JBLM leaks in", async ({
    page,
  }) => {
    await page.goto(MN);
    // Map tag reads the MN anchor, not a hardcoded place.
    await expect(page.getByTestId("btb-map-anchor")).toContainText("Downtown");
    // The commute chip reads "<time> to Downtown Minneapolis".
    await expect(page.getByTestId("btb-chip-1-commute")).toContainText(
      "to Downtown Minneapolis",
    );
    // No South Sound assumption anywhere on the page.
    await expect(page.getByTestId("buyer-tour-page")).not.toContainText("JBLM");
  });

  test("a photoless agent renders a monogram (ML)", async ({ page }) => {
    await page.goto(MN);
    await expect(page.getByTestId("btb-agent-avatar")).toHaveText("ML");
  });
});

test.describe("buyer-tour page — brand color distribution", () => {
  test("brand accent owns the tour thread; category colors own the map logic", async ({
    page,
  }) => {
    await page.goto(FULL); // fixture brandAccent = #7c3aed (purple)

    // Tour thread = brand accent: the route line stroke + a category-free thread.
    await expect(page.getByTestId("btb-map-route")).toHaveAttribute(
      "stroke",
      "#7c3aed",
    );
    // Tour-order step number is painted with the brand accent (rgb(124,58,237)).
    const orderBg = await page
      .getByTestId("btb-order-1")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(orderBg).toBe("rgb(124, 58, 237)");

    // The primary CTA is the brand accent too.
    const ctaBg = await page
      .getByTestId("btb-primary-cta")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(ctaBg).toBe("rgb(124, 58, 237)");

    // Map logic = the FIXED semantic palette, NOT the brand accent: the schools
    // marker is blue (#3b82f6), never the purple accent.
    await expect(page.getByTestId("btb-map-marker-1-schools")).toHaveAttribute(
      "fill",
      "#3b82f6",
    );
  });
});

test.describe("buyer-tour page — pin tap", () => {
  test("tapping a map pin scrolls to and highlights the matching home", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(FULL);

    const home3 = page.getByTestId("btb-home-3");
    await expect(home3).toHaveAttribute("data-highlighted", "false");

    await page.getByTestId("btb-map-pinbtn-3").click();

    await expect(home3).toHaveAttribute("data-highlighted", "true");
    await expect(home3).toBeInViewport();
    // The stop badge + the "why it's on the list" are part of the highlighted card.
    await expect(page.getByTestId("btb-home-3-badge")).toContainText("3");
  });

  test("reduced-motion: pin tap still applies a static highlight", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(PHONE);
    await page.goto(FULL);

    await page.getByTestId("btb-map-pinbtn-2").click();
    const home2 = page.getByTestId("btb-home-2");
    await expect(home2).toHaveAttribute("data-highlighted", "true");
    await expect(home2).toBeVisible();
    // Markers still present (they appear without scale/transition under reduced motion).
    await expect(page.getByTestId("btb-map-marker-2-commute")).toHaveCount(1);
  });
});
