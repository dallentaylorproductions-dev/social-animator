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

    await expect(page.getByTestId("fs-whyus")).toBeVisible();

    // Differentiators (3 in the fixture).
    for (const i of [0, 1, 2]) {
      await expect(page.getByTestId(`fs-whyus-diff-${i}`)).toBeVisible();
    }

    // Performance: two comparison bars (sale-to-list, days-on-market) + two
    // single big stats (views, homes sold).
    await expect(page.getByTestId("fs-whyus-stats")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-0")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-1")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bigstat-0")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bigstat-1")).toBeVisible();

    // Marketing approach (3 rows).
    for (const i of [0, 1, 2]) {
      await expect(page.getByTestId(`fs-whyus-mkt-${i}`)).toBeVisible();
    }

    // How-we-work (5 steps).
    for (const i of [0, 1, 2, 3, 4]) {
      await expect(page.getByTestId(`fs-whyus-step-${i}`)).toBeVisible();
    }

    // Guarantee.
    await expect(page.getByTestId("fs-whyus-guarantee")).toBeVisible();
  });

  test("reading text stays ink; the bar numeral carries the signature", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_FULL);

    // Body copy (a differentiator) is ink — legibility never rides the accent.
    const diffText = page
      .getByTestId("fs-whyus-diff-0")
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

test.describe("Why-us — flex (empty whyUs)", () => {
  test("minimal fixture: section absent, page still complete", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_MINIMAL);

    // The flagship root rendered (so this is a real v2 page, not a 404).
    await expect(
      page.getByTestId("seller-presentation-flagship"),
    ).toBeVisible();
    // No why-us section, and no orphaned sub-block headers.
    await expect(page.getByTestId("fs-whyus")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-stats")).toHaveCount(0);
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

    // The why-us section is flagship-only — never present on v1.
    await expect(page.getByTestId("fs-whyus")).toHaveCount(0);

    // And none of the why-us copy leaks into the v1 DOM (v1 ignores the
    // whyUs / agentTagline / reviewsHeadline payload fields entirely).
    const body = page.locator("body");
    await expect(body).not.toContainText("A few reasons to list with us");
    await expect(body).not.toContainText("Eight families a year");
    await expect(body).not.toContainText("How we work");
  });
});
