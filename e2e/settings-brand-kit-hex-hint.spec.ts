import { test, expect, type Page } from "@playwright/test";

/**
 * Brand kit — invalid-hex inline hint (F4 · Change 4).
 *
 * Before F4 an invalid hex (e.g. a 5-char `#03290`) was silently ignored: the
 * form kept the old color and the agent thought it saved. The hint makes the
 * failure visible without blocking — a quiet mono line under the field that
 * clears on the next valid commit. The saved value is never touched by a bad
 * parse.
 *
 * Auth bypassed via E2E_TESTING=1; brand state lives in localStorage.
 */

const STORE = "socanim_brand_settings";

async function readAccent(page: Page): Promise<unknown> {
  return page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as Record<string, unknown>).brandAccent : null;
  }, STORE);
}

async function seedAccent(page: Page, accent: string) {
  await page.addInitScript(
    ([k, v]) => {
      // top frame only — the preview iframe shares this origin's storage.
      if (window.top === window) window.localStorage.setItem(k as string, v as string);
    },
    [STORE, JSON.stringify({ brandAccent: accent })] as const,
  );
}

test.describe("Brand kit — invalid hex hint", () => {
  test("5-char hex on blur → hint shows; saved value unchanged", async ({
    page,
  }) => {
    await seedAccent(page, "#037290");
    await page.goto("/settings/brand");

    const field = page.getByTestId("brand-color-accent");
    const hint = page.getByTestId("brand-color-accent-hint");
    await expect(field).toBeVisible();
    await expect(hint).toHaveCount(0); // calm by default

    await field.fill("#03290"); // 5 chars — not a valid hex
    await field.blur();

    await expect(hint).toBeVisible();
    await expect(hint).toHaveText("Not a valid hex — use 6 digits, like #037290.");
    await expect(field).toHaveClass(/is-invalid/);
    // The persisted signature did NOT change to the bad value.
    expect(await readAccent(page)).toBe("#037290");
  });

  test("fixing to 6-char hex → hint clears and the value saves", async ({
    page,
  }) => {
    await seedAccent(page, "#037290");
    await page.goto("/settings/brand");

    const field = page.getByTestId("brand-color-accent");
    const hint = page.getByTestId("brand-color-accent-hint");

    // First a bad parse to raise the hint.
    await field.fill("#03290");
    await field.blur();
    await expect(hint).toBeVisible();

    // Then a valid 6-char hex — hint clears, value commits + autosaves.
    await field.fill("#0A84FF");
    await field.blur();
    await expect(hint).toHaveCount(0);
    await expect(field).not.toHaveClass(/is-invalid/);
    expect(await readAccent(page)).toBe("#0A84FF");
  });
});
