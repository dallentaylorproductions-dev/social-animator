import { test, expect } from "@playwright/test";
import type { BrandSettings } from "../src/lib/brand";
import {
  brandServerCopyIsNewer,
  isBrandOwnedBy,
  isBrandSettingsShape,
  stampBrandOwner,
  type BrandSettingsRecord,
} from "../src/lib/brand-settings-store";
import { planBrandMigration } from "../src/lib/brand-settings-migration";

/**
 * SERVER_BRAND_SETTINGS — server brand-settings store: pure-model unit tests.
 *
 * Mirrors seller-presentation.server-drafts.spec.ts: the privacy-critical
 * owner-scoping, the last-write-wins decision, and the only-already-owned
 * migration planner all live in PURE modules, so they run as node-context
 * Playwright specs (the only runner this repo has) with no KV, no fetch,
 * nothing mocked. Every non-function import is type-only (erased at compile).
 *
 * The two ABSOLUTE gates this file pins:
 *   1. Never cross agents — `isBrandOwnedBy` / `stampBrandOwner` fail closed and
 *      a second agent's record can never be owned or claimed (the hard privacy
 *      gate: one agent's brand/proof must never reach another's account).
 *   2. Never lose / never clobber — the migration planner only ever pushes
 *      settings the session already owns, never claims a legacy un-owned blob
 *      (shared-browser safety), and never overwrites a server copy that exists.
 */

const OWNER = "agent@example.com";
const OTHER = "rival@example.com";
const TS = "2026-06-01T00:00:00.000Z";

function settings(over: Partial<BrandSettings> = {}): BrandSettings {
  // A minimal-but-valid BrandSettings; only the fields the store/migration
  // touch (agentName, ownerEmail) matter here — the rest is opaque blob.
  return {
    logoDataUrl: null,
    agentName: "Jane Agent",
    primaryColor: "#000000",
    accentColor: "#037290",
    backgroundColor: "#ffffff",
    contactEmail: "",
    contactPhone: "",
    licenseNumber: "",
    brokerage: "",
    ...over,
  } as BrandSettings;
}

function record(over: Partial<BrandSettingsRecord> = {}): BrandSettingsRecord {
  return {
    ownerEmail: OWNER,
    updatedAt: TS,
    settings: settings(),
    ...over,
  };
}

// ===========================================================================
// Gate 1 — never cross agents. The owner-scoping spine.
// ===========================================================================

test.describe("isBrandOwnedBy (fail-closed owner predicate)", () => {
  test("matches the owner case-insensitively", () => {
    expect(isBrandOwnedBy(record({ ownerEmail: "Agent@Example.com" }), OWNER)).toBe(true);
    expect(isBrandOwnedBy(record(), "AGENT@EXAMPLE.COM")).toBe(true);
  });

  test("a different agent never owns it (cross-agent isolation)", () => {
    expect(isBrandOwnedBy(record({ ownerEmail: OWNER }), OTHER)).toBe(false);
  });

  test("null record, null email, and an un-owned record all fail closed", () => {
    expect(isBrandOwnedBy(null, OWNER)).toBe(false);
    expect(isBrandOwnedBy(undefined, OWNER)).toBe(false);
    expect(isBrandOwnedBy(record(), null)).toBe(false);
    expect(isBrandOwnedBy(record(), "")).toBe(false);
    expect(isBrandOwnedBy(record({ ownerEmail: "" }), OWNER)).toBe(false);
  });
});

test.describe("stampBrandOwner (server never trusts the client's claimed owner)", () => {
  test("stamps the session owner lowercased, regardless of any client value", () => {
    const stamped = stampBrandOwner(settings(), "AGENT@Example.com", TS);
    expect(stamped.ownerEmail).toBe(OWNER);
    expect(stamped.updatedAt).toBe(TS);
  });

  test("the stamped record is then owned by the session agent, not another", () => {
    const stamped = stampBrandOwner(settings(), OWNER, TS);
    expect(isBrandOwnedBy(stamped, OWNER)).toBe(true);
    expect(isBrandOwnedBy(stamped, OTHER)).toBe(false);
  });

  test("a missing updatedAt fails closed to empty (older than any real ISO stamp)", () => {
    const stamped = stampBrandOwner(
      settings(),
      OWNER,
      undefined as unknown as string,
    );
    expect(stamped.updatedAt).toBe("");
    // An empty stamp never wins last-write-wins against a real stored stamp.
    expect(brandServerCopyIsNewer(record({ updatedAt: TS }), stamped.updatedAt)).toBe(true);
  });
});

