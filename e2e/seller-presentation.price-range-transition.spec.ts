import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/**
 * UX-2a-followup — the single → range TRANSITION must not crash.
 *
 * The prod smoke (2026-06-08) found that toggling "Use a price range" and
 * entering low/high crashed the wizard with a React reconciliation error:
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 *   removed is not a child of this node.
 *
 * Root cause: the flagship Price component rendered the single-price (count-up)
 * branch and the static range branch as two `<div className="fs-price__big…">`
 * at the SAME position. When the mode flips, React reused that <div> and tried
 * to reconcile its children — but the count-up driver (motion.ts) had already
 * imperatively rewritten `[data-price-digits]` via innerHTML/textContent, so
 * React's fibers pointed at detached nodes → removeChild NotFoundError. The
 * same Price component renders the live preview AND the published /h/ hero, so
 * the crash hit both.
 *
 * Fix: distinct stable `key`s per mode force a clean unmount/remount instead of
 * diffing the driver-mutated subtree.
 *
 * The existing UX-2a specs (`seller-presentation.price-range.spec.ts`) only
 * asserted the FINAL range state via a tree-to-text walk — no real DOM, no
 * count-up, no transition — so the crash sailed through. This spec closes that
 * gap with a real browser: it drives the live preview through an actual
 * single→range toggle AFTER the count-up has mutated the DOM, the exact
 * sequence that crashed on prod.
 */

const LOW = "$720,000";
const HIGH = "$780,000";
const EN_DASH = "–";

// The reconciliation crash surfaces as a removeChild DOMException (rethrown by
// React, logged by Next's dev overlay). Match it narrowly so unrelated dev
// console noise never trips the assertion.
const CRASH_RE = /removeChild|NotFoundError|not a child of this node/i;

// Walk property → comps → strategy and land a single clean integer price, so
// the live preview's count-up node exists and (once scrolled into view) runs.
async function reachStrategyWithSinglePrice(page: Page) {
  await page.goto("/seller-presentation");
  await expect(page.getByTestId("step-property")).toBeVisible();

  // Property → make the draft real (non-sparse) so the panel shows the draft.
  await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
  await page.getByTestId("step-property-city").fill("Tacoma, WA");
  await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();
  await page.getByTestId("wizard-next").click();

  // Comps → seed one so the step is complete and "next" advances.
  await expect(page.getByTestId("step-comps")).toBeVisible();
  await page.getByTestId("step-comps-manual-link").click();
  await page.getByTestId("step-comps-add-address").fill("5678 Elm Ave NE");
  await page.getByLabel("comp-add-sold-price").fill("685000");
  await page.getByTestId("step-comps-add-submit").click();
  await expect(page.getByTestId("step-comps-card-0")).toBeVisible();
  await page.getByTestId("wizard-next").click();

  // Strategy → a clean integer single price (≥100) opts INTO the count-up.
  await expect(page.getByTestId("step-strategy")).toBeVisible();
  await page.getByLabel("recommended-price").fill("$650,000");
}

test.describe("UX-2a-followup — price single→range transition (no crash)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("toggling to a range AFTER the count-up ran does not crash; the range renders", async ({
    page,
  }) => {
    // The count-up is gated OFF under reduced motion — force motion ON so the
    // driver actually mutates the price DOM (the precondition for the crash).
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const crashes: string[] = [];
    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() === "error" && CRASH_RE.test(msg.text())) {
        crashes.push(msg.text());
      }
    };
    const onPageError = (err: Error) => {
      if (CRASH_RE.test(err.message)) crashes.push(err.message);
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    await reachStrategyWithSinglePrice(page);

    const screen = page.getByTestId("wizard-preview-screen");
    const priceNode = screen.locator("[data-price-countup]");

    // Bring fs-price into view so the IntersectionObserver fires the count-up,
    // then wait for the driver to (a) flag the node counted and (b) finish its
    // ~1s climb — by which point it has rewritten `[data-price-digits]` and
    // detached React's fibers from those nodes. THIS is the desynced state the
    // toggle used to crash on.
    await page.getByLabel("recommended-price").focus();
    await expect(priceNode).toHaveAttribute("data-price-counted", "1", {
      timeout: 5000,
    });
    await page.waitForTimeout(1200); // PRICE_COUNTUP_MS (1000) + settle.

    // Flip to a range and enter low/high — the sequence that crashed on prod.
    await page.getByTestId("step-strategy-range-toggle").click();
    await page.getByLabel("recommended-price-low").fill(LOW);
    await page.getByLabel("recommended-price-high").fill(HIGH);

    // The preview hero now shows the STATIC range — proof the transition
    // reconciled cleanly. On the pre-fix crash, React's error boundary tore the
    // whole FlagshipPage down and this node never appeared.
    const range = screen.getByTestId("fs-price-range");
    await expect(range).toBeVisible();
    await expect(range).toContainText("720,000");
    await expect(range).toContainText("780,000");
    await expect(range).toContainText(EN_DASH);

    expect(crashes, `removeChild crash(es) captured: ${crashes.join(" | ")}`)
      .toEqual([]);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  });

  test("toggling the range back OFF restores the single price without crashing", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const crashes: string[] = [];
    const onPageError = (err: Error) => {
      if (CRASH_RE.test(err.message)) crashes.push(err.message);
    };
    page.on("pageerror", onPageError);
    page.on("console", (msg) => {
      if (msg.type() === "error" && CRASH_RE.test(msg.text())) {
        crashes.push(msg.text());
      }
    });

    await reachStrategyWithSinglePrice(page);

    const screen = page.getByTestId("wizard-preview-screen");

    // Into a range…
    await page.getByTestId("step-strategy-range-toggle").click();
    await page.getByLabel("recommended-price-low").fill(LOW);
    await page.getByLabel("recommended-price-high").fill(HIGH);
    await expect(screen.getByTestId("fs-price-range")).toBeVisible();

    // …and back to a single price. The range node unmounts, the single
    // count-up node remounts — no removeChild crash either direction.
    await page.getByTestId("step-strategy-range-toggle").click();
    await expect(screen.getByTestId("fs-price-range")).toHaveCount(0);
    await expect(screen.locator(".fs-price__big").first()).toBeVisible();
    await expect(screen.locator("[data-testid='fs-price']")).toContainText(
      "$650,000",
    );

    expect(crashes, `removeChild crash(es) captured: ${crashes.join(" | ")}`)
      .toEqual([]);
  });
});
