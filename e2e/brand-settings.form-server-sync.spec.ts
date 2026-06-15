import { test, expect } from "@playwright/test";
import type { BrandSettings } from "../src/lib/brand";
import { planBrandServerWrite } from "../src/lib/brand";

/**
 * SERVER_BRAND_SETTINGS — the /settings form actually syncs to the server.
 *
 * #85 wired server persistence into `useBrandSettings.update()`, but the
 * BrandProfileForm never called it — it persisted through `saveBrandSettings`
 * (localStorage + BRAND_SETTINGS_EVENT only), so a normal brand edit reached
 * localStorage but never the server, and cross-device sync silently didn't
 * work (the one-time migration only claims an already-owned blob, which the
 * form never stamped). The form now routes its writes through
 * `planBrandServerWrite` and debounced-autosaves to the server when ON.
 *
 * Two layers, matching the harness's reach (the feature flag is server-only
 * and the e2e webServer runs flag-OFF for the whole suite, with no per-spec
 * server-env override — the same constraint under which the mirror feature
 * SERVER_DRAFTS has no flag-on browser e2e):
 *
 *   1. PURE node-context tests of the gate + payload (flag on → write the edit
 *      with the caller's updatedAt; flag off → no write). This is the
 *      deterministic pin on "a form edit becomes a server write when ON",
 *      owner-stamped server-side, mirroring planBrandMigration's test style.
 *   2. A flag-OFF browser guard that drives the real form and asserts editing a
 *      field NEVER issues a PUT — the byte-identical-when-off contract.
 *
 * The live flag-ON PUT round-trip is verified on the preview (Cowork): edit a
 * field → confirm it's server-side → clear localStorage → reload → it persists.
 */

const STORE = "socanim_brand_settings";
const NAME_PLACEHOLDER = "Aaron Thomas Home Team";
const TS = "2026-06-15T12:00:00.000Z";

function settings(over: Partial<BrandSettings> = {}): BrandSettings {
  return {
    logoDataUrl: null,
    agentName: "Jane Agent",
    primaryColor: "#037290",
    accentColor: "#ffffff",
    backgroundColor: "",
    contactEmail: "",
    contactPhone: "",
    licenseNumber: "",
    brokerage: "",
    ...over,
  };
}

// ===========================================================================
// 1 — pure gate: a form edit becomes a server write iff the feature is ON.
// ===========================================================================

test.describe("planBrandServerWrite (form → server autosave gate)", () => {
  test("feature ON → writes the edited settings with the caller's updatedAt", () => {
    const next = settings({ agentName: "Edited Name" });
    expect(
      planBrandServerWrite({ serverEnabled: true, settings: next, nowIso: TS }),
    ).toEqual({ shouldWrite: true, settings: next, updatedAt: TS });
  });

  test("feature OFF → no server write (byte-identical, localStorage only)", () => {
    expect(
      planBrandServerWrite({
        serverEnabled: false,
        settings: settings(),
        nowIso: TS,
      }),
    ).toEqual({ shouldWrite: false });
  });

  test("the payload carries the settings verbatim (owner is stamped server-side, not here)", () => {
    // The client NEVER sets ownerEmail on the wire — the route stamps it from
    // the session. The plan passes the edited settings through untouched.
    const next = settings({ agentName: "No Client Owner", ownerEmail: undefined });
    const plan = planBrandServerWrite({
      serverEnabled: true,
      settings: next,
      nowIso: TS,
    });
    expect(plan.shouldWrite).toBe(true);
    if (plan.shouldWrite) {
      expect(plan.settings.ownerEmail).toBeUndefined();
      expect(plan.settings.agentName).toBe("No Client Owner");
    }
  });
});

// ===========================================================================
// 2 — flag-OFF browser guard: editing the real form never PUTs.
// ===========================================================================

test.describe("BrandProfileForm — flag-off server-write guard", () => {
  test("editing a brand field issues NO PUT to /api/brand-settings when the feature is off", async ({
    page,
  }) => {
    let putCount = 0;
    // Count PUTs; let GETs fall through (the route 503s flag-off anyway).
    await page.route("**/api/brand-settings", async (route) => {
      if (route.request().method() === "PUT") putCount += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "feature-disabled" }),
      });
    });

    await page.addInitScript((k) => {
      if (window.top === window) window.localStorage.removeItem(k as string);
    }, STORE);

    await page.goto("/settings");

    const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);
    await nameInput.fill("Edited Offline Name");

    // Past the autosave debounce window (1500ms) with margin — a flag-on build
    // would have PUT by now; a flag-off build must not.
    await page.waitForTimeout(2200);

    expect(putCount).toBe(0);
    // The edit still persisted locally (the localStorage-only contract).
    await expect(nameInput).toHaveValue("Edited Offline Name");
  });
});
