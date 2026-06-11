import { test, expect, type Page } from "@playwright/test";

/**
 * Consumer flagship hero — standalone-only top safe-area on the "For {family}"
 * personalization line.
 *
 * On a published /h/<slug> opened as an installed PWA (display-mode:
 * standalone), the hero photo is intentionally full-bleed under the iOS status
 * bar (viewport-fit=cover + black-translucent; see src/app/layout.tsx), but the
 * personalization line (.hero__pers) then sits under the notch and is
 * unreadable. The fix offsets ONLY that line down by env(safe-area-inset-top),
 * scoped to `@media (display-mode: standalone)`, leaving the photo full-bleed.
 *
 * Driven via the stateless flagship preview route — the SAME flagship.css the
 * /h/ route serves.
 *
 * What CI CAN verify (and this spec asserts):
 *   1. NORMAL-TAB BYTE-IDENTICAL — CI runs in a browser tab (NOT standalone),
 *      so the override must not apply: .hero__pers keeps its base top: 16px.
 *   2. PHOTO NOT INSET — the full-bleed image layer (.hero__slot) stays inset:0;
 *      and the standalone rule targets the line, never the photo.
 *   3. INSET WIRED — the served CSS carries a `display-mode: standalone` rule
 *      that offsets .hero__pers with env(safe-area-inset-top).
 *
 * What CI CANNOT verify: the real standalone inset (insets are 0 off a notched
 * device, and headless CI is never display-mode: standalone). Dallen's
 * installed-iPhone PWA is the decisive smoke.
 */

const FLAGSHIP = "/seller-presentation-preview?fixture=full&template=flagship";
const MOBILE = { width: 390, height: 800 };

// Locate the standalone hero-line rule in any same-origin stylesheet and report
// what it touches (cross-origin sheets throw on .cssRules and are skipped).
async function standaloneHeroRule(page: Page): Promise<{
  found: boolean;
  text: string;
  touchesPhoto: boolean;
}> {
  return page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin
      }
      for (const rule of Array.from(rules)) {
        const cond = (rule as CSSMediaRule).conditionText ?? "";
        if (!/display-mode\s*:\s*standalone/.test(cond)) continue;
        const text = rule.cssText;
        if (!text.includes("hero__pers")) continue;
        return {
          found: true,
          text,
          touchesPhoto:
            text.includes("hero__photo") || text.includes("hero__slot"),
        };
      }
    }
    return { found: false, text: "", touchesPhoto: false };
  });
}

test.describe("Flagship hero — standalone top safe-area on the personalization line", () => {
  test.use({ viewport: MOBILE });

  test("normal tab is byte-identical: the line keeps top: 16px and the photo stays full-bleed", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const pers = page.getByTestId("fs-hero-pers");
    await expect(pers).toBeVisible();

    // CI is a normal browser tab (not standalone) → the override is inert, so
    // the line keeps its base offset. A regression that drops the standalone
    // scoping (shifting the common Safari view) changes this and fails here.
    expect(await pers.evaluate((el) => getComputedStyle(el).top)).toBe("16px");

    // The full-bleed photo layer is never inset — it stays pinned to the edges.
    const slot = page.locator(".fs-page .hero__slot");
    await expect(slot).toHaveCount(1);
    expect(await slot.evaluate((el) => getComputedStyle(el).top)).toBe("0px");
  });

  test("the served CSS wires env(safe-area-inset-top) on the line, scoped to standalone, and never the photo", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    await expect(page.getByTestId("fs-hero-pers")).toBeVisible();

    const rule = await standaloneHeroRule(page);
    expect(rule.found, "a display-mode: standalone rule for .hero__pers").toBe(
      true,
    );
    expect(rule.text).toContain("env(safe-area-inset-top");
    expect(
      rule.touchesPhoto,
      "the standalone rule must not inset the hero photo",
    ).toBe(false);
  });
});
