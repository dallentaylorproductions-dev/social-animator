import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief engagement — flag-ON funnel (BUYER_TOUR_ANALYTICS).
 *
 * Driven through the fixtures-only preview with `?analytics=1`, which forces the
 * EngagementTracker on with a fixed fixture slug. This exercises the CLIENT behavior
 * (which beacons fire, dedupe, payload shape, non-blocking) independent of the server
 * flag — the endpoint stays disabled in the suite (proven byte-identical elsewhere), but
 * the client fires fire-and-forget regardless of the response, which is exactly what we
 * assert here via observed requests.
 *
 * Covers: tour_opened on load; NO-PII payload shape; reached_comparison on scroll;
 * home_expander_opened (with home letter) + per-load de-dupe; map_pin_tapped +
 * pin_summary_opened on a pin tap; reached_end at the bottom; and that a slow/down
 * endpoint never blocks or breaks the page (fire-and-forget).
 */

const URL = "/buyer-tour-preview?fixture=full&v1=1&analytics=1";
const TRACK = "/api/buyer-tour/track";
const PHONE = { width: 390, height: 844 };

interface Beacon {
  event: string;
  homeLetter?: string;
  keys: string[];
}

function collectBeacons(page: import("@playwright/test").Page): Beacon[] {
  const beacons: Beacon[] = [];
  page.on("request", (req) => {
    if (!req.url().includes(TRACK)) return;
    try {
      const body = req.postData();
      if (!body) return;
      const parsed = JSON.parse(body) as Record<string, unknown>;
      beacons.push({
        event: String(parsed.event),
        homeLetter: parsed.homeLetter as string | undefined,
        keys: Object.keys(parsed),
      });
    } catch {
      /* ignore non-JSON */
    }
  });
  return beacons;
}

const ALLOWED_KEYS = ["tourSlug", "event", "homeLetter", "sessionId", "ts"];

test.describe("buyer-tour analytics funnel (flag ON via preview)", () => {
  test("tour_opened fires once on load, with a NO-PII allow-listed payload", async ({ page }) => {
    const beacons = collectBeacons(page);
    await page.goto(URL);
    await expect(page.getByTestId("buyer-tour-page")).toBeVisible();

    await expect.poll(() => beacons.filter((b) => b.event === "tour_opened").length).toBe(1);

    const opened = beacons.find((b) => b.event === "tour_opened")!;
    // Payload carries ONLY allow-listed keys — no name/email/phone/ip/ua.
    for (const k of opened.keys) expect(ALLOWED_KEYS).toContain(k);
    expect(opened.keys).toContain("sessionId");
    expect(opened.keys).toContain("tourSlug");
  });

  test("reached_comparison fires when the comparison scrolls into view", async ({ page }) => {
    const beacons = collectBeacons(page);
    await page.goto(URL);
    await page.getByTestId("btb-comparison").scrollIntoViewIfNeeded();
    await expect
      .poll(() => beacons.filter((b) => b.event === "reached_comparison").length)
      .toBe(1);
  });

  test("home_expander_opened fires with the home letter and DE-DUPES per load", async ({ page }) => {
    const beacons = collectBeacons(page);
    await page.goto(URL);
    const btn = page.getByTestId("btb-expander-btn-A");
    await btn.scrollIntoViewIfNeeded();
    await btn.click(); // open
    await btn.click(); // close — must NOT emit a second beacon
    await btn.click(); // re-open — still deduped

    await expect
      .poll(() => beacons.filter((b) => b.event === "home_expander_opened").length)
      .toBe(1);
    const b = beacons.find((x) => x.event === "home_expander_opened")!;
    expect(b.homeLetter).toBe("A");
  });

  test("a pin tap fires map_pin_tapped + pin_summary_opened for that home", async ({ page }) => {
    const beacons = collectBeacons(page);
    await page.setViewportSize(PHONE);
    await page.goto(URL);
    await page.getByTestId("btb-map").evaluate((e) => e.scrollIntoView({ block: "center" }));
    await page.getByTestId("btb-map-pinbtn-1").click();
    await expect(page.getByTestId("btb-pin-card")).toBeVisible();

    await expect.poll(() => beacons.filter((b) => b.event === "map_pin_tapped").length).toBe(1);
    await expect.poll(() => beacons.filter((b) => b.event === "pin_summary_opened").length).toBe(1);
    expect(beacons.find((b) => b.event === "map_pin_tapped")?.homeLetter).toBe("A");
  });

  test("reached_end fires when the agent-close panel scrolls into view", async ({ page }) => {
    const beacons = collectBeacons(page);
    await page.goto(URL);
    await page.getByTestId("btb-agent").scrollIntoViewIfNeeded();
    await expect.poll(() => beacons.filter((b) => b.event === "reached_end").length).toBe(1);
  });

  test("fire-and-forget: a DOWN track endpoint never blocks or breaks the page", async ({ page }) => {
    // Make every track call hang/fail — the page must render and stay fully interactive.
    await page.route(`**${TRACK}`, (route) => route.abort());
    await page.goto(URL);
    await expect(page.getByTestId("buyer-tour-page")).toBeVisible();
    // Interactions still work with the endpoint dead.
    const btn = page.getByTestId("btb-expander-btn-A");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
