import { test, expect, type Page } from "@playwright/test";

/**
 * M-2 — global top safe-area treatment (installed-PWA standalone).
 *
 * In standalone the iOS status bar paints full-bleed over the top of the app
 * (black-translucent + viewport-fit=cover; see src/app/layout.tsx). M-2 pushes
 * every top bar / back-row below it with `padding-top: max(<base>, env(safe-
 * area-inset-top))` so the bar inherits the inset while the page's full-bleed
 * background fills behind the status bar.
 *
 * What CI CAN verify (and this spec asserts):
 *   1. NON-NOTCH UNCHANGED — `env(safe-area-inset-top)` resolves to 0 in
 *      desktop/CI, so each bar's computed padding-top must equal its base. A
 *      malformed max() (typo, missing unit) would shift this and fail here.
 *   2. INSET WIRED — the served CSS for the route references
 *      `env(safe-area-inset-top`, proving the inset is actually plumbed in.
 *
 * What CI CANNOT verify: the real standalone inset behavior (insets are 0 off
 * a notched device). Dallen's installed-iPhone PWA is the decisive smoke.
 */

const MOBILE = { width: 390, height: 800 };

// Computed padding-top of the first element matching `selector`.
async function paddingTop(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate(
    (el) => getComputedStyle(el).paddingTop,
  );
}

// True if ANY same-origin stylesheet on the page contains `needle` in its rule
// text — an inset-independent check that the safe-area env() is in the served
// CSS (cross-origin sheets throw on .cssRules and are skipped).
async function cssContains(page: Page, needle: string): Promise<boolean> {
  return page.evaluate((n) => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin
      }
      for (const rule of Array.from(rules)) {
        if (rule.cssText.includes(n)) return true;
      }
    }
    return false;
  }, needle);
}

test.describe("M-2 top safe-area — non-notch baseline + inset wired", () => {
  test.use({ viewport: MOBILE });

  test("wizard nav (.sep-wizard) keeps its 26px top and wires the inset", async ({
    page,
  }) => {
    await page.goto("/seller-presentation");
    await expect(page.getByTestId("seller-presentation-wizard")).toBeVisible();

    // The mobile media query's `padding: 26px …` shorthand used to clobber the
    // base rule's inset; M-2 re-applies max(26px, env(...)) there. Insets = 0 in
    // CI → 26px. (A regression that drops the inset still reads 26px here, so
    // the cssContains check below is what proves the inset is present.)
    expect(await paddingTop(page, ".sep-wizard")).toBe("26px");
    expect(await cssContains(page, "env(safe-area-inset-top")).toBe(true);
  });

  test("settings head (Profile + Brand) keeps its 24px top and wires the inset", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.locator(".sep-settings-head--profile")).toBeVisible();
    expect(await paddingTop(page, ".sep-settings-head--profile")).toBe("24px");
    expect(await cssContains(page, "env(safe-area-inset-top")).toBe(true);

    await page.goto("/settings/brand");
    await expect(page.locator(".sep-settings-head--brand")).toBeVisible();
    expect(await paddingTop(page, ".sep-settings-head--brand")).toBe("24px");
  });

  test("social-animator editor header keeps its 24px top and wires the inset", async ({
    page,
  }) => {
    await page.goto("/social-animator/listing-carousel");
    // The editor's content column carries the safe-area-aware top pad.
    const column = page.locator("main .max-w-6xl").first();
    await expect(column).toBeVisible();
    expect(await column.evaluate((el) => getComputedStyle(el).paddingTop)).toBe(
      "24px",
    );
    expect(await cssContains(page, "env(safe-area-inset-top")).toBe(true);
  });
});
