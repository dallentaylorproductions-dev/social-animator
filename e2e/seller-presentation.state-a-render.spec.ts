import { test, expect } from "@playwright/test";

/**
 * Seller State A — the prepared invitation, rendered (browser).
 *
 * Driven through the stateless preview route's State A fixtures (the same render
 * path /h/<slug> takes for an invitation-status payload). Proves the page reads
 * as honest PREPARATION, carries NO subject price / lock / countdown, and that
 * every proof item + optional block flexes out cleanly when its data is absent.
 */

const STATE_A = "/seller-presentation-preview?fixture=state-a";
const STATE_A_MIN = "/seller-presentation-preview?fixture=state-a-minimal";

test.describe("State A — the prepared invitation renders", () => {
  test("dispatches to the State A template (not flagship, not v1)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("seller-presentation-state-a")).toBeVisible();
    // Neither the full-presentation root renders under an invitation status.
    await expect(page.getByTestId("seller-presentation-flagship")).toHaveCount(0);
    await expect(page.getByTestId("seller-presentation-public")).toHaveCount(0);
  });

  test("the day-one invitation blocks render", async ({ page }) => {
    await page.goto(STATE_A);
    // 1 hero (prepared for + address), 2 appointment, 3 welcome, 4 proof,
    // 5 what-we-confirm, 6 neighborhood, 7 valuation, 9 reviews, 10 action.
    for (const id of [
      "fs-hero",
      "fs-sa-appointment",
      "fs-note",
      "fs-sa-proof",
      "fs-sa-confirm",
      "fs-area",
      "fs-sa-valuation",
      "fs-reviews",
      "fs-sa-confirm-cta",
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    // The named, dated moment is shown verbatim.
    await expect(page.getByTestId("fs-sa-appointment-when")).toContainText(
      "Saturday, June 20 at 2:00 PM",
    );
    // The valuation reads as being prepared, with the honest pending label.
    await expect(page.getByTestId("fs-sa-valuation-label")).toContainText(
      "Prepared estimate",
    );
    // Nearby sold context is neighborhood data, never the subject's price.
    await expect(page.getByTestId("fs-sa-valuation-body")).toContainText(
      "Nearby homes recently sold between",
    );
  });

  test("NO subject price, NO lock, NO countdown anywhere", async ({ page }) => {
    await page.goto(STATE_A);
    // The full-presentation price moments are never composed in State A.
    await expect(page.getByTestId("fs-price")).toHaveCount(0);
    await expect(page.getByTestId("sep-price-panel")).toHaveCount(0);
    // The neighborhood chart carries no "Recommended" subject-price overlay.
    const area = page.getByTestId("fs-area");
    await expect(area).not.toContainText("Recommended");
    // No restriction language anywhere on the page (preparation, not a lock).
    const body = page.locator("body");
    for (const banned of [
      "Recommended list",
      "unlock",
      "Unlock",
      "countdown",
      "Countdown",
      "locked",
    ]) {
      await expect(body, banned).not.toContainText(banned);
    }
  });

  test("the proof items are real (no hollow checkmarks) — each maps to data", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const proof = page.getByTestId("fs-sa-proof");
    await expect(proof).toBeVisible();
    // The rich fixture has comps, area, whyUs, reviews → every proof item backs
    // real data.
    for (const id of [
      "fs-sa-proof-nearby-sales",
      "fs-sa-proof-neighborhood",
      "fs-sa-proof-marketing",
      "fs-sa-proof-track-record",
      "fs-sa-proof-reviews",
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
  });
});

test.describe("State A — flex-out (minimal invitation reads complete)", () => {
  test("proof + neighborhood + why-us + reviews flex out; no hollow blocks", async ({
    page,
  }) => {
    await page.goto(STATE_A_MIN);
    await expect(page.getByTestId("seller-presentation-state-a")).toBeVisible();

    // Present + complete with little data:
    await expect(page.getByTestId("fs-sa-appointment")).toBeVisible();
    await expect(page.getByTestId("fs-sa-confirm")).toBeVisible();
    await expect(page.getByTestId("fs-sa-valuation")).toBeVisible();
    await expect(page.getByTestId("fs-sa-confirm-cta")).toBeVisible();

    // No backing data → the whole proof block flexes out (NOT an empty block
    // with hollow checkmarks).
    await expect(page.getByTestId("fs-sa-proof")).toHaveCount(0);
    // No area / reviews / why-us data → those flex out too.
    await expect(page.getByTestId("fs-area")).toHaveCount(0);
    await expect(page.getByTestId("fs-reviews")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-stats")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-selling")).toHaveCount(0);

    // With no comps, the valuation omits the nearby-sold sentence (no price at
    // all), but still reads complete.
    await expect(page.getByTestId("fs-sa-valuation-body")).not.toContainText(
      "Nearby homes recently sold",
    );
  });
});
