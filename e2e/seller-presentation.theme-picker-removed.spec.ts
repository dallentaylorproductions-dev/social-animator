import { test, expect } from "@playwright/test";

/**
 * Post-E.0 polish (Item 1) — the Step 6 theme picker UI is removed.
 *
 * A picker with one live option ("Editorial") + two "coming soon" tiles
 * is a fake choice, and at Review it's post-hoc. It's gone. The theme
 * SYSTEM stays load-bearing: new drafts still seed `themeId` from the
 * brand-level default (seedDraftThemeId → "editorial" when unset), and
 * the single home of theme choice is now the Settings → Brand
 * "Default layout" dropdown.
 *
 * This spec replaces any "picker present on Step 6" assertion (there were
 * none in the suite) with the inverse: the picker is ABSENT, and the
 * seeding behavior is preserved.
 */
test.describe("Seller Presentation — Step 6 theme picker removed (Item 1)", () => {
  test("new draft seeds themeId from the brand default; Step 6 has no theme picker", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const instanceId = new URL(page.url()).searchParams.get("id")!;

    // Seeding preserved: the freshly-created draft carries themeId,
    // seeded from the brand default layout (unset → "editorial").
    await expect
      .poll(async () =>
        page.evaluate((key) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) return null;
          try {
            return (
              (JSON.parse(raw) as { draft?: { themeId?: string } }).draft
                ?.themeId ?? null
            );
          } catch {
            return null;
          }
        }, `workflowInstance:${instanceId}`),
      )
      .toBe("editorial");

    // Drive to Review (only Step 1 gates Next; stubs traverse freely).
    await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
    await page.getByTestId("step-property-city").fill("Tacoma, WA");
    const next = page.getByTestId("wizard-next");
    await expect(next).toBeEnabled();
    for (const stepId of [
      "step-comps",
      "step-strategy",
      "step-pitch",
      "step-editorial",
      "step-review",
    ]) {
      await next.click();
      await expect(page.getByTestId(stepId)).toBeVisible();
    }

    // The theme picker UI is gone from Step 6.
    await expect(page.getByTestId("theme-picker")).toHaveCount(0);
    await expect(page.getByTestId("theme-picker-foot")).toHaveCount(0);
    // Review itself still renders.
    await expect(page.getByTestId("step-review")).toBeVisible();
  });
});
