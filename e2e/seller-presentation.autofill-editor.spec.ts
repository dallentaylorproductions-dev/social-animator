import { test, expect, type Page } from "@playwright/test";

/**
 * Seller Presentation - Phase 2 (SP-AUTOFILL): the "type the address once"
 * build, browser-level.
 *
 * The SELLER_STATE_A flag is OFF by default in the test env, so each test mocks
 * /api/entitlements/me to turn it on (same shape the route returns). The
 * cost-bearing RentCast route is MOCKED (no live billing in CI). Covers:
 *   1. Setting the subject address in invitation mode triggers autofill on blur;
 *      the calm status appears and the subject* details populate.
 *   2. The nearby-sales step is now a REVIEW step: the auto-pulled sales arrive
 *      as cards (street name shown, NO price), the agent removes one, and the
 *      manual-add fallback still works.
 *   3. Autofill does NOT fire in the full presentation (invitation-only).
 */

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
    compPhotosEnabled: true,
    sellerPagesLibraryEnabled: false,
    reviewSourceLogosEnabled: false,
    sellerStateAEnabled: true,
  },
};

const AUTOFILL_BODY = {
  ok: true,
  property: { bedrooms: "3", baths: "2.5", sqft: "2,140", yearBuilt: "1998" },
  comps: [
    { address: "742 N Cedar St, Tacoma, WA 98406", soldPrice: "$685,000", source: "imported" },
    { address: "1120 S Ainsworth Ave, Tacoma, WA 98405", soldPrice: "$640,000", source: "imported" },
  ],
  source: { property: "live", comps: "live" },
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

/** Mock the cost-bearing RentCast autofill route; records how many times it was
 *  hit so we can prove blur (not keystroke) drives it. */
function mockAutofill(page: Page): { calls: () => number } {
  let calls = 0;
  void page.route("**/api/seller-presentation/autofill", (route) => {
    calls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTOFILL_BODY),
    });
  });
  return { calls: () => calls };
}

async function fillAddress(page: Page) {
  await page.getByTestId("step-property-address").fill("4011 N 33rd St");
  await page.getByTestId("step-property-city").fill("Tacoma");
  await page.getByTestId("step-property-state").fill("WA");
  await page.getByTestId("step-property-zip").fill("98407");
  // Blur the last field so the build fires with every field present.
  await page.getByTestId("step-property-zip").blur();
}

test.describe("SP-AUTOFILL editor - the address builds the invitation", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("invitation mode: address blur pulls property details + nearby sales (review, not typing)", async ({
    page,
  }) => {
    await enableStateA(page);
    const autofill = mockAutofill(page);
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Switch to the prepared invitation (autofill is invitation-only).
    await page.getByTestId("step-property-mode-invitation").click();

    await fillAddress(page);

    // The calm status confirms the build, then resolves to the "found N sales"
    // line. The route was hit (blur-driven).
    await expect(page.getByTestId("step-property-autofill-status")).toContainText(
      /recent sale/i,
    );
    expect(autofill.calls()).toBeGreaterThanOrEqual(1);

    // Subject details populated (open the reach to read them back).
    await page.getByTestId("step-property-subject-toggle").click();
    await expect(page.getByTestId("step-property-subject-bedrooms")).toHaveValue(
      "3",
    );
    await expect(page.getByTestId("step-property-subject-baths")).toHaveValue(
      "2.5",
    );
    await expect(page.getByTestId("step-property-subject-year-built")).toHaveValue(
      "1998",
    );
    // sqft is a NumberInput (aria-label, not a testid); it live-formats "2,140".
    await expect(page.getByLabel("subject-sqft")).toHaveValue("2,140");

    // The nearby-sales step is now a REVIEW step: the sales are already there.
    await page.getByTestId("rail-step-comps").click();
    await expect(page.getByTestId("step-nearby-sales")).toBeVisible();
    const list = page.getByTestId("step-nearby-sales-list");
    await expect(list).toBeVisible();
    await expect(page.getByTestId("step-nearby-sales-card-0")).toContainText(
      "742 N Cedar St",
    );
    await expect(page.getByTestId("step-nearby-sales-card-1")).toContainText(
      "1120 S Ainsworth Ave",
    );
    // Street name only - no price in the invitation review.
    await expect(list).not.toContainText("$685,000");
    await expect(list).not.toContainText("$640,000");

    // No Street View coverage resolves in the test env (no browser key), so the
    // cards show the neutral placeholder, never a blank frame.
    await expect(
      page.getByTestId("step-nearby-sales-placeholder-0"),
    ).toBeVisible();

    // The optional "add / replace photo" reach opens the camera-roll uploader so
    // an agent can supply a photo for a comp that lacks Street View.
    await page.getByTestId("step-nearby-sales-photo-toggle-0").click();
    await expect(
      page.getByTestId("step-nearby-sales-photo-0-upload"),
    ).toBeVisible();
    // Close the panel again before the trim flow below.
    await page.getByTestId("step-nearby-sales-photo-toggle-0").click();
    await expect(
      page.getByTestId("step-nearby-sales-photo-0-upload"),
    ).toHaveCount(0);

    // Remove one - it is a review/trim step.
    await page.getByTestId("step-nearby-sales-remove-0").click();
    await expect(page.getByTestId("step-nearby-sales-card-1")).toHaveCount(0);
    await expect(page.getByTestId("step-nearby-sales-card-0")).toContainText(
      "1120 S Ainsworth Ave",
    );

    // The manual-add fallback still works.
    await page.getByTestId("step-nearby-sales-add").fill("900 N Anderson St");
    await page.getByTestId("step-nearby-sales-add").blur();
    await expect(page.getByTestId("step-nearby-sales-card-1")).toContainText(
      "900 N Anderson St",
    );
  });

  test("full presentation: setting the address does NOT trigger autofill", async ({
    page,
  }) => {
    await enableStateA(page);
    const autofill = mockAutofill(page);
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Default is the full presentation. Fill the address; no build should fire.
    await fillAddress(page);

    await expect(page.getByTestId("step-property-autofill-status")).toHaveCount(0);
    expect(autofill.calls()).toBe(0);
  });
});
