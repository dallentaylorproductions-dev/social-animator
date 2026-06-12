import { test, expect, type Page } from "@playwright/test";

/**
 * REVIEW_SOURCE_LOGOS_ENABLED - the flagship review card's compliant source
 * treatment, with a calm scroll-in.
 *
 *   - Zillow: text-only label `on Zillow(R)` top-right of the rating (Zillow's
 *     trademark terms permit text references only, no logo; (R) on first use).
 *   - Google: the official four-color "G" down in the LINK ROW (never beside the
 *     stars, per Google's attribution guidance), with an "as of <Mon YYYY>"
 *     stamp top-right and "on Google" phrasing.
 *
 * Driven via the preview route's `?reviewSourceLogos=1` knob (forces the flag on
 * independent of the server env). The full fixture is Zillow; `full-google`
 * swaps in a Google reviews link.
 */

const FULL = "/seller-presentation-preview?fixture=full&template=flagship";
const ZILLOW_ON = `${FULL}&reviewSourceLogos=1`;
const GOOGLE_ON =
  "/seller-presentation-preview?fixture=full-google&template=flagship&reviewSourceLogos=1";

const opacityOf = (loc: ReturnType<Page["locator"]>) =>
  loc.evaluate((el) => getComputedStyle(el).opacity);

test.describe("Review-source treatment - Zillow (text only)", () => {
  test("flag ON: `on Zillow(R)` top-right, no logo, wordmark suppressed", async ({
    page,
  }) => {
    await page.goto(ZILLOW_ON);

    const note = page.getByTestId("fs-reviews-source-note");
    await expect(note).toHaveAttribute("data-source", "Zillow");
    // Text-only, and the (R) registered mark on the first use of "Zillow".
    await expect(note).toContainText("Zillow®");
    // The note sits in the rating row (the circled top-right slot).
    await expect(
      page.locator(".rev-conf__rating .rev-source-note"),
    ).toHaveCount(1);

    // No logo of any kind for Zillow, and the now-redundant text wordmark is
    // suppressed (the note replaces it).
    await expect(page.getByTestId("fs-reviews-source-g")).toHaveCount(0);
    await expect(page.getByTestId("fs-reviews-logo-slot")).toHaveCount(0);

    // The see-all link still reads "...on Zillow".
    await expect(page.getByTestId("fs-reviews-outlink")).toContainText(
      "Zillow",
    );

    // Calm scroll-in: the note settles to full opacity once the card reveals.
    await page.getByTestId("fs-reviews").scrollIntoViewIfNeeded();
    await expect(async () => {
      expect(await opacityOf(note)).toBe("1");
    }).toPass();
  });

  test("flag OFF: byte-identical - no note, today's text wordmark stays", async ({
    page,
  }) => {
    await page.goto(FULL);

    await expect(page.getByTestId("fs-reviews-source-note")).toHaveCount(0);
    await expect(page.getByTestId("fs-reviews-source-g")).toHaveCount(0);
    const slot = page.getByTestId("fs-reviews-logo-slot");
    await expect(slot).toHaveAttribute("data-source", "Zillow");
    await expect(slot).toContainText("Zillow");
  });

  test("reduced motion: the note appears instantly", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(ZILLOW_ON);
    const note = page.getByTestId("fs-reviews-source-note");
    await expect(async () => {
      expect(await opacityOf(note)).toBe("1");
    }).toPass();
  });
});

test.describe("Review-source treatment - Google (G in the link row)", () => {
  test("flag ON: four-color G in the link row, NOT beside the stars; as-of date", async ({
    page,
  }) => {
    await page.goto(GOOGLE_ON);

    // Top-right note is the as-of date (NOT a logo), for the aggregate rating.
    const note = page.getByTestId("fs-reviews-source-note");
    await expect(note).toHaveAttribute("data-source", "Google");
    await expect(note).toContainText("as of Jun 2026");

    // The official "G" is the canonical Google asset...
    const g = page.getByTestId("fs-reviews-source-g");
    await expect(g).toHaveAttribute("src", /google-g\.svg/);
    // ...placed in the LINK ROW (inside the outlink), never beside the stars.
    await expect(
      page.locator('[data-testid="fs-reviews-outlink"] .rev-source-g'),
    ).toHaveCount(1);
    await expect(page.locator(".rev-conf__rating .rev-source-g")).toHaveCount(0);

    // "on Google" phrasing in both the lead and the see-all line.
    const outlink = page.getByTestId("fs-reviews-outlink");
    await expect(outlink).toContainText("on Google");
    await expect(outlink).toContainText("See all reviews on Google");

    // Calm scroll-in for the G.
    await page.getByTestId("fs-reviews").scrollIntoViewIfNeeded();
    await expect(async () => {
      expect(await opacityOf(g)).toBe("1");
    }).toPass();
  });

  test("missing G asset is graceful: link still renders, decorative img, no broken text", async ({
    page,
  }) => {
    // Abort the asset so it 404s; the decorative img (alt="") collapses to
    // nothing rather than a broken-image glyph, and the link text is intact.
    await page.route("**/google-g.svg", (route) => route.abort());
    await page.goto(GOOGLE_ON);

    const g = page.getByTestId("fs-reviews-source-g");
    await expect(g).toHaveAttribute("alt", "");
    await expect(g).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByTestId("fs-reviews-outlink")).toContainText("Read");
    await expect(page.getByTestId("fs-reviews-outlink")).toContainText(
      "on Google",
    );
  });
});
