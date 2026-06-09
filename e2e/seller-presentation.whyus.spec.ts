import { test, expect, type Page } from "@playwright/test";

/**
 * B0b — Why-us section on the flagship (v2) seller page.
 *
 * Driven via the stateless preview route with `?template=flagship` (the same
 * read-time override `/h/` exposes). Deterministic DOM + computed-style
 * assertions:
 *   - every why-us sub-block renders from the FULL fixture;
 *   - legibility — reading text stays ink, never the accent;
 *   - the comparison bars carry a measured draw-on target (`--w`);
 *   - tagline + reviews-headline surface near the agent / reviews blocks;
 *   - FLEX — the minimal fixture (no whyUs) renders complete, section absent;
 *   - v1 cohort — an unset/v1 payload never mounts the section or leaks the copy.
 */

const INK = "rgb(27, 42, 46)"; // --ink #1B2A2E (D1 locked neutral, every signature)

const FLAGSHIP_FULL =
  "/seller-presentation-preview?fixture=full&template=flagship";
const FLAGSHIP_MINIMAL =
  "/seller-presentation-preview?fixture=minimal&template=flagship";
const V1_FULL = "/seller-presentation-preview?fixture=full";

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe("Why-us — per-block render (full fixture)", () => {
  test("the section + every populated sub-block renders", async ({ page }) => {
    await page.goto(FLAGSHIP_FULL);

    // Selling points — D1-CLEANUP restored a dedicated home for the agent's
    // non-marketing pitch cards (the old differentiators wall is gone). Reuses
    // the locked v1 heading copy.
    const selling = page.getByTestId("fs-whyus-selling");
    await expect(selling).toBeVisible();
    await expect(selling).toContainText("A quiet, thorough way to sell");
    // The fixture's "A Friday-evening update…" point lands here (chat icon).
    await expect(page.getByTestId("fs-whyus-pitch-2")).toBeVisible();

    // Performance: two comparison bars (sale-to-list, days-on-market) + two
    // single big stats (views, homes sold).
    await expect(page.getByTestId("fs-whyus-stats")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-0")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-1")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bigstat-0")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bigstat-1")).toBeVisible();

    // Marketing approach (3 dedicated rows; the 4th slot is the routed launch card).
    for (const i of [0, 1, 2]) {
      await expect(page.getByTestId(`fs-whyus-mkt-${i}`)).toBeVisible();
    }

    // How-we-work (5 steps).
    for (const i of [0, 1, 2, 3, 4]) {
      await expect(page.getByTestId(`fs-whyus-step-${i}`)).toBeVisible();
    }

    // Guarantee — D1-CLEANUP relocated it from the removed differentiators wall
    // into the AGENT block; it no longer renders inside the why-us chapter.
    await expect(page.getByTestId("fs-whyus-guarantee")).toHaveCount(0);
    await expect(
      page.getByTestId("fs-agent").getByTestId("fs-agent-guarantee"),
    ).toBeVisible();
  });

  test("reading text stays ink; the bar numeral carries the signature", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);

    // Body copy (a selling-point card title) is ink — legibility never rides
    // the accent.
    const diffText = page
      .getByTestId("fs-whyus-pitch-2")
      .locator(".rcard__title");
    expect(await read(diffText, "color")).toBe(INK);

    // The substantive bar value is NOT ink (it carries --signature, deepened on
    // pale-signature pages). Proving it differs from ink keeps the design intent
    // honest without hardcoding a specific signature hex.
    const barVal = page.getByTestId("fs-whyus-bar-0").locator(".cmp__col--you .spark");
    expect(await read(barVal, "color")).not.toBe(INK);
  });

  test("comparison bars carry a measured draw-on target (--w)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);
    // The fill's inline style sets the draw-on target width; deterministic
    // regardless of whether the IntersectionObserver has fired yet.
    const fill = page.getByTestId("fs-whyus-bar-0-you");
    const style = (await fill.getAttribute("style")) ?? "";
    expect(style).toContain("--fill");
  });

  test("agent tagline + reviews headline surface (additive, near their blocks)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);

    await expect(page.getByTestId("fs-agent-tagline")).toBeVisible();
    await expect(page.getByTestId("fs-agent-tagline")).toContainText(
      "Eight families a year",
    );

    // The reviews headline overrides the default "From families like yours".
    await expect(
      page.getByTestId("fs-reviews").locator("h2.head"),
    ).toContainText("What sellers say");
  });
});

