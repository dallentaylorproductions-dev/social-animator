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
