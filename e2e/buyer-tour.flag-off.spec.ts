import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief — flag-OFF is byte-identical to "this doesn't exist"
 * (BUYER_TOUR_BRIEF). The e2e webServer does NOT set BUYER_TOUR_BRIEF, so the flag
 * is OFF for the whole suite. The agent builder route and the public tour route
 * must both 404, and the publish/enrich APIs must return feature-disabled.
 *
 * (The /buyer-tour-preview harness is intentionally NOT flag-gated — it renders
 * compiled-in fixtures only and is unlinked, so the interactions spec can exercise
 * the renderer while the real surfaces stay dark. That is asserted to still render
 * in buyer-tour.interactions.spec.ts.)
 */

test.describe("buyer-tour flag OFF", () => {
  test("the agent builder route /buyer-tour 404s", async ({ page }) => {
    const res = await page.goto("/buyer-tour");
    expect(res?.status()).toBe(404);
  });

  test("the public route /tour/<slug> 404s", async ({ page }) => {
    const res = await page.goto("/tour/abcd1234");
    expect(res?.status()).toBe(404);
  });

  test("the publish API returns feature-disabled (503)", async ({ request }) => {
    const res = await request.post("/api/buyer-tour/publish", {
      data: { draft: {} },
    });
    expect(res.status()).toBe(503);
  });

  test("the enrich API returns feature-disabled (503)", async ({ request }) => {
    const res = await request.post("/api/buyer-tour/enrich", {
      data: { homes: [] },
    });
    expect(res.status()).toBe(503);
  });
});
