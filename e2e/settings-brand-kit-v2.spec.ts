import { test, expect, type Page } from "@playwright/test";

/**
 * Brand kit v2 settings form — behavior gate (Phase E.1, Item 3 + 6).
 *
 * Covers the controlled form at /settings/brand: the signature/secondary
 * rows, the read-only derived palette strip, the collapsed Page-surface
 * disclosure, the never-blocking Readability panel (round-2 role split +
 * Bump contrast), and the live MiniPage preview. The two load-bearing
 * E.0 contracts are pinned here: NO write on mount, and unset secondary
 * persists as ABSENT (never the empty string).
 *
 * Auth is bypassed via the webServer's E2E_TESTING=1 (playwright.config).
 * State lives in localStorage under `socanim_brand_settings`.
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
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [STORE, JSON.stringify(settings)] as const,
  );
}

test.describe("Brand kit v2 form", () => {
  test("renders the v2 structure: signature + secondary + read-only palette + preview", async ({
    page,
  }) => {
    await page.goto("/settings/brand");

    // signature row keeps the production test id (NOT renamed to -signature)
    await expect(page.getByTestId("brand-color-accent")).toBeVisible();
    await expect(page.getByTestId("brand-color-secondary")).toBeVisible();

    // the derived palette strip: 7 read-only chips, NO inputs inside
    const strip = page.getByTestId("brand-palette-strip");
    await expect(strip).toBeVisible();
    for (const token of [
      "signature",
      "signature-deep",
      "signature-link",
      "tint-12",
      "tint-6",
      "line-30",
      "on-signature",
    ]) {
      await expect(page.getByTestId(`brand-palette-chip-${token}`)).toBeVisible();
    }
    expect(await strip.locator("input").count()).toBe(0);

    // live preview present
    await expect(page.getByTestId("brand-minipage-preview")).toBeVisible();
  });

  test("NO write on mount: opening the page with empty storage persists nothing (E.0 gate)", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    await expect(page.getByTestId("brand-color-accent")).toBeVisible();
    // mount loaded + rendered from defaults, but must not have written
    expect(await readStore(page)).toBeNull();
  });

  test("Page-surface disclosure is collapsed by default and reveals background/text", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    const toggle = page.getByTestId("brand-surface-disclosure");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // collapsed → the two surface rows are not visible
    await expect(page.getByTestId("brand-color-background")).toBeHidden();
    await expect(page.getByTestId("brand-color-text")).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("brand-color-background")).toBeVisible();
    await expect(page.getByTestId("brand-color-text")).toBeVisible();
  });

  test("secondary: Add→type sets it (Section numerals chip appears, persists as hex), Clear unsets to ABSENT", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    const secondary = page.getByTestId("brand-color-secondary");

    // unset: placeholder + "Add" button, no Section-numerals chip
    await expect(secondary).toHaveAttribute("placeholder", "Optional");
    const secRow = page
      .locator(".crow.is-secondary")
      .filter({ has: secondary });
    await expect(secRow.getByRole("button")).toHaveText("Add");
    await expect(
      page.getByTestId("brand-readability-fixes").getByText("Section numerals"),
    ).toHaveCount(0);

    // type a valid hex → commit on Enter
    await secondary.fill("#B0863A");
    await secondary.press("Enter");

    // now set: Section-numerals readability chip appears, button reads Clear
    await expect(
      page.getByTestId("brand-readability-fixes").getByText("Section numerals"),
    ).toBeVisible();
    await expect(secRow.getByRole("button")).toHaveText("Clear");

    // persisted as a real hex
    await expect
      .poll(async () => (await readStore(page))?.brandSecondary)
      .toBe("#B0863A");

    // Clear → unset; persists as ABSENT (key dropped), not ""
    await secRow.getByRole("button").click();
    await expect(secondary).toHaveValue("");
    await expect(
      page.getByTestId("brand-readability-fixes").getByText("Section numerals"),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const s = await readStore(page);
        return s ? "brandSecondary" in s : false;
      })
      .toBe(false);
  });

  test("invalid hex does not commit (last good value stays, error border shown)", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    const sig = page.getByTestId("brand-color-accent");
    await sig.fill("not-a-color");
    await sig.press("Enter");
    await expect(sig).toHaveClass(/is-invalid/);
    // storage untouched (no commit of garbage)
    expect(await readStore(page)).toBeNull();
  });

  test("readability: low-contrast signature flips verdict to warn + Bump contrast fixes it; save never blocked", async ({
    page,
  }) => {
    // seed a pale signature on cream → raw contrast < 3.0 (prices fail → warn)
    await seed(page, { brandAccent: "#f0e0d0" });
    await page.goto("/settings/brand");

    const verdict = page.getByTestId("brand-readability-verdict");
    await expect(verdict).toContainText("Worth a look");

    // a Bump contrast button is offered; clicking deepens the signature
    const sigInput = page.getByTestId("brand-color-accent");
    const before = await sigInput.inputValue();
    const fix = page.getByTestId("brand-readability-fix").first();
    await expect(fix).toBeVisible();
    await fix.click();

    // verdict recovers (save is never gated) and the field deepened
    await expect(verdict).toContainText("Easy to read");
    await expect(sigInput).not.toHaveValue(before);
    const after = await sigInput.inputValue();

    // the bumped value persisted
    await expect
      .poll(async () => (await readStore(page))?.brandAccent)
      .toBe(after);
  });

  test("defaults (terracotta): verdict good, but the Links chip warns independently", async ({
    page,
  }) => {
    await page.goto("/settings/brand");
    // terracotta #c26a4e on cream: prices(3.0) pass, body passes → verdict good
    await expect(page.getByTestId("brand-readability-verdict")).toContainText(
      "Easy to read",
    );
    // but raw 3.24 < 4.5 → the Links chip carries its own Bump-contrast warning
    await expect(page.getByTestId("brand-readability-fix")).toHaveCount(1);
  });
});
