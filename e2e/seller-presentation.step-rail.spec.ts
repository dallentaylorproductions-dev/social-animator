import { test, expect, type Page } from "@playwright/test";

/**
 * Clickable wizard step rail.
 *
 * The top rail (1 The home · 2 Comps · 3 Strategy · 4 Your pitch · 5 Editorial ·
 * 6 Review) is no longer display-only — each item is a button that jumps to its
 * step via the SAME step setter Previous/Next drive. It REUSES the existing
 * gating (it never loosens it): a step unreachable via Next (here: anything past
 * the incomplete Property step) is non-clickable (aria-disabled) on the rail
 * too. The active step carries aria-current="step", and the live preview's
 * step→section sync follows rail jumps (it keys off the same step state).
 */

// The anchored flagship section intersects the phone screen's visible band —
// i.e. the preview scrolled to follow the step.
const sectionInView = (
  screen: ReturnType<Page["locator"]>,
  anchorTestId: string,
) =>
  screen.evaluate((s: HTMLElement, id: string) => {
    const t = s.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!t) return false;
    const sr = s.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    return tr.top < sr.bottom && tr.bottom > sr.top;
  }, anchorTestId);

test.describe("Wizard step rail — clickable navigation", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("gated steps are non-clickable until Property is complete", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Property is the active step and is reachable.
    const propertyRail = page.getByTestId("rail-step-property");
    await expect(propertyRail).toHaveAttribute("aria-current", "step");
    await expect(propertyRail).not.toHaveAttribute("aria-disabled", "true");

    // With Property incomplete (no address), later steps are gated. Playwright
    // itself refuses to click an aria-disabled control (it isn't "enabled"),
    // which is the contract; force a click anyway to prove the handler no-ops.
    const compsRail = page.getByTestId("rail-step-comps");
    await expect(compsRail).toHaveAttribute("aria-disabled", "true");
    await compsRail.click({ force: true });
    await expect(page.getByTestId("step-property")).toBeVisible();
    await expect(page.getByTestId("step-comps")).toHaveCount(0);
  });

  test("clicking a reachable rail step jumps to it; aria-current + preview follow", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();

    // Complete Property → every step becomes reachable via the rail.
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma, WA");
    await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();

    const strategyRail = page.getByTestId("rail-step-strategy");
    await expect(strategyRail).not.toHaveAttribute("aria-disabled", "true");

    // Jump straight to Strategy (skipping Comps) — step state updates.
    await strategyRail.click();
    await expect(page.getByTestId("step-strategy")).toBeVisible();
    await expect(strategyRail).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("rail-step-property")).not.toHaveAttribute(
      "aria-current",
      "step",
    );

    // The live preview follows the jump (Strategy → fs-price section in view).
    const screen = page.getByTestId("wizard-preview-screen");
    await expect.poll(() => sectionInView(screen, "fs-price")).toBe(true);

    // And the rail can jump backward too (Review → ... → back to Comps).
    await page.getByTestId("rail-step-comps").click();
    await expect(page.getByTestId("step-comps")).toBeVisible();
    await expect(page.getByTestId("rail-step-comps")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  test("rail step is keyboard-activatable", async ({ page }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("step-property")).toBeVisible();
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await expect(page.getByTestId("step-property-saved-hint")).toBeVisible();

    const pitchRail = page.getByTestId("rail-step-pitch");
    await pitchRail.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("step-pitch")).toBeVisible();
  });
});
