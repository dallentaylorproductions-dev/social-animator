import { test, expect } from "@playwright/test";

/**
 * Post-E.0 polish (Item 2) — the Step 4 (Pitch) Swap picker dismisses on
 * an outside click or Escape. Previously the only way to close it was to
 * press Swap again, which agents didn't discover. The re-press toggle and
 * the in-picker options keep working unchanged.
 */
test.describe("Seller Presentation — Step 4 Swap picker dismissal (Item 2)", () => {
  test("swap picker closes on outside-click and Escape; toggle still toggles", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);

    // Drive to Step 4 (Pitch): property gates Next; comps/strategy traverse.
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma, WA");
    const next = page.getByTestId("wizard-next");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByTestId("step-comps")).toBeVisible();
    await next.click();
    await expect(page.getByTestId("step-strategy")).toBeVisible();
    await next.click();
    await expect(page.getByTestId("step-pitch")).toBeVisible();

    const toggle = page.getByTestId("step-pitch-swap-0");
    const picker = page.getByTestId("step-pitch-swap-picker-0");
    await expect(toggle).toBeVisible();

    // Outside-click closes.
    await toggle.click();
    await expect(picker).toBeVisible();
    await page.getByRole("heading", { name: "Your pitch" }).click();
    await expect(picker).toHaveCount(0);

    // Escape closes.
    await toggle.click();
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);

    // Re-press toggle still works (open, then press Swap again to close).
    await toggle.click();
    await expect(picker).toBeVisible();
    await toggle.click();
    await expect(picker).toHaveCount(0);
  });
});
