import { test, expect, type Page } from "@playwright/test";

/**
 * Consumer flagship hero — standalone-only top safe-area on the "For {family}"
 * personalization line.
 *
 * On a published /h/<slug> opened as an installed PWA (display-mode:
 * standalone), the hero photo is intentionally full-bleed under the iOS status
 * bar (viewport-fit=cover + black-translucent; see src/app/layout.tsx), but the
 * personalization line (.hero__pers) then sits under the notch and is
 * unreadable. The fix drops ONLY that line down to clear the status bar by the
 * inset amount (`max(16px, env(safe-area-inset-top))` — floored at the base, no
 * over-push), and re-anchors the line's scrim ::before back up to the photo's
 * top edge so it reads as one blended darkening, not a detached band. Scoped to
 * `@media (display-mode: standalone)`; the photo is left full-bleed.
 *
 * Driven via the stateless flagship preview route — the SAME flagship.css the
 * /h/ route serves.
 *
 * What CI CAN verify (and this spec asserts):
 *   1. NORMAL-TAB BYTE-IDENTICAL — CI runs in a browser tab (NOT standalone),
 *      so the override must not apply: .hero__pers keeps its base top: 16px.
 *   2. PHOTO NOT INSET — the full-bleed image layer (.hero__slot) stays inset:0;
 *      and the standalone rule targets the line, never the photo.
 *   3. INSET WIRED, FLOORED, SCRIM RE-ANCHORED — the served standalone rule
 *      offsets .hero__pers with a max()-floored env(safe-area-inset-top) (no
 *      v1-style double-add) and also adjusts the scrim ::before.
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

  test("the served CSS floors the inset with max(), re-anchors the scrim, and never the photo", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    await expect(page.getByTestId("fs-hero-pers")).toBeVisible();

    const rule = await standaloneHeroRule(page);
    expect(rule.found, "a display-mode: standalone rule for .hero__pers").toBe(
      true,
    );
    expect(rule.text).toContain("env(safe-area-inset-top");
    // v2: the offset is floored with max() so it clears the bar by the inset
    // amount itself — NOT v1's `16px + env(...)` which over-pushed ~60px down.
    expect(rule.text).toContain("max(");
    expect(rule.text, "the offset must not re-add the 16px base on top of the inset").not.toContain(
      "16px + env",
    );
    // v2: the line's scrim ::before is re-anchored in the same standalone rule
    // so it reads as one blended darkening, not a band detached from the top.
    expect(rule.text).toContain("::before");
    expect(
      rule.touchesPhoto,
      "the standalone rule must not inset the hero photo",
    ).toBe(false);
  });
});
