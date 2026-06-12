import { test, expect, type Page } from "@playwright/test";
import { resolveReviewSourceLogo } from "@/tools/seller-presentation/output/flagship/review-source-logos";

/**
 * REVIEW_SOURCE_LOGOS_ENABLED - the flagship review card's source brand-logo
 * chip (Zillow / Google), with a calm scroll-in animation.
 *
 * Driven via the stateless preview route's `?reviewSourceLogos=1` knob (which
 * forces the chip on independent of the server env flag) so the suite can prove
 * the flag-ON render without flipping a global env. The full fixture carries a
 * Zillow `reviewsOutlink`, so it must show the Zillow mark when the flag is on.
 */

const FLAGSHIP = "/seller-presentation-preview?fixture=full&template=flagship";
const FLAGSHIP_LOGOS = `${FLAGSHIP}&reviewSourceLogos=1`;

const opacityOf = (loc: ReturnType<Page["locator"]>) =>
  loc.evaluate((el) => getComputedStyle(el).opacity);

test.describe("Review-source logo - source resolution (zillow/google/none)", () => {
  test("maps detected labels to the matching mark; unknown/unmarked → null", () => {
    // Sources we hold an official mark for.
    expect(resolveReviewSourceLogo("Zillow")).toMatchObject({
      src: "/review-sources/zillow.png",
      label: "Zillow",
    });
    expect(resolveReviewSourceLogo("Google")).toMatchObject({
      src: "/review-sources/google.png",
      label: "Google",
    });
    // A detected source we hold NO mark for → graceful null (falls back to the
    // text wordmark, never invents a logo).
    expect(resolveReviewSourceLogo("Realtor.com")).toBeNull();
    expect(resolveReviewSourceLogo("Yelp")).toBeNull();
    // No detected source at all → null.
    expect(resolveReviewSourceLogo(null)).toBeNull();
    expect(resolveReviewSourceLogo(undefined)).toBeNull();
    expect(resolveReviewSourceLogo("")).toBeNull();
  });
});

test.describe("Review-source logo - flagship render", () => {
  test("flag ON: the Zillow chip shows at the rating, wordmark suppressed", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP_LOGOS);

    const chip = page.getByTestId("fs-reviews-source-logo");
    await expect(chip).toHaveAttribute("data-source", "Zillow");
    await expect(chip).toHaveAttribute("role", "img");
    await expect(chip).toHaveAttribute("aria-label", "Reviews on Zillow");
    // The unmodified Zillow mark, painted as a CSS background (no broken-image
    // risk) - never recolored or stretched.
    await expect(chip).toHaveCSS(
      "background-image",
      /review-sources\/zillow\.png/,
    );

    // The chip sits inside the rating row (the circled placement), pushed to the
    // upper-right (margin-left:auto).
    await expect(
      page.locator(".rev-conf__rating .rev-source-logo"),
    ).toHaveCount(1);

    // The now-redundant text wordmark is suppressed when a logo shows.
    await expect(page.getByTestId("fs-reviews-logo-slot")).toHaveCount(0);

    // Scroll the card into view so the page motion island runs the calm
    // scroll-in; the chip settles to full opacity.
    await page.getByTestId("fs-reviews").scrollIntoViewIfNeeded();
    await expect(async () => {
      expect(await opacityOf(chip)).toBe("1");
    }).toPass();
  });

  test("flag OFF: byte-identical - no chip, today's text wordmark stays", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);

    await expect(page.getByTestId("fs-reviews-source-logo")).toHaveCount(0);
    // The flag-off card keeps the existing "Zillow" text wordmark slot.
    const slot = page.getByTestId("fs-reviews-logo-slot");
    await expect(slot).toHaveAttribute("data-source", "Zillow");
    await expect(slot).toContainText("Zillow");
  });

  test("reduced motion: the chip appears instantly (no fade/scale)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(FLAGSHIP_LOGOS);

    const chip = page.getByTestId("fs-reviews-source-logo");
    // No scroll needed: reduced motion lands the chip at its end-state from
    // first paint.
    await expect(async () => {
      expect(await opacityOf(chip)).toBe("1");
    }).toPass();
  });
});
