import { test, expect, type Page } from "@playwright/test";

/**
 * Seller State A · Zone 5 — the Settings "recent listings" editor.
 *
 * Browser proof of the agent-facing input that feeds the exposure coverflow:
 * add / edit / remove up to the cap, the OPTIONAL view count (honesty: blank is
 * a real state), and localStorage persistence across a reload. The section
 * lives inside the State-A-gated "prepared invitation" block, so each test
 * mocks /api/entitlements/me to turn the flag on (the same shape the route
 * returns). The photo here uses the paste-URL affordance so the test stays
 * deterministic (the camera-roll upload is the shared ImageUploadField's own
 * tested path); the projection seam is proven in the .projection spec.
 */

const STORAGE_KEY = "socanim_brand_settings";

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

// Read the stored recentListings out of localStorage.
async function storedListings(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return (JSON.parse(raw) as { recentListings?: unknown }).recentListings;
  }, STORAGE_KEY);
}

test.describe("Settings — recent listings editor", () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  test("add a listing with a view count → persists; reload restores it", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/settings");

    const section = page.getByTestId("brand-recent-listings");
    await expect(section).toBeVisible();
    // Empty by default — the coverflow flexes in, so nothing here is required.
    await expect(page.getByTestId("brand-listing-empty")).toBeVisible();

    await page.getByTestId("brand-listing-add").click();
    await page.getByTestId("brand-listing-address-0").fill("1240 Hawthorne St");
    await page.getByTestId("brand-listing-city-0").fill("Tacoma");
    const views = page.getByLabel("brand-listing-views-0");
    await views.fill("41184");
    await views.blur();

    // Persisted to localStorage with the formatted view-count string.
    await expect
      .poll(async () => {
        const listings = (await storedListings(page)) as
          | Array<Record<string, unknown>>
          | undefined;
        return listings?.[0];
      })
      .toMatchObject({
        address: "1240 Hawthorne St",
        city: "Tacoma",
        viewCount: "41,184",
      });

    // Reload → the editor restores from localStorage.
    await page.reload();
    await expect(page.getByTestId("brand-listing-address-0")).toHaveValue(
      "1240 Hawthorne St",
    );
    await expect(page.getByTestId("brand-listing-city-0")).toHaveValue("Tacoma");
    await expect(page.getByLabel("brand-listing-views-0")).toHaveValue("41,184");
  });

  test("a listing with no view count persists numberless (honesty)", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/settings");

    await page.getByTestId("brand-listing-add").click();
    await page.getByTestId("brand-listing-address-0").fill("55 Quiet Ln");
    await page.getByTestId("brand-listing-city-0").fill("Gig Harbor");

    await expect
      .poll(async () => {
        const listings = (await storedListings(page)) as
          | Array<Record<string, unknown>>
          | undefined;
        return listings?.[0];
      })
      .toMatchObject({ address: "55 Quiet Ln", city: "Gig Harbor" });

    const first = (await storedListings(page)) as Array<Record<string, unknown>>;
    expect(first[0].viewCount).toBeUndefined();
  });

  test("remove the last listing → recentListings clears (capability-cards-only)", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/settings");

    await page.getByTestId("brand-listing-add").click();
    await page.getByTestId("brand-listing-address-0").fill("1 Gone Ave");
    await expect
      .poll(async () => {
        const listings = (await storedListings(page)) as unknown[] | undefined;
        return listings?.length ?? 0;
      })
      .toBe(1);

    await page.getByTestId("brand-listing-remove-0").click();
    await expect(page.getByTestId("brand-listing-empty")).toBeVisible();
    // No empty husk: the key is cleared to undefined so "no listings" is one state.
    await expect.poll(async () => storedListings(page)).toBeUndefined();
  });

  test("capped at the maximum: the Add button gives way to a calm nudge", async ({
    page,
  }) => {
    await enableStateA(page);
    await page.goto("/settings");

    // Add up to the cap.
    for (let i = 0; i < 5; i++) {
      await page.getByTestId("brand-listing-add").click();
      await page.getByTestId(`brand-listing-address-${i}`).fill(`${i} Cap St`);
    }
    await expect(page.getByTestId("brand-listing-row-4")).toBeVisible();
    // Add is gone, the nudge is shown — no sixth row.
    await expect(page.getByTestId("brand-listing-add")).toHaveCount(0);
    await expect(page.getByTestId("brand-listing-cap-nudge")).toBeVisible();
  });
});
