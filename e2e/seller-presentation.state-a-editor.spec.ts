import { test, expect, type Page } from "@playwright/test";

/**
 * Seller State A — the two-stage EDITOR (Phase 1 clarity).
 *
 * Browser-level proof of the lean invitation flow on top of the merged State A
 * machine. The SELLER_STATE_A flag is OFF by default in the test env, so each
 * test mocks /api/entitlements/me to turn it on client-side (the same shape the
 * route returns). Covers:
 *   1. Picking "Prepared invitation" collapses the stepper to the lean set
 *      (Strategy + Pitch hidden), hides List Price, and the live preview shows
 *      the State A dossier (no subject price) — never the full presentation.
 *   2. Switching to "Full presentation" restores all six steps + the full
 *      flagship preview, and brings List Price back.
 *   3. The lean nearby-sales step is address-only (the full comps step is not
 *      rendered), and the "Complete the full presentation" path evolves the SAME
 *      draft into Stage 2 (revealing the full steps).
 */

// A minimal valid /api/entitlements/me body with the State A flag ON.
const ENTITLEMENTS_STATE_A_ON = {
  ok: true,
  accessMode: "full",
  tier: "pro",
  suppressUpgradeUi: false,
  aiAccess: { state: "available", label: "" },
  themeAccess: { state: "available", label: "" },
  coreAccess: { state: "available", label: "" },
  features: {
    compImportEnabled: false,
    areaChartRentcastEnabled: false,
    compPhotosEnabled: false,
    sellerPagesLibraryEnabled: false,
    reviewSourceLogosEnabled: false,
    sellerStateAEnabled: true,
  },
};

async function enableStateA(page: Page) {
  await page.route("**/api/entitlements/me*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ENTITLEMENTS_STATE_A_ON),
    }),
  );
}

