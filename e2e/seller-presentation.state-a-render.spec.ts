import { test, expect } from "@playwright/test";

/**
 * Seller State A — the prepared invitation, rendered (browser).
 *
 * Driven through the stateless preview route's State A fixtures (the same render
 * path /h/<slug> takes for an invitation-status payload). Proves the REFINED
 * five-section dossier renders, carries NO subject price / lock / countdown, and
 * that every evidence artifact + supporting block flexes out cleanly when its
 * backing data is absent. Refined shape:
 *   1. Map-dossier hero  (address + appointment chip + agent + signature + video)
 *   2. Appointment Brief (nearby sales / neighborhood activity / launch strategy)
 *   3. Valuation being prepared (pending pill + context line + credibility stat)
 *      + a small testimonial strip
 *   4. Campaign spread (produced assets + reach line)
 *   5. Meeting close (3 steps + advocacy) + the one action (confirm our time)
 */

const STATE_A = "/seller-presentation-preview?fixture=state-a";
const STATE_A_MIN = "/seller-presentation-preview?fixture=state-a-minimal";

test.describe("State A — the prepared dossier renders (rich fixture)", () => {
  test("dispatches to the State A template (not flagship, not v1)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("seller-presentation-state-a")).toBeVisible();
    await expect(page.getByTestId("seller-presentation-flagship")).toHaveCount(0);
    await expect(page.getByTestId("seller-presentation-public")).toHaveCount(0);
  });

  test("1 · map-dossier hero — address, appointment chip, agent, signature, video", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-hero")).toBeVisible();
    await expect(page.getByTestId("fs-sa-hero-pers")).toContainText(
      "Prepared privately",
    );
    // The named, dated appointment moment reads as a chip.
    const chip = page.getByTestId("fs-sa-hero-appt");
    await expect(chip).toContainText("June 20");
    await expect(chip).toContainText("2:00 PM");
    // Agent presence + the quiet signature line + the folded-in hello.
    await expect(page.getByTestId("fs-sa-hero-agent")).toContainText(
      "Marisol Reyes",
    );
    await expect(page.getByTestId("fs-sa-hero-signature")).toContainText(
      "Known for",
    );
    await expect(page.getByTestId("fs-sa-hero-video")).toBeVisible();
  });

  test("2 · Appointment Brief — file + three backed evidence artifacts", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const brief = page.getByTestId("fs-sa-brief");
    await expect(brief).toBeVisible();
    await expect(brief).toContainText("Appointment Brief");
    // All three artifacts are backed by the rich fixture's data.
    await expect(page.getByTestId("fs-sa-brief-nearby")).toBeVisible();
    await expect(page.getByTestId("fs-sa-brief-activity")).toBeVisible();
    await expect(page.getByTestId("fs-sa-brief-spark")).toBeVisible();
    await expect(page.getByTestId("fs-sa-brief-launch")).toBeVisible();
    // The four nearby-sold mini cards render, each a SOLD evidence tile.
    await expect(page.getByTestId("fs-sa-brief-sale-0")).toBeVisible();
    await expect(page.getByTestId("fs-sa-brief-sale-3")).toBeVisible();
    // The brief's nearby cards carry NO prices (that analysis is State B).
    await expect(page.getByTestId("fs-sa-brief-nearby")).not.toContainText("$");
  });

  test("3 · valuation being prepared — pending pill, context line, credibility stat, testimonial strip", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-valuation-label")).toContainText(
      "Prepared estimate",
    );
    // Neighborhood context beneath the pill is nearby-sold data, not the subject.
    await expect(page.getByTestId("fs-sa-valuation-context")).toContainText(
      "Homes near you recently sold between",
    );
    // One woven credibility figure (track record, not this home).
    await expect(page.getByTestId("fs-sa-valuation-proof")).toBeVisible();
    // Social proof collapsed to a small strip with the source mark.
    const strip = page.getByTestId("fs-sa-testimonial");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Zillow");
  });

  test("4 · campaign spread — produced assets + reach line", async ({ page }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-spread")).toBeVisible();
    // The listing photo leads; marketing-plan assets follow.
    await expect(page.getByTestId("fs-sa-spread-listing")).toBeVisible();
    await expect(page.getByTestId("fs-sa-spread-reach")).toContainText(
      "Seen across search portals",
    );
  });

  test("5 · meeting close — three steps, advocacy line, one action", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-meeting")).toBeVisible();
    for (const id of ["fs-sa-step-0", "fs-sa-step-1", "fs-sa-step-2"]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expect(page.getByTestId("fs-sa-advocacy")).toContainText(
      "the details buyers remember",
    );
    await expect(page.getByTestId("fs-sa-confirm-cta")).toBeVisible();
    await expect(page.getByTestId("fs-sa-confirm-email")).toBeVisible();
  });

  test("NO subject price, NO lock, NO countdown, NO recommended marker anywhere", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    // The full-presentation price moments are never composed in State A.
    await expect(page.getByTestId("fs-price")).toHaveCount(0);
    await expect(page.getByTestId("sep-price-panel")).toHaveCount(0);
    // The standalone area chart (with its recommended overlay) is gone; the
    // neighborhood trend lives in the brief sparkline, no price marker.
    await expect(page.getByTestId("fs-area")).toHaveCount(0);
    const body = page.locator("body");
    for (const banned of [
      "Recommended list",
      "Recommended $",
      "unlock",
      "Unlock",
      "countdown",
      "Countdown",
      "locked",
    ]) {
      await expect(body, banned).not.toContainText(banned);
    }
  });
});

test.describe("State A — flex-out (minimal invitation reads complete)", () => {
  test("brief / spread / testimonial / area-context flex out; the page still reads complete", async ({
    page,
  }) => {
    await page.goto(STATE_A_MIN);
    await expect(page.getByTestId("seller-presentation-state-a")).toBeVisible();

    // Present + complete with little data: hero, valuation, meeting, action.
    await expect(page.getByTestId("fs-hero")).toBeVisible();
    await expect(page.getByTestId("fs-sa-valuation")).toBeVisible();
    await expect(page.getByTestId("fs-sa-meeting")).toBeVisible();
    await expect(page.getByTestId("fs-sa-confirm-cta")).toBeVisible();

    // No backing data → every evidence artifact + supporting block flexes out
    // (no hollow file, no empty frames, no orphan strip).
    await expect(page.getByTestId("fs-sa-brief")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-spread")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-testimonial")).toHaveCount(0);

    // With no comps / track record, the valuation omits the nearby-sold context
    // and the credibility figure, but still reads complete.
    await expect(page.getByTestId("fs-sa-valuation-context")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-valuation-proof")).toHaveCount(0);
    // No signature line set on the minimal fixture → it flexes out of the hero.
    await expect(page.getByTestId("fs-sa-hero-signature")).toHaveCount(0);
  });
});
