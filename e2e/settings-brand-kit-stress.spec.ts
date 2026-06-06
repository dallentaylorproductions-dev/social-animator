import { test, expect, type Page } from "@playwright/test";

/**
 * Brand kit — color-engine hardening / hostile-color stress gate.
 *
 * Reproduces Dallen's stress combo and the reachability edge cases. The
 * contract: every rendered "fix" button produces a REAL change on click (no
 * dead buttons); unreachable foregrounds render the honest background-fix
 * alternative; the panel stays legible. (Body text is no longer a readability
 * row — v2 locks paper+ink — so the prices/links/section-numeral rows remain.)
 *
 * State lives in localStorage under `socanim_brand_settings`. The seed is
 * guarded to the top frame (the same-origin embedded preview iframe shares
 * this origin's storage — see settings-brand-kit-v3.spec.ts).
 */

const STORE = "socanim_brand_settings";

async function readStore(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }, STORE);
}

async function seed(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(
    ([k, v]) => {
      if (window.top === window) window.localStorage.setItem(k as string, v as string);
    },
    [STORE, JSON.stringify(settings)] as const,
  );
}

// Dallen's stress combo
const STRESS = {
  brandBackground: "#e61e1e",
  brandAccent: "#030303",
  brandText: "#ff9e3d",
};

async function expandReadability(page: Page) {
  // warn states render expanded already, but be explicit
  const fixes = page.getByTestId("brand-readability-fixes");
  if (!(await fixes.isVisible())) {
    await page.getByTestId("brand-readability-verdict").click();
  }
  await expect(fixes).toBeVisible();
}

test.describe("Brand kit — hostile-color stress", () => {
  test("stress combo: NO dead buttons — every rendered fix changes a value", async ({
    page,
  }) => {
    await seed(page, STRESS);
    await page.goto("/settings/brand");
    await expandReadability(page);

    const fixButtons = page.getByTestId("brand-readability-fix");
    const n = await fixButtons.count();
    expect(n).toBeGreaterThan(0);

    // click each fix in turn; each must change accent, text, or background
    for (let i = 0; i < n; i++) {
      // re-seed + reload so each fix is evaluated from the same hostile start
      await seed(page, STRESS);
      await page.goto("/settings/brand");
      await expandReadability(page);
      const before = JSON.stringify({
        a: STRESS.brandAccent.toUpperCase(),
        t: STRESS.brandText.toUpperCase(),
        b: STRESS.brandBackground.toUpperCase(),
      });
      const btn = page.getByTestId("brand-readability-fix").nth(i);
      await expect(btn).toBeVisible();
      await btn.click();
      await expect
        .poll(async () => {
          const s = await readStore(page);
          return JSON.stringify({
            a: s?.brandAccent,
            t: s?.brandText,
            b: s?.brandBackground,
          });
        })
        .not.toBe(before);
    }
  });

  test("stress combo: unreachable Links offers the background-fix + honest note", async ({
    page,
  }) => {
    await seed(page, STRESS);
    await page.goto("/settings/brand");
    await expandReadability(page);

    // the honest, reachability-aware copy is present (links can't reach AA on red)
    await expect(
      page
        .getByTestId("brand-readability-fixes")
        .getByText(/too strong for readable links at any shade/i),
    ).toBeVisible();
    // and a "Soften the background" button is offered (not a dead Bump contrast)
    await expect(
      page
        .getByTestId("brand-readability-fixes")
        .getByRole("button", { name: "Soften the background" })
        .first(),
    ).toBeVisible();
  });

  test("body text is no longer a readability row (v2 locks paper+ink)", async ({
    page,
  }) => {
    await seed(page, STRESS);
    await page.goto("/settings/brand");
    await expandReadability(page);
    // The Body-text row is gone; Prices/Links remain.
    await expect(
      page.getByTestId("brand-readability-fixes").locator(".sample", {
        hasText: "Body text",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("brand-readability-fixes").locator(".sample", {
        hasText: "Prices",
      }),
    ).toHaveCount(1);
  });

  test("reachable case (pale signature on cream): Bump contrast changes the signature", async ({
    page,
  }) => {
    await seed(page, { brandAccent: "#f0e0d0" }); // pale → fails but reachable
    await page.goto("/settings/brand");
    await expandReadability(page);
    const bump = page
      .getByTestId("brand-readability-fixes")
      .getByRole("button", { name: "Bump contrast" })
      .first();
    await expect(bump).toBeVisible();
    await bump.click();
    await expect
      .poll(async () => (await readStore(page))?.brandAccent)
      .not.toBe("#F0E0D0");
  });
});
