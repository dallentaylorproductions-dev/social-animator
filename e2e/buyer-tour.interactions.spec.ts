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

  test("SSR HTML carries no home/headshot <img> — the hydration-race broken glyph is impossible", async ({
    request,
  }) => {
    // Photos + headshot are mounted CLIENT-SIDE only, so a failing/loading <img> is
    // never in the server-rendered HTML — there is no pre-hydration window for a
    // broken glyph. This is the root-cause fix, asserted timing-independently.
    const res = await request.get("/buyer-tour-preview?fixture=full");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    // NOTE: the URLs appear in the serialized RSC props payload — that's fine; only a
    // rendered <img> TAG can show a broken glyph pre-hydration. Assert no <img src=...>
    // for the photos/headshot is server-rendered (the attribute form, not the JSON).
    expect(html).not.toContain('src="/buyer-tour-samples/__missing__.jpg"');
    expect(html).not.toContain('src="/buyer-tour-samples/home-1.svg"');
    expect(html).not.toMatch(/<img[^>]+src="\/buyer-tour-samples\//);
    // The placeholder + the page itself ARE server-rendered.
    expect(html).toContain("btb-home-3-placeholder");
  });

  test("a valid bundled home photo is revealed after it loads (placeholder gone)", async ({
    page,
  }) => {
    await page.goto(FULL); // home 1 uses a bundled same-origin SVG
    await expect(page.getByTestId("btb-home-1-photo")).toBeVisible();
    await expect(page.getByTestId("btb-home-1-placeholder")).toHaveCount(0);
  });

  test("an absent home photo renders the branded placeholder (no broken image)", async ({
    page,
  }) => {
    await page.goto(FULL);
    // Home 3 has no photoUrl at all → placeholder, never a broken <img>.
    await expect(page.getByTestId("btb-home-3-placeholder")).toBeVisible();
    await expect(page.getByTestId("btb-home-3-photo")).toHaveCount(0);
  });

  test("a REAL failing home photo (404) shows the placeholder; the photo is never revealed", async ({
    page,
  }) => {
    await page.goto(FULL);
    // Home 2 points at a missing same-origin asset (real 404, not a synthetic event).
    // The placeholder is the BASE state, shown immediately and never replaced.
    await expect(page.getByTestId("btb-home-2-placeholder")).toBeVisible();
    // If the client-mounted <img> is still present, it must remain transparent
    // (never revealed) — so no broken glyph is ever visible — and it is removed on
    // error. Either outcome satisfies "no broken image".
    const photo = page.getByTestId("btb-home-2-photo");
    if (await photo.count()) {
      const opacity = await photo.evaluate(
        (el) => getComputedStyle(el).opacity,
      );
      expect(opacity).toBe("0");
    }
    // No leaked alt text anywhere on the page.
    expect(await page.locator('img[alt]:not([alt=""])').count()).toBe(0);
  });

  test("an absent agent headshot renders a monogram", async ({ page }) => {
    await page.goto(MINIMAL); // minimal fixture agent (Alex Rivera) has no photoUrl
    await expect(page.getByTestId("btb-agent-avatar")).toHaveText("AR");
  });

  test("a REAL failing agent headshot (404) shows the monogram", async ({
    page,
  }) => {
    await page.goto(FULL); // FULL agent headshot points at a missing same-origin asset
    // The monogram is the BASE state and is shown immediately; a failing headshot
    // never reveals, so it stays the monogram "JA" (Jordan Avery).
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

test.describe("buyer-tour — national QA + map legitimacy", () => {
  for (const fx of ["mn", "tx", "rural"]) {
    test(`${fx}: no WA/JBLM copy; projected ordered pins; buyer-priority Planned-around`, async ({
      page,
    }) => {
      await page.goto(`/buyer-tour-preview?fixture=${fx}`);
      const body = page.getByTestId("buyer-tour-page");
      await expect(body).toBeVisible();
      await expect(body).not.toContainText("JBLM");
      await expect(body).not.toContainText("Tacoma");
      await expect(body).not.toContainText("South Sound");
      // Pins are projected from coords (each fixture has 3 geocoded homes) and the
      // route is an ordered polyline.
      await expect(page.getByTestId("btb-map-pin-1")).toBeAttached();
      await expect(page.getByTestId("btb-map-pin-3")).toBeAttached();
      await expect(page.getByTestId("btb-map-route")).toHaveCount(1);
      // Planned-around is the buyer's custom priorities, not the layer set.
      await expect(page.getByTestId("btb-planned-around")).toBeVisible();
      await expect(page.getByTestId("btb-planned-around")).not.toContainText(
        "School locations",
      );
    });
  }

  test("FAR commute anchor (Dallas Love Field) is omitted from the map; chips remain", async ({
    page,
  }) => {
    await page.goto("/buyer-tour-preview?fixture=tx");
    await expect(page.getByTestId("btb-map-anchor")).toHaveCount(0);
    await expect(page.getByTestId("btb-chip-1-commute")).toContainText(
      "Dallas Love Field",
    );
  });

  test("NEAR commute anchor (Downtown Minneapolis) shows the on-map tag", async ({
    page,
  }) => {
    await page.goto("/buyer-tour-preview?fixture=mn");
    await expect(page.getByTestId("btb-map-anchor")).toContainText("Downtown");
  });

  test("layer toggle ties map ↔ chips in a non-WA market (tx)", async ({
    page,
  }) => {
    await page.goto("/buyer-tour-preview?fixture=tx");
    const chip = page.getByTestId("btb-chip-1-schools");
    await expect(chip).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("btb-map-marker-1-schools")).toHaveCount(1);
    await page.getByTestId("btb-legend-schools").click();
    await expect(chip).toHaveAttribute("data-active", "false");
    await expect(page.getByTestId("btb-map-marker-1-schools")).toHaveCount(0);
  });

  test("geocode-fail fixture shows the calm Map-unavailable fallback (no broken map)", async ({
    page,
  }) => {
    await page.goto("/buyer-tour-preview?fixture=nomap");
    await expect(page.getByTestId("btb-map-unavailable")).toContainText(
      "Map unavailable",
    );
    await expect(page.getByTestId("btb-map")).toHaveCount(0);
    // Tour order + home cards still render.
    await expect(page.getByTestId("btb-order-1")).toBeVisible();
    await expect(page.getByTestId("btb-home-1")).toBeVisible();
  });

  test("single-geocoded fixture shows one pin and hides the route line", async ({
    page,
  }) => {
    await page.goto("/buyer-tour-preview?fixture=onepin");
    await expect(page.getByTestId("btb-map-pin-1")).toBeAttached();
    await expect(page.getByTestId("btb-map-pin-2")).toHaveCount(0);
    await expect(page.getByTestId("btb-map-route")).toHaveCount(0);
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
