import { test, expect, type Page } from "@playwright/test";

/**
 * Brand kit v3 settings form — behavior gate.
 *
 * Covers the v3 deltas at /settings/brand: secondary row removed (data field +
 * quiet saved-note kept), "Suggested from your logo" (logo / no-logo / apply),
 * "Open full sample page" (current unsaved values), readability collapse +
 * honest "adjusted" copy, the "Brand ready" closure state (advisory contrast
 * never downgrades it), and the load-bearing E.0 contracts (NO write on mount).
 *
 * Auth bypassed via E2E_TESTING=1; state lives in localStorage under
 * `socanim_brand_settings`.
 */

const STORE = "socanim_brand_settings";

async function readStore(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }, STORE);
}

// NOTE: addInitScript runs in EVERY frame (incl. the embedded preview iframe,
// which shares this origin's localStorage). Guard to the TOP frame only, or the
// iframe's reload would re-seed and clobber values the form just saved — a test
// artifact (production's preview route never writes brand settings).
async function seed(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(
    ([k, v]) => {
      if (window.top === window) window.localStorage.setItem(k as string, v as string);
    },
    [STORE, JSON.stringify(settings)] as const,
  );
}

// Seed a logo by drawing a solid known color to a canvas at document start.
async function seedWithLogo(
  page: Page,
  color: string,
  extra: Record<string, unknown> = {},
) {
  await page.addInitScript(
    ([k, col, ex]) => {
      if (window.top !== window) return; // top frame only (see seed())
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = col as string;
      ctx.fillRect(0, 0, 8, 8);
      window.localStorage.setItem(
        k as string,
        JSON.stringify({
          logoDataUrl: c.toDataURL("image/png"),
          ...(ex as Record<string, unknown>),
        }),
      );
    },
    [STORE, color, extra] as const,
  );
}

test.describe("Brand kit v3 form", () => {
  test("secondary row is gone; with a saved secondary, a quiet note renders", async ({
    page,
  }) => {
    // no secondary saved → no row, no note
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-color-accent")).toBeVisible();
    await expect(page.getByTestId("brand-color-secondary")).toHaveCount(0);
    await expect(page.getByTestId("brand-secondary-saved-note")).toHaveCount(0);

    // saved secondary → the quiet line appears (still no editable row)
    await seed(page, { brandSecondary: "#B0863A" });
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-secondary-saved-note")).toBeVisible();
    await expect(page.getByTestId("brand-color-secondary")).toHaveCount(0);
  });

  test("NO write on mount (E.0 gate)", async ({ page }) => {
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-color-accent")).toBeVisible();
    expect(await readStore(page)).toBeNull();
  });

  test("logo suggestions: extracted from the logo, one tap applies to Signature + persists", async ({
    page,
  }) => {
    await seedWithLogo(page, "#2C53C4", { agentName: "Aaron Thomas" });
    await page.goto("/settings/brand");

    const sugg = page.getByTestId("brand-logo-suggestions");
    await expect(sugg).toBeVisible();
    const chip = page.getByTestId("brand-logo-suggestion-0");
    await expect(chip).toBeVisible({ timeout: 10_000 });
    const sig = page.getByTestId("brand-color-accent");

    // retry click+assert until it sticks (guards the hydration race where a
    // DOM click can land before React attaches the handler)
    await expect(async () => {
      await chip.click();
      await expect(sig).toHaveValue("#2C53C4", { timeout: 1000 });
    }).toPass({ timeout: 10_000 });

    await expect
      .poll(async () => (await readStore(page))?.brandAccent, { timeout: 8000 })
      .toBe("#2C53C4");
  });

  test("logo suggestions: no logo → visible-but-empty row links to Profile", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-logo-suggestions")).toBeVisible();
    await expect(page.getByTestId("brand-logo-suggestions-empty")).toBeVisible();
    await expect(page.getByTestId("brand-logo-suggestion-0")).toHaveCount(0);
  });

  test("Open full sample page: new-tab link carries the CURRENT unsaved values", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    const link = page.getByTestId("brand-open-sample-page");
    await expect(link).toHaveText("Open full sample page");
    await expect(link).toHaveAttribute("target", "_blank");

    // change the signature WITHOUT relying on persistence, then confirm the
    // href reflects the working value (encoded #)
    const sig = page.getByTestId("brand-color-accent");
    await sig.fill("#2C53C4");
    await sig.press("Enter");
    await expect(link).toHaveAttribute("href", /brandAccent=%232C53C4/i);
    await expect(link).toHaveAttribute("href", /fixture=full/);
  });

  test("readability collapses on a clean pass; expands on View details; warn stays expanded", async ({
    page,
  }) => {
    // defaults pass → collapsed "all clear", chips hidden until View details
    await page.goto("/settings/brand");
    const verdict = page.getByTestId("brand-readability-verdict");
    await expect(verdict).toContainText("Readability all clear");
    await expect(page.getByTestId("brand-readability-fixes")).toBeHidden();
    await verdict.click();
    await expect(page.getByTestId("brand-readability-fixes")).toBeVisible();

    // low body contrast → warn, expanded by default
    await seed(page, { brandText: "#c9c2b5" }); // light text on cream → fails
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-readability-verdict")).toContainText(
      "Readability needs a look",
    );
    await expect(page.getByTestId("brand-readability-fixes")).toBeVisible();
  });

  test("'adjusted to stay readable' appears ONLY when the body clamp moved a value", async ({
    page,
  }) => {
    // defaults: 15.2:1, no clamp → no adjusted copy (expand to inspect)
    await page.goto("/settings/brand");
    await page.getByTestId("brand-readability-verdict").click();
    await expect(
      page.getByTestId("brand-readability-fixes").getByText("adjusted to stay readable"),
    ).toHaveCount(0);

    // low-contrast body → engine clamps body text → honest adjusted copy shows
    await seed(page, { brandText: "#c9c2b5" });
    await page.goto("/settings/brand");
    await expect(
      page.getByTestId("brand-readability-fixes").getByText("adjusted to stay readable"),
    ).toBeVisible();
  });

  test("Brand ready: complete needs logo + agent name; advisory contrast never downgrades it", async ({
    page,
  }) => {
    // missing logo + name → Almost ready
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-ready-state")).toContainText(
      "Almost ready",
    );

    // logo + name present → Brand ready (even with a contrast WARN seeded)
    await seedWithLogo(page, "#2C53C4", {
      agentName: "Aaron Thomas",
      brandText: "#c9c2b5", // low-contrast body → readability warns
    });
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-readability-verdict")).toContainText(
      "needs a look",
    );
    await expect(page.getByTestId("brand-ready-state")).toContainText(
      "Brand ready",
    );
  });

  test("preview is the embedded real template; surface disclosure collapsed; pickers present", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    // the preview testid now lives on the embedded iframe
    const frame = page.getByTestId("brand-minipage-preview");
    await expect(frame).toBeVisible();
    expect((await frame.evaluate((el) => el.tagName)).toLowerCase()).toBe("iframe");
    await expect(frame).toHaveAttribute("src", /embed=1/);

    // disclosure collapsed by default; native pickers preserved
    const toggle = page.getByTestId("brand-surface-disclosure");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("brand-color-background")).toBeHidden();
    await expect(page.getByTestId("brand-color-picker-accent")).toHaveCount(1);
  });
});