test.describe("Seller State A editor — lean invitation flow", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("invitation mode → lean stepper, List Price hidden, dossier preview (no price)", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // The page-type toggle is present (flag on) and defaults to the full
    // presentation: all six steps, List Price visible.
    await expect(page.getByTestId("step-property-state-a")).toBeVisible();
    await expect(page.locator(".rail-item")).toHaveCount(6);
    await expect(page.getByLabel("list-price")).toBeVisible();

    // Pick the prepared invitation.
    await page.getByTestId("step-property-mode-invitation").click();

    // Stepper collapses to the lean set — Strategy + Pitch are gone.
    await expect(page.locator(".rail-item")).toHaveCount(4);
    await expect(page.getByTestId("rail-step-strategy")).toHaveCount(0);
    await expect(page.getByTestId("rail-step-pitch")).toHaveCount(0);
    await expect(page.getByTestId("rail-step-comps")).toContainText(
      "Nearby sales",
    );

    // List Price is hidden; the appointment field appears.
    await expect(page.getByLabel("list-price")).toHaveCount(0);
    await expect(
      page.getByTestId("step-property-appointment-field"),
    ).toBeVisible();

    // The live preview shows the State A dossier (no subject price), NOT the
    // full presentation.
    const dock = page.getByTestId("wizard-preview-dock");
    await expect(dock.getByTestId("seller-presentation-state-a")).toBeVisible();
    await expect(dock.getByTestId("seller-presentation-flagship")).toHaveCount(
      0,
    );
    await expect(dock.locator(".price__single")).toHaveCount(0);
  });

  test("switching back to Full restores all six steps + the full preview", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    await page.getByTestId("step-property-mode-invitation").click();
    await expect(page.locator(".rail-item")).toHaveCount(4);

    await page.getByTestId("step-property-mode-full").click();

    // Full presentation is unchanged: six steps, List Price back, full preview.
    await expect(page.locator(".rail-item")).toHaveCount(6);
    await expect(page.getByTestId("rail-step-strategy")).toBeVisible();
    await expect(page.getByTestId("rail-step-pitch")).toBeVisible();
    await expect(page.getByLabel("list-price")).toBeVisible();

    const dock = page.getByTestId("wizard-preview-dock");
    await expect(dock.getByTestId("seller-presentation-flagship")).toBeVisible();
    await expect(dock.getByTestId("seller-presentation-state-a")).toHaveCount(0);
  });

  test("lean nearby-sales is address-only; Complete-the-full-presentation evolves the same draft", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Invitation mode + a complete property (address assigns a property id).
    await page.getByTestId("step-property-mode-invitation").click();
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma");
    await page.getByTestId("step-property-state").fill("WA");
    await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();

    // Next → the LEAN nearby-sales step (not the full comps step).
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-nearby-sales")).toBeVisible();
    await expect(page.getByTestId("step-comps")).toHaveCount(0);

    // Phase 2: the nearby-sales step is a REVIEW step. With no autofill mocked
    // here the auto-pull no-ops, so the manual-add fallback seeds a sale by hand
    // (address only, no sold-price field). The full comps step is not rendered.
    await page.getByTestId("step-nearby-sales-add").fill("742 N Cedar St");
    await page.getByTestId("step-nearby-sales-add").blur();
    await expect(page.getByTestId("step-nearby-sales-card-0")).toContainText(
      "742 N Cedar St",
    );
    await expect(page.getByLabel("comp-add-sold-price")).toHaveCount(0);

    // Next → Area & video, Next → Review & send.
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-editorial")).toBeVisible();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-review")).toBeVisible();

    // The A→B evolve affordance is on the invitation's final step.
    const cta = page.getByTestId("wizard-complete-full");
    await expect(cta).toBeVisible();
    await page.getByTestId("wizard-complete-full-btn").click();

    // Same draft, now the full presentation: six steps, landed on the full
    // comps step (with its sold-price field).
    await expect(page.locator(".rail-item")).toHaveCount(6);
    await expect(page.getByTestId("step-comps")).toBeVisible();
    await expect(page.getByTestId("rail-step-strategy")).toBeVisible();
  });

  test("invitation Review step is lean and invitation-voiced (no price residue)", async ({
    page,
  }) => {
    await enableStateA(page);
    // Return a stable slug so the publish action reaches the published state
    // where the sample send-text renders.
    await page.route("**/api/seller-presentation/publish*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, slug: "testslug" }),
      }),
    );
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Invitation mode + a complete, publishable invitation (address + the
    // dated appointment the invitation gate requires).
    await page.getByTestId("step-property-mode-invitation").click();
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma");
    await page.getByTestId("step-property-state").fill("WA");
    await page
      .getByTestId("step-property-appointment")
      .fill("2099-01-01T13:00");
    await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();

    // Walk the lean flow to Review & send (Nearby sales → Area & video → Review).
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-nearby-sales")).toBeVisible();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-editorial")).toBeVisible();
    // Area & video step is invitation-voiced, not "Editorial extras".
    await expect(page.getByTestId("step-editorial")).toContainText(
      "Area and video",
    );
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("step-review")).toBeVisible();

    // The Review summary drops every price-residue row (those belong to the
    // full presentation and would read "—" here, re-surfacing a price the
    // invitation withholds). Only invitation-relevant rows remain.
    const summary = page.getByTestId("step-review-summary");
    await expect(summary).not.toContainText("Recommended price");
    await expect(summary).not.toContainText("Price rationale");
    await expect(summary).not.toContainText("Pricing strategy");
    await expect(summary).not.toContainText("Confidence");
    await expect(summary).not.toContainText("Pitch points");
    await expect(summary).toContainText("Appointment");

    // Invitation-voiced status + publish verb.
    await expect(page.getByTestId("step-review-ready")).toContainText(
      "Ready to send",
    );
    await expect(page.getByTestId("step-review-publish")).toContainText(
      "Publish invitation",
    );

    // Publish → the sample send-text frames a pre-appointment look and never
    // mentions pricing or a dollar figure.
    await page.getByTestId("step-review-publish").click();
    const sample = page.getByTestId("step-review-sample-text");
    await expect(sample).toBeVisible();
    await expect(sample).toContainText("ahead of our appointment");
    await expect(sample).not.toContainText("pricing");
    await expect(sample).not.toContainText("$");
  });
});