// ===========================================================================
// Last-write-wins — a stale push can never clobber a fresher edit.
// ===========================================================================

test.describe("brandServerCopyIsNewer (LWW decision)", () => {
  test("a strictly-newer stored copy wins over an older incoming write", () => {
    const existing = record({ updatedAt: "2026-06-02T00:00:00.000Z" });
    expect(brandServerCopyIsNewer(existing, "2026-06-01T00:00:00.000Z")).toBe(true);
  });

  test("an equal timestamp is NOT newer (idempotent re-save overwrites)", () => {
    expect(brandServerCopyIsNewer(record({ updatedAt: TS }), TS)).toBe(false);
  });

  test("an older stored copy yields to a newer incoming write", () => {
    const existing = record({ updatedAt: "2026-06-01T00:00:00.000Z" });
    expect(brandServerCopyIsNewer(existing, "2026-06-02T00:00:00.000Z")).toBe(false);
  });

  test("no existing record is never newer", () => {
    expect(brandServerCopyIsNewer(null, TS)).toBe(false);
    expect(brandServerCopyIsNewer(undefined, TS)).toBe(false);
  });
});

// ===========================================================================
// Wire-boundary guard.
// ===========================================================================

test.describe("isBrandSettingsShape (wire-boundary guard)", () => {
  test("accepts a settings blob carrying a string agentName", () => {
    expect(isBrandSettingsShape(settings())).toBe(true);
    expect(isBrandSettingsShape({ agentName: "" })).toBe(true);
  });

  test("rejects non-objects and a missing/non-string agentName", () => {
    expect(isBrandSettingsShape(null)).toBe(false);
    expect(isBrandSettingsShape(undefined)).toBe(false);
    expect(isBrandSettingsShape("brand")).toBe(false);
    expect(isBrandSettingsShape({})).toBe(false);
    expect(isBrandSettingsShape({ agentName: 42 })).toBe(false);
  });
});

// ===========================================================================
// Gate 2 — only-already-owned migration; never claim, never clobber.
// ===========================================================================

test.describe("planBrandMigration (only-already-owned, never-clobber)", () => {
  test("claims an owned local blob when the server has none yet", () => {
    const plan = planBrandMigration({
      localSettings: settings({ ownerEmail: OWNER }),
      serverPresent: false,
      sessionEmail: OWNER,
    });
    expect(plan).toEqual({ shouldPush: true, reason: "claim-local" });
  });

  test("owner match is case-insensitive", () => {
    const plan = planBrandMigration({
      localSettings: settings({ ownerEmail: "Agent@Example.com" }),
      serverPresent: false,
      sessionEmail: "AGENT@EXAMPLE.COM",
    });
    expect(plan.shouldPush).toBe(true);
  });

  test("NEVER clobbers: a present server copy wins, nothing is pushed", () => {
    const plan = planBrandMigration({
      localSettings: settings({ ownerEmail: OWNER }),
      serverPresent: true,
      sessionEmail: OWNER,
    });
    expect(plan).toEqual({ shouldPush: false, reason: "server-wins" });
  });

  test("NEVER claims a legacy no-owner blob (left device-local)", () => {
    const plan = planBrandMigration({
      localSettings: settings(),
      serverPresent: false,
      sessionEmail: OWNER,
    });
    expect(plan).toEqual({ shouldPush: false, reason: "not-owned" });
  });

  test("NEVER claims another agent's local blob on a shared browser (the privacy gate)", () => {
    const plan = planBrandMigration({
      localSettings: settings({ ownerEmail: OTHER }),
      serverPresent: false,
      sessionEmail: OWNER,
    });
    expect(plan).toEqual({ shouldPush: false, reason: "not-owned" });
  });

  test("no session ⇒ nothing migrates (no owner to scope to)", () => {
    const plan = planBrandMigration({
      localSettings: settings({ ownerEmail: OWNER }),
      serverPresent: false,
      sessionEmail: null,
    });
    expect(plan).toEqual({ shouldPush: false, reason: "no-session" });
  });

  test("no local settings ⇒ nothing to push", () => {
    const plan = planBrandMigration({
      localSettings: null,
      serverPresent: false,
      sessionEmail: OWNER,
    });
    expect(plan).toEqual({ shouldPush: false, reason: "nothing-local" });
  });
});
