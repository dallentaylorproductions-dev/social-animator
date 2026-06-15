import { test, expect } from "@playwright/test";

/**
 * SERVER_BRAND_SETTINGS — fresh-device cold-start RENDER fix (v1.5x fast-follow
 * to #85).
 *
 * The bug (found in the #85 smoke): on a fresh device (empty localStorage) with
 * the feature ON, the `/settings` brand form rendered from empty state first.
 * The async `GET /api/brand-settings` resolved ~1-2s later and wrote the fetched
 * settings to localStorage (the `useBrandSettings` hook, mounted alongside the
 * form on /settings via PrelistingPublish) but the FORM — a separate component
 * that seeds its state once on mount — never heard the update, so it stayed
 * blank until a navigation remounted it. The fix subscribes the form to the
 * same-tab `BRAND_SETTINGS_EVENT` so it re-reads the now-populated cache live.
 *
 * Why no real flag-on server here: the feature flag is server-only
 * (`process.env.SERVER_BRAND_SETTINGS_ENABLED`, read in the root layout) and
 * the e2e webServer runs flag-OFF for the whole suite, with no per-spec server
 * env override — the same harness constraint under which the mirror feature
 * (SERVER_DRAFTS) has no flag-on browser e2e either; its server logic is pinned
 * by pure-model node specs instead (see brand-settings.server-store.spec.ts).
 *
 * What these specs DO pin is the client RE-RENDER mechanism that fixes the bug,
 * by reproducing the EXACT signal the hook emits on resolve: `saveBrandSettings`
 * does `localStorage.setItem(STORE, …)` then `dispatchEvent(BRAND_SETTINGS_EVENT)`.
 * Driving the real /settings form, we fire that pair and assert the form adopts
 * it with NO navigation — and that an in-progress edit is never clobbered.
 *
 * (Auth is bypassed via E2E_TESTING=1; brand state lives in localStorage under
 * `socanim_brand_settings`.)
 */

const STORE = "socanim_brand_settings";
const EVENT = "socanim:brand-settings";
const NAME_PLACEHOLDER = "Aaron Thomas Home Team";
const BROKERAGE_PLACEHOLDER = "Acme Realty";

/** A server-saved record, as the GET would resolve it for a cross-device agent. */
const SERVER_RECORD = {
  logoDataUrl: null,
  agentName: "Jordan Rivers Group",
  primaryColor: "#037290",
  accentColor: "#ffffff",
  backgroundColor: "",
  contactEmail: "jordan@example.com",
  contactPhone: "2532028825",
  licenseNumber: "OR #123456",
  brokerage: "Rivers & Co. Realty",
  ownerEmail: "jordan@example.com",
};

test.describe("Brand settings — fresh-device cold-start render", () => {
  test("the form renders the server-saved settings when the fetch resolves, with no navigation", async ({
    page,
  }) => {
    // Genuine fresh device: empty localStorage (top frame only — the embedded
    // preview iframes on other settings surfaces must not be cleared).
    await page.addInitScript((k) => {
      if (window.top === window) window.localStorage.removeItem(k as string);
    }, STORE);

    await page.goto("/settings");

    const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);
    const brokerageInput = page.getByPlaceholder(BROKERAGE_PLACEHOLDER);

    // Cold load: the form seeds from empty localStorage → blank fields.
    await expect(nameInput).toHaveValue("");
    await expect(brokerageInput).toHaveValue("");

    // Reproduce the hook's server-resolve signal: write the fetched record to
    // localStorage and emit BRAND_SETTINGS_EVENT, exactly as saveBrandSettings
    // does inside `useBrandSettings` when GET /api/brand-settings resolves.
    await page.evaluate(
      ({ store, event, record }) => {
        window.localStorage.setItem(store, JSON.stringify(record));
        window.dispatchEvent(new Event(event));
      },
      { store: STORE, event: EVENT, record: SERVER_RECORD },
    );

    // The fix: the form re-reads the now-populated cache and re-renders the
    // saved settings live — no second navigation, no reload.
    await expect(nameInput).toHaveValue("Jordan Rivers Group");
    await expect(brokerageInput).toHaveValue("Rivers & Co. Realty");
  });

  test("a server-fetch resolve never clobbers an edit already in progress", async ({
    page,
  }) => {
    await page.addInitScript((k) => {
      if (window.top === window) window.localStorage.removeItem(k as string);
    }, STORE);

    await page.goto("/settings");

    const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);
    const brokerageInput = page.getByPlaceholder(BROKERAGE_PLACEHOLDER);

    // The agent starts editing BEFORE the slow fetch resolves.
    await nameInput.fill("My Own Edit");
    await expect(nameInput).toHaveValue("My Own Edit");

    // A late server-resolve signal arrives carrying a different (older) copy.
    await page.evaluate(
      ({ store, event, record }) => {
        window.localStorage.setItem(store, JSON.stringify(record));
        window.dispatchEvent(new Event(event));
      },
      { store: STORE, event: EVENT, record: SERVER_RECORD },
    );

    // The fresh local edit wins: the resolve is ignored, not stomped — and it
    // does not leak any of the server record's OTHER fields into the form.
    await expect(nameInput).toHaveValue("My Own Edit");
    await expect(brokerageInput).toHaveValue("");
  });

  test("normal SPA navigation still renders populated settings on first paint", async ({
    page,
  }) => {
    // The away-and-back / warm-cache path: localStorage already holds the
    // record at mount. This is the pre-existing behavior the fix must not
    // regress — the form renders it on the first paint with no event needed.
    await page.addInitScript(
      ({ store, record }) => {
        if (window.top === window) {
          window.localStorage.setItem(store, JSON.stringify(record));
        }
      },
      { store: STORE, record: SERVER_RECORD },
    );

    await page.goto("/settings");

    await expect(page.getByPlaceholder(NAME_PLACEHOLDER)).toHaveValue(
      "Jordan Rivers Group",
    );
    await expect(page.getByPlaceholder(BROKERAGE_PLACEHOLDER)).toHaveValue(
      "Rivers & Co. Realty",
    );
  });
});
