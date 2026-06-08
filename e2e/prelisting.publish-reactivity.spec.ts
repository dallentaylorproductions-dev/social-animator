import { test, expect } from "@playwright/test";

/**
 * B0c-followup — the pre-listing publish gate reacts to LIVE brand state.
 *
 * The publish button is gated on the agent / team name. That gate read
 * (PrelistingPublish's `useBrandSettings`) used to be a per-instance snapshot
 * loaded once at mount, so typing a name in the brand profile (a SEPARATE
 * component in the same tab) didn't clear the gate until a full page reload.
 * Every writer goes through `saveBrandSettings`, which now emits a same-tab
 * event the hook subscribes to, so the gate clears live.
 *
 * Drives the real /settings page (auth bypassed via E2E_TESTING=1; brand state
 * lives in localStorage under `socanim_brand_settings`) and asserts the gate
 * toggles with NO navigation or reload.
 */

const STORE = "socanim_brand_settings";
const NAME_PLACEHOLDER = "Aaron Thomas Home Team";

test.describe("Pre-listing publish gate — live brand reactivity", () => {
  test("typing the agent / team name enables publish without a reload", async ({
    page,
  }) => {
    // Start with NO brand name set (top frame only — see other settings specs).
    await page.addInitScript((k) => {
      if (window.top === window) window.localStorage.removeItem(k as string);
    }, STORE);

    await page.goto("/settings");

    const publishBtn = page.getByTestId("prelisting-publish-btn");
    const panel = page.getByTestId("prelisting-publish");
    const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);

    // Gated: button disabled + the "set your name first" guidance shows.
    await expect(publishBtn).toBeDisabled();
    await expect(panel).toContainText("Set your agent / team name");

    // Type a name in the brand profile (a different component, same tab).
    await nameInput.fill(NAME_PLACEHOLDER);

    // Reactive: the gate clears live — no reload, no re-navigation.
    await expect(publishBtn).toBeEnabled();
    await expect(panel).not.toContainText("Set your agent / team name");

    // And it re-gates the moment the name is cleared back out.
    await nameInput.fill("");
    await expect(publishBtn).toBeDisabled();
    await expect(panel).toContainText("Set your agent / team name");
  });
});
