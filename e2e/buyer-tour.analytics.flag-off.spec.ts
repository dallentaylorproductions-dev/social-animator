import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief engagement — flag-OFF is a no-op (BUYER_TOUR_ANALYTICS).
 *
 * The e2e webServer does NOT set BUYER_TOUR_ANALYTICS, so analytics is OFF for the
 * whole suite. With the flag off:
 *   • the track endpoint records nothing (POST → 204 disabled) and refuses the readout
 *     (GET → 503 disabled), with no KV touch;
 *   • the buyer page (exercised via the fixtures-only preview WITHOUT ?analytics=1)
 *     fires ZERO track beacons — byte-identical to today.
 *
 * The flag-ON behavior is proven separately in buyer-tour.analytics.spec.ts via the
 * preview's `?analytics=1` override (client behavior is independent of the server flag,
 * which stays off in the suite).
 */

const TRACK = "/api/buyer-tour/track";

test.describe("buyer-tour analytics flag OFF", () => {
  test("POST /track is disabled (204, no work)", async ({ request }) => {
    const res = await request.post(TRACK, {
      data: {
        tourSlug: "prev1234",
        event: "tour_opened",
        sessionId: "12345678-1234-4123-8123-1234567890ab",
        ts: 1720000000000,
      },
    });
    expect(res.status()).toBe(204);
  });

  test("GET /track (readout) is disabled (503)", async ({ request }) => {
    const res = await request.get(`${TRACK}?slug=prev1234`);
    expect(res.status()).toBe(503);
  });

  test("the preview page fires NO track beacons when analytics is off", async ({ page }) => {
    const trackCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(TRACK)) trackCalls.push(req.url());
    });

    await page.goto("/buyer-tour-preview?fixture=full&v1=1");
    await expect(page.getByTestId("buyer-tour-page")).toBeVisible();
    // Scroll the whole page + open an expander — none of it should emit a beacon.
    await page.getByTestId("btb-expander-btn-A").scrollIntoViewIfNeeded();
    await page.getByTestId("btb-expander-btn-A").click();
    await page.getByTestId("btb-agent").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    expect(trackCalls).toHaveLength(0);
  });
});
