import { test, expect, type Page } from "@playwright/test";
import { deriveConsumerRoles } from "../src/tools/seller-presentation/output/consumer-roles";

/**
 * F3 — the Brand-kit live preview adopts the flagship distribution.
 *
 * PR #29 replaced the hand-built MiniPage with a live iframe of the REAL
 * seller template; F3 routes that iframe through the flagship (v2) template so
 * agents dial colors against the look they now publish. The preview shares ONE
 * color path with the real page (`deriveConsumerRoles`), so these specs assert
 * the embedded preview's computed styles match the role set that helper
 * resolves: a signature-colored price figure and a `--tint-12` band tint.
 *
 * Driven via the embed preview route with the SAME params the form's
 * `previewParams` builds (`template=flagship&embed=1&brandAccent=…`).
 */

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** "#RRGGBB" → "rgb(r, g, b)" (the computed-style form). */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const ACCENT = "#037290"; // flagship blue (the F3 default signature)
const EMBED_FLAGSHIP = `/seller-presentation-preview?fixture=full&template=flagship&embed=1&brandAccent=${encodeURIComponent(
  ACCENT,
)}`;

test.describe("F3 — Brand-kit live preview shows the flagship rhythm", () => {
  test("the embedded preview renders the flagship template (not v1)", async ({
    page,
  }) => {
    await page.goto(EMBED_FLAGSHIP);
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();
    await expect(page.getByTestId("seller-presentation-public")).toHaveCount(0);
  });

  test("band tints + price figure come from deriveConsumerRoles (one color path)", async ({
    page,
  }) => {
    await page.goto(EMBED_FLAGSHIP);
    const roles = deriveConsumerRoles(ACCENT);

    // Price figure is the signature (the §2 hero value moment).
    const priceBig = await read(
      page.locator(".fs-page .fs-price__big").first(),
      "color",
    );
    expect(priceBig).toBe(hexToRgb(roles.signature));

    // The auto-icon mark wash is the --tint-12 role (D1 locked design uses the
    // accent tints for marks/pills/tracks, never full section bands).
    const tintMark = await read(
      page.locator(".fs-page .fs-iconmark").first(),
      "background-color",
    );
    expect(tintMark).toBe(hexToRgb(roles.tint12));

    // The role var is declared on the flagship root itself (the live path).
    const rootSig = await read(
      page.getByTestId("seller-presentation-flagship"),
      "--signature",
    );
    expect(rootSig.trim()).toBe(roles.signature);
  });

  test("same-origin posted role vars repaint the FLAGSHIP root", async ({
    page,
  }) => {
    await page.goto(EMBED_FLAGSHIP);
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains("sep-embed"),
        ),
      )
      .toBe(true);

    // The form pushes the deriveConsumerRoles var set over the bridge; the
    // flagship root must pick it up (setProperty overrides its inline value).
    await page.evaluate(() => {
      window.postMessage(
        { type: "sep-brand-vars", vars: { "--signature": "#123456" } },
        window.location.origin,
      );
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector(
            "[data-flagship-shell]",
          ) as HTMLElement;
          return el.style.getPropertyValue("--signature").trim();
        }),
      )
      .toBe("#123456");
  });

  test("the /settings/brand preview iframe is wired to the flagship template", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    const frame = page.getByTestId("brand-minipage-preview");
    await expect(frame).toBeVisible();
    const src = (await frame.getAttribute("src")) ?? "";
    expect(src).toContain("template=flagship");
    expect(src).toContain("fixture=full");
    expect(src).toContain("embed=1");
  });
});
