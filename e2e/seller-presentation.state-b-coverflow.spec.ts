import { test, expect } from "@playwright/test";

/**
 * State B (the full presentation) · Zone 5 — exposure coverflow render.
 *
 * State B (the flagship/templateVersion-2 template the real published page and
 * the brand-kit + wizard previews render) previously had NO exposure section at
 * all. It now composes the SAME `CampaignSpread` State A uses, in `coverflow-only`
 * mode — the reach-proof listings coverflow + reach line, placed after the "how
 * we market" story — so "here's the reach your home will get" reads at the close
 * too, not only in the invitation.
 *
 * These drive the compiled-in preview fixtures through the SAME clampPublicPayload
 * boundary as a real publish, so they exercise the read clamp (which now surfaces
 * `recentListings` for a revealed/State-B payload, not just invitations). The
 * VISUAL check (computed opacity, not just DOM presence) guards the exact miss
 * that recurred before: cards present in the DOM but invisible because the
 * `.sa-*` styles weren't loaded/scoped on the flagship root.
 */

// The full State-B payload (v2 → flagship) WITH the sample recent listings.
const WITH_DATA = "/seller-presentation-preview?fixture=full-coverflow";
// The full State-B payload WITHOUT listings — the flex-out / no-data case.
const NO_DATA = "/seller-presentation-preview?fixture=full-v2";

test.describe("State B · Zone 5 — exposure coverflow", () => {
  test("renders the SAME coverflow on the flagship (State-B) template", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(WITH_DATA);

    // It is the real State-B template (the flagship), not v1 or State A.
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();

    const cf = page.getByTestId("fs-sa-cf");
    await cf.scrollIntoViewIfNeeded();
    await expect(cf).toBeVisible();
    // Same copy/voice as State A: the coverflow eyebrow, the headline em, and the
    // exposure reach line.
    await expect(cf).toContainText("Recent listings, real reach");
    await expect(page.getByTestId("fs-sa-spread")).toContainText(
      "Put in front of buyers",
    );
    await expect(page.getByTestId("fs-sa-spread-reach")).toContainText(
      "wherever they are already looking",
    );

    // The hero center card + aggregate render (same data as State A's fixture).
    await expect(page.getByTestId("fs-sa-cf-card-2")).toContainText("41,184");
    await expect(page.getByTestId("fs-sa-cf-aggregate")).toContainText("139,600");
  });

  test("the cards are VISUALLY rendered (styles loaded + reveal fired), not just in the DOM", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(WITH_DATA);

    const cf = page.getByTestId("fs-sa-cf");
    await cf.scrollIntoViewIfNeeded();
    // The reveal island promotes the section to `.in` once it scrolls into view.
    await expect(page.locator(".sa-cf.reveal.in")).toHaveCount(1);
    // Let the .7s reveal fade settle before sampling the computed opacity.
    await page.waitForTimeout(900);

    // Computed opacity is the load-bearing check: a missing stylesheet / wrong
    // scope would leave the card present but invisible. After the reveal settles
    // it must be fully opaque.
    const opacity = await cf.evaluate((el) =>
      parseFloat(getComputedStyle(el).opacity),
    );
    expect(opacity).toBeGreaterThan(0.9);

    // The .sa-* styles ARE applied on the flagship root: the fan stage gets its
    // perspective from `.fs-page .sa-cf__fan` (proves the widened scope reaches
    // FlagshipPage, which carries `.fs-page` but NOT `.state-a`).
    const persp = await page
      .getByTestId("fs-sa-cf")
      .locator(".sa-cf__fan")
      .evaluate((el) => getComputedStyle(el).perspective);
    expect(persp).not.toBe("none");

    // The card itself has real layout size (not collapsed to 0).
    const box = await page.getByTestId("fs-sa-cf-card-2").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(40);
    expect(box!.height).toBeGreaterThan(40);
  });

  test("the aggregate NUMBER settles to opacity 1 (regression: it was stuck at 0 on State B)", async ({
    page,
  }) => {
    // The aggregate `.sa-cf__aggnum` is a `.sa-proof__num`: it poses at opacity:0
    // and releases via `.fs-page .reveal.in .sa-proof__num` when the `.sa-cf`
    // section gets `.in`. That release rule used to be `.fs-page.state-a`-scoped,
    // so on the flagship State-B root it never matched and the number sat as an
    // invisible gap between the "ACROSS RECENT LISTINGS" / "BUYER VIEWS" labels.
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(WITH_DATA);

    const aggnum = page.getByTestId("fs-sa-cf-aggregate").locator(".sa-cf__aggnum");
    await aggnum.scrollIntoViewIfNeeded();
    // The reveal island promotes the coverflow section to `.in`.
    await expect(page.locator(".sa-cf.reveal.in")).toHaveCount(1);
    // Let the .5s number reveal settle before sampling computed opacity.
    await page.waitForTimeout(900);

    const opacity = await aggnum.evaluate((el) =>
      parseFloat(getComputedStyle(el).opacity),
    );
    expect(opacity).toBeGreaterThan(0.9);
    // It still carries the true total (no fabrication / alteration).
    await expect(aggnum).toContainText("139,600");
  });

  test("coverflow-only: State B shows NO capability frames (no duplication of its 'how we market')", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(WITH_DATA);
    await page.getByTestId("fs-sa-cf").scrollIntoViewIfNeeded();
    // The reach-proof section renders, but the capability photo/video frames
    // (State A's spread) are intentionally absent on State B.
    await expect(page.getByTestId("fs-sa-spread")).toBeVisible();
    await expect(page.getByTestId("fs-sa-spread-photo")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-spread-video")).toHaveCount(0);
  });

  test("honesty: no listings ⇒ the whole exposure zone flexes out (no empty band)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(NO_DATA);
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();
    // No coverflow AND no exposure section at all — byte-identical to a flag-off
    // / no-data State-B page (never a fabricated number or empty band).
    await expect(page.getByTestId("fs-sa-cf")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-spread")).toHaveCount(0);
  });
});