test.describe("By the numbers — agent track record framing (D1-CONSOLIDATE)", () => {
  test("reads 'My listings' vs 'Market' — never 'This home'", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);
    const stats = page.getByTestId("fs-whyus-stats");
    await expect(stats).toBeVisible();

    // The stats are the agent's record across PAST listings (this home hasn't
    // sold), so no "this home" framing may remain anywhere on the page.
    await expect(page.locator("body")).not.toContainText("This home");
    await expect(stats).toContainText("My listings");
    await expect(stats).toContainText("Market");
  });

  test("ONE big headline (sale-to-list, with the signature track) + a compact supporting row keeps all four figures", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);

    // Headline = the sale-to-list percentage, at the big .cmp scale, with the
    // animated fill track (the one signature punch).
    const headline = page.getByTestId("fs-whyus-bar-0");
    await expect(headline).toBeVisible();
    await expect(headline).toContainText("99.4");
    await expect(headline.locator(".cmp__col--you .cmp__v")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-0-you")).toBeVisible(); // track

    // The remaining three figures move to the compact supporting row — smaller,
    // but every value is kept.
    const sub = page.locator(".fs-page .bynum__sub");
    await expect(sub).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-1")).toContainText("14"); // days on market
    await expect(page.getByTestId("fs-whyus-bigstat-0")).toContainText("1,240"); // views
    await expect(page.getByTestId("fs-whyus-bigstat-1")).toContainText("32"); // homes sold
    // The standalone stats carry NO fabricated market column.
    await expect(page.getByTestId("fs-whyus-bigstat-0")).not.toContainText(
      "Market",
    );
  });
});

test.describe("Pitch routing — split by auto-icon theme (D1-CLEANUP)", () => {
  test("marketing-themed pitch cards land in How-we-market, the rest in Selling points; the photography duplicate drops", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);

    const selling = page.getByTestId("fs-whyus-selling");
    const mkt = page.getByTestId("fs-whyus-mkt-sec");

    // Marketing-themed pitch cards (e.g. the launch card) join "How we market";
    // non-marketing ones (the home's selling points) join "Selling points".
    await expect(
      selling.locator('[data-testid^="fs-whyus-pitch-"]').first(),
    ).toBeVisible();
    await expect(
      mkt.locator('[data-testid^="fs-whyus-pitch-"]').first(),
    ).toBeVisible();

    // The "A photographer the magazines use." pitch card resolves to the SAME
    // camera icon via the SAME keyword ("photo") as the dedicated marketing
    // photography card → it is the duplicate and is dropped, not rendered.
    await expect(page.getByTestId("fs-whyus-pitch-0")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "A photographer the magazines use",
    );

    // "Negotiation handled in person." restates the "Negotiate and close"
    // How-we-work step (same doc icon via "negotiat") → the same point twice, so
    // it drops too.
    await expect(page.getByTestId("fs-whyus-pitch-3")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "Negotiation handled in person",
    );
  });

  test("each surviving pitch point renders once, never in both sections", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);

    // The legacy v1-style standalone pitch grid (its own testid) is still absent.
    await expect(page.getByTestId("fs-pitch")).toHaveCount(0);

    // Every routed pitch card sits in EXACTLY one section — a card routes by its
    // single icon theme, so the same point can never appear in both grids.
    const total = await page
      .locator('[data-testid^="fs-whyus-pitch-"]')
      .count();
    const inSelling = await page
      .getByTestId("fs-whyus-selling")
      .locator('[data-testid^="fs-whyus-pitch-"]')
      .count();
    const inMkt = await page
      .getByTestId("fs-whyus-mkt-sec")
      .locator('[data-testid^="fs-whyus-pitch-"]')
      .count();
    expect(total).toBeGreaterThan(0);
    expect(inSelling + inMkt).toBe(total); // no card double-rendered across sections
  });

  test("How-we-market is capped at 4 cards (visual balance)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);
    const cards = page
      .getByTestId("fs-whyus-mkt-sec")
      .locator(".mcard");
    expect(await cards.count()).toBeLessThanOrEqual(4);
  });
});

test.describe("Why-us — flex (empty whyUs)", () => {
  test("minimal fixture: section absent, page still complete", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_MINIMAL);

    // The flagship root rendered (so this is a real v2 page, not a 404).
    await expect(
      page.getByTestId("seller-presentation-flagship"),
    ).toBeVisible();
    // No why-us chapter, and no orphaned sub-block headers.
    await expect(page.getByTestId("fs-whyus-selling")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-stats")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-mkt-sec")).toHaveCount(0);
    await expect(page.getByTestId("fs-agent-tagline")).toHaveCount(0);
    // The page still reads complete — closing sections present.
    await expect(page.getByTestId("fs-agent")).toBeVisible();
    await expect(page.getByTestId("fs-foot")).toBeVisible();
  });
});

test.describe("Why-us — v1 cohort byte-safety", () => {
  test("an unset/v1 payload never mounts the section or leaks the copy", async ({
    page,
  }) => {
    await page.goto(V1_FULL);

    // No template override + no v2 stamp → the legacy v1 page renders.
    await expect(page.getByTestId("seller-presentation-public")).toBeVisible();
    await expect(
      page.getByTestId("seller-presentation-flagship"),
    ).toHaveCount(0);

    // The why-us chapter is flagship-only — never present on v1.
    await expect(page.getByTestId("fs-whyus-stats")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-selling")).toHaveCount(0);

    // And none of the why-us copy leaks into the v1 DOM (v1 ignores the
    // whyUs / agentTagline / reviewsHeadline payload fields entirely).
    const body = page.locator("body");
    await expect(body).not.toContainText("A few reasons to list with us");
    await expect(body).not.toContainText("Eight families a year");
    await expect(body).not.toContainText("How we work");
  });
});
