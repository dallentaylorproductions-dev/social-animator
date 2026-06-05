import { test, expect } from "@playwright/test";

/**
 * Preview route — embed mode bridge (Brand kit v3, Item 6).
 *
 * `?embed=1` turns the preview into a same-origin live surface: it marks
 * <html> with `sep-embed` (hiding non-page chrome), and applies brand CSS vars
 * pushed via same-origin postMessage — with a hard same-origin rejection so a
 * cross-origin frame can never push styles.
 */

const PAGE = "main.sep-presentation";

test.describe("Seller preview — embed bridge", () => {
  test("embed=1 marks the doc + hides the share chrome", async ({ page }) => {
    await page.goto("/seller-presentation-preview?fixture=full&embed=1");
    await expect(page.locator(PAGE)).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("sep-embed")),
    ).toBe(true);
    // the share button is non-page chrome → hidden in embed mode
    await expect(page.locator(".sep-presentation .share")).toBeHidden();
  });

  test("applies SAME-ORIGIN posted brand vars to the page root", async ({ page }) => {
    await page.goto("/seller-presentation-preview?fixture=full&embed=1");
    await expect(page.locator(PAGE)).toBeVisible();
    // wait for the bridge to be live (it adds sep-embed on mount)
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("sep-embed")),
    ).toBe(true);

    await page.evaluate(() => {
      window.postMessage(
        { type: "sep-brand-vars", vars: { "--signature": "#123456" } },
        window.location.origin,
      );
    });

    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector("main.sep-presentation") as HTMLElement;
          return el.style.getPropertyValue("--signature").trim();
        }),
      )
      .toBe("#123456");
  });

  test("REJECTS cross-origin messages (no var applied)", async ({ page }) => {
    await page.goto("/seller-presentation-preview?fixture=full&embed=1&brandAccent=%23C26A4E");
    await expect(page.locator(PAGE)).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("sep-embed")),
    ).toBe(true);

    // forge a message with a foreign origin — the bridge must ignore it
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "sep-brand-vars", vars: { "--signature": "#ff00ff" } },
          origin: "https://evil.example.com",
        }),
      );
    });

    // give the handler a tick, then confirm the forged value was NOT applied
    await page.waitForTimeout(150);
    const applied = await page.evaluate(() => {
      const el = document.querySelector("main.sep-presentation") as HTMLElement;
      return el.style.getPropertyValue("--signature").trim();
    });
    expect(applied).not.toBe("#ff00ff");
  });

  test("preview is non-interactive display — the price never carries a box, and the retired highlight is inert", async ({
    page,
  }) => {
    await page.goto("/seller-presentation-preview?fixture=full&embed=1");
    await expect(page.locator(PAGE)).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("sep-embed")),
    ).toBe(true);

    // The price block renders as a plain serif figure on the band — no outline
    // box anywhere, and the $ / digits read as bare text (no border, no chip).
    // (Regression: the palette-chip highlight stretch used to draw an `outline`
    // box on the $ and digits spans.) The .price container keeps its intentional
    // design hairline (border-bottom) — that is the band rule, not the artifact.
    // A box only renders when a side has both a non-`none` style AND a
    // non-zero width. The retired highlight drew `outline: 2px solid`, so the
    // load-bearing guard is `outline-style: none` on every part of the price —
    // and likewise no *visible* border on the $/digits text. (Latent specified
    // widths from UA/reset rules are invisible while the style stays `none`,
    // so we key off the styles, not the widths.)
    const priceBoxes = await page.evaluate(() => {
      const cs = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        const visibleBorder =
          s.borderStyle !== "none" &&
          ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"]
            .some((w) => parseFloat(s[w as keyof CSSStyleDeclaration] as string) > 0);
        return { outlineStyle: s.outlineStyle, visibleBorder };
      };
      return {
        container: cs("main.sep-presentation .price"),
        dollar: cs("main.sep-presentation .price .dollar"),
        digits: cs("main.sep-presentation .price [data-price-digits]"),
      };
    });
    // No outline box on any part of the price (the retired highlight drew one).
    expect(priceBoxes.container?.outlineStyle).toBe("none");
    expect(priceBoxes.dollar?.outlineStyle).toBe("none");
    expect(priceBoxes.digits?.outlineStyle).toBe("none");
    // The $ and digits read as bare text — no visible border/chip box.
    // (The .price container keeps its intentional design hairline border-bottom.)
    expect(priceBoxes.dollar?.visibleBorder).toBe(false);
    expect(priceBoxes.digits?.visibleBorder).toBe(false);

    // The retired highlight message is now a no-op: no element ever acquires
    // the (deleted) highlight class, so clicking around the form draws no boxes.
    await page.evaluate(() => {
      for (const role of ["signature", "signature-deep", "tint-12"]) {
        window.postMessage(
          { type: "sep-highlight-role", role },
          window.location.origin,
        );
      }
    });
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(
        () => document.querySelectorAll(".sep-role-highlight").length,
      ),
    ).toBe(0);
  });

  test("non-embed preview does NOT mark the doc or attach the bridge", async ({
    page,
  }) => {
    await page.goto("/seller-presentation-preview?fixture=full");
    await expect(page.locator(PAGE)).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("sep-embed"),
      ),
    ).toBe(false);
  });
});
