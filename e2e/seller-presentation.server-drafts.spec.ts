import { test, expect } from "@playwright/test";
import type { WorkflowInstance } from "../src/skills/workflow-instance";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";
import {
  isDraftOwnedBy,
  isSellerDraftInstance,
  scopeOwnedDrafts,
  serverCopyIsNewer,
  stampOwner,
  type DraftRecord,
} from "../src/lib/seller-presentation/draft-store";
import { planDraftMigration } from "../src/lib/seller-presentation/draft-migration";
import {
  isCrossDeviceOnly,
  mergePages,
  type ServerPageSummary,
} from "../src/lib/seller-presentation/pages-library";

/**
 * SP-KEYSTONE — server draft store: pure-model unit tests.
 *
 * Mirrors the pages-library spec: the privacy-critical owner-scoping, the
 * lossless+idempotent migration planner, and the cross-device reconciliation
 * all live in PURE modules, so they run as node-context Playwright specs (the
 * only runner this repo has) with no KV, no fetch, nothing mocked. Every
 * non-function import is type-only (erased at compile).
 *
 * The two ABSOLUTE gates this file pins:
 *   1. Never cross agents — `isDraftOwnedBy` / `scopeOwnedDrafts` / `stampOwner`
 *      fail closed and a second agent's record never survives a scope.
 *   2. Never lose / never claim — the migration planner only ever pushes drafts
 *      the session already owns, is idempotent by id, and never claims a legacy
 *      un-owned draft (the shared-browser safety property).
 */

const OWNER = "agent@example.com";
const OTHER = "rival@example.com";

function instance(
  over: Partial<WorkflowInstance<SellerPresentationDraft>> = {},
): WorkflowInstance<SellerPresentationDraft> {
  const ts = "2026-06-01T00:00:00.000Z";
  return {
    instanceId: "wf_1",
    skillId: "seller-presentation",
    draft: { propertyAddress: "123 Main St" } as SellerPresentationDraft,
    resolvedPrimitives: {},
    timestamps: { createdAt: ts, updatedAt: ts },
    ownerEmail: OWNER,
    ...over,
  };
}

function record(over: Partial<DraftRecord> = {}): DraftRecord {
  const inst = instance();
  return {
    instanceId: inst.instanceId,
    ownerEmail: OWNER,
    updatedAt: inst.timestamps.updatedAt,
    instance: inst,
    ...over,
  };
}

// ===========================================================================
// Gate 1 — never cross agents. The owner-scoping spine.
// ===========================================================================

test.describe("isDraftOwnedBy (fail-closed owner predicate)", () => {
  test("matches the owner case-insensitively", () => {
    expect(isDraftOwnedBy(record({ ownerEmail: "Agent@Example.com" }), OWNER)).toBe(true);
    expect(isDraftOwnedBy(record(), "AGENT@EXAMPLE.COM")).toBe(true);
  });

  test("a different agent never owns it", () => {
    expect(isDraftOwnedBy(record({ ownerEmail: OWNER }), OTHER)).toBe(false);
  });

  test("null record, null email, and an un-owned record all fail closed", () => {
    expect(isDraftOwnedBy(null, OWNER)).toBe(false);
    expect(isDraftOwnedBy(undefined, OWNER)).toBe(false);
    expect(isDraftOwnedBy(record(), null)).toBe(false);
    expect(isDraftOwnedBy(record(), "")).toBe(false);
    expect(isDraftOwnedBy(record({ ownerEmail: "" }), OWNER)).toBe(false);
  });
});

test.describe("scopeOwnedDrafts (the list/privacy filter)", () => {
  test("keeps only this agent's records; drops nulls and cross-owner entries", () => {
    const mine = record({ instanceId: "wf_mine" });
    const theirs = record({ instanceId: "wf_theirs", ownerEmail: OTHER });
    const scoped = scopeOwnedDrafts([mine, null, theirs, undefined], OWNER);
    expect(scoped.map((r) => r.instanceId)).toEqual(["wf_mine"]);
  });

  test("a corrupt index entry (another agent's record) can never leak", () => {
    // Even if a foreign record was somehow returned for this owner's index,
    // the per-record re-check drops it (defense-in-depth).
    const foreign = record({ instanceId: "wf_x", ownerEmail: OTHER });
    expect(scopeOwnedDrafts([foreign], OWNER)).toHaveLength(0);
  });
});

test.describe("stampOwner (server never trusts the client's claimed owner)", () => {
  test("overwrites a spoofed body ownerEmail with the session owner, lowercased", () => {
    const spoofed = instance({ ownerEmail: OTHER });
    const stamped = stampOwner(spoofed, "AGENT@Example.com");
    expect(stamped.ownerEmail).toBe(OWNER);
    expect(stamped.instance.ownerEmail).toBe(OWNER);
    // updatedAt mirrors the instance clock (the LWW + index ordering key).
    expect(stamped.updatedAt).toBe(spoofed.timestamps.updatedAt);
    expect(stamped.instanceId).toBe(spoofed.instanceId);
  });

  test("the stamped record is then owned by the session agent, not the spoofer", () => {
    const stamped = stampOwner(instance({ ownerEmail: OTHER }), OWNER);
    expect(isDraftOwnedBy(stamped, OWNER)).toBe(true);
    expect(isDraftOwnedBy(stamped, OTHER)).toBe(false);
  });
});

test.describe("isSellerDraftInstance (wire-boundary guard)", () => {
  test("accepts a well-formed SP instance", () => {
    expect(isSellerDraftInstance(instance())).toBe(true);
  });

  test("rejects a foreign skill, so the SP namespace can't be cross-written", () => {
    expect(
      isSellerDraftInstance(instance({ skillId: "open-house-prep" as WorkflowInstance["skillId"] })),
    ).toBe(false);
  });

  test("rejects malformed shapes", () => {
    expect(isSellerDraftInstance(null)).toBe(false);
    expect(isSellerDraftInstance({})).toBe(false);
    expect(isSellerDraftInstance({ instanceId: "", skillId: "seller-presentation" })).toBe(false);
    expect(
      isSellerDraftInstance({ instanceId: "wf", skillId: "seller-presentation", resolvedPrimitives: {} }),
    ).toBe(false); // no timestamps
  });
});

test.describe("serverCopyIsNewer (last-write-wins, never clobber a fresher edit)", () => {
  const older = "2026-06-01T00:00:00.000Z";
  const newer = "2026-06-02T00:00:00.000Z";

  test("a strictly-newer stored copy supersedes the incoming write", () => {
    expect(serverCopyIsNewer(record({ updatedAt: newer }), older)).toBe(true);
  });

  test("an equal timestamp is NOT newer (idempotent re-save overwrites)", () => {
    expect(serverCopyIsNewer(record({ updatedAt: older }), older)).toBe(false);
  });

  test("an older stored copy yields to the incoming (fresher) write", () => {
    expect(serverCopyIsNewer(record({ updatedAt: older }), newer)).toBe(false);
  });

  test("no existing record ⇒ always accept (first write)", () => {
    expect(serverCopyIsNewer(null, older)).toBe(false);
    expect(serverCopyIsNewer(undefined, newer)).toBe(false);
  });
});

// ===========================================================================
// Gate 2 — never lose / never claim. The migration planner.
// ===========================================================================

test.describe("planDraftMigration — owner scope (never claim a legacy draft)", () => {
  test("only drafts the session already owns are pushed", () => {
    const mine = instance({ instanceId: "wf_mine", ownerEmail: OWNER });
    const theirs = instance({ instanceId: "wf_theirs", ownerEmail: OTHER });
    const plan = planDraftMigration({
      localInstances: [mine, theirs],
      serverInstanceIds: [],
      sessionEmail: OWNER,
    });
    expect(plan.toPush.map((i) => i.instanceId)).toEqual(["wf_mine"]);
    expect(plan.skippedNotOwned.map((i) => i.instanceId)).toEqual(["wf_theirs"]);
  });

  test("a legacy un-owned draft is NEVER claimed (the shared-browser gate)", () => {
    const legacy = instance({ instanceId: "wf_legacy", ownerEmail: undefined });
    const plan = planDraftMigration({
      localInstances: [legacy],
      serverInstanceIds: [],
      sessionEmail: OWNER,
    });
    expect(plan.toPush).toHaveLength(0);
    expect(plan.skippedNotOwned.map((i) => i.instanceId)).toEqual(["wf_legacy"]);
  });

  test("no session ⇒ nothing migrates", () => {
    const plan = planDraftMigration({
      localInstances: [instance()],
      serverInstanceIds: [],
      sessionEmail: null,
    });
    expect(plan.toPush).toHaveLength(0);
  });

  test("non-SP instances are ignored entirely", () => {
    const other = instance({
      instanceId: "wf_oh",
      skillId: "open-house-prep" as WorkflowInstance["skillId"],
    });
    const plan = planDraftMigration({
      localInstances: [other],
      serverInstanceIds: [],
      sessionEmail: OWNER,
    });
    expect(plan.toPush).toHaveLength(0);
    expect(plan.skippedNotOwned).toHaveLength(0);
  });
});

test.describe("planDraftMigration — idempotent + lossless", () => {
  test("a draft already on the server is skipped, not duplicated", () => {
    const a = instance({ instanceId: "wf_a" });
    const b = instance({ instanceId: "wf_b" });
    const plan = planDraftMigration({
      localInstances: [a, b],
      serverInstanceIds: ["wf_a"],
      sessionEmail: OWNER,
    });
    expect(plan.toPush.map((i) => i.instanceId)).toEqual(["wf_b"]);
    expect(plan.alreadyOnServer.map((i) => i.instanceId)).toEqual(["wf_a"]);
  });

  test("re-running after a full push pushes nothing (idempotent)", () => {
    const a = instance({ instanceId: "wf_a" });
    const b = instance({ instanceId: "wf_b" });
    const plan = planDraftMigration({
      localInstances: [a, b],
      serverInstanceIds: ["wf_a", "wf_b"], // both already migrated
      sessionEmail: OWNER,
    });
    expect(plan.toPush).toHaveLength(0);
    expect(plan.alreadyOnServer).toHaveLength(2);
  });

  test("lossless: every owned, not-yet-server draft is in toPush", () => {
    const owned = [
      instance({ instanceId: "wf_1" }),
      instance({ instanceId: "wf_2" }),
      instance({ instanceId: "wf_3" }),
    ];
    const plan = planDraftMigration({
      localInstances: owned,
      serverInstanceIds: ["wf_2"],
      sessionEmail: OWNER,
    });
    expect(plan.toPush.map((i) => i.instanceId)).toEqual(["wf_1", "wf_3"]);
  });
});

// ===========================================================================
// Cross-device unlock — a draft from "another device" reconciles into an
// Open-enabled card once the server feeds the DRAFT slice.
// ===========================================================================

function serverPage(over: Partial<ServerPageSummary> = {}): ServerPageSummary {
  return {
    slug: "slugLIVE0",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    propertyLine: "123 Main St, Austin",
    ...over,
  };
}

test.describe("cross-device Open is enabled once the draft is server-sourced", () => {
  test("a published page WITH no backing draft is cross-device (Open disabled)", () => {
    const cards = mergePages({
      serverPages: [serverPage({ slug: "remote00" })],
      instances: [], // pre-keystone: no local/server draft for it
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].instanceId).toBeUndefined();
    expect(isCrossDeviceOnly(cards[0])).toBe(true);
  });

  test("feeding the SAME page its server draft makes the card Open-enabled", () => {
    // This is the keystone: the DRAFT slice now comes from the server, so the
    // draft created on another device is present and backs the live card.
    const serverDraft = instance({
      instanceId: "wf_remote",
      publishedSlug: "remote00",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z", // == publishedAt ⇒ plain Live
      },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "remote00" })],
      instances: [serverDraft],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("live");
    expect(cards[0].instanceId).toBe("wf_remote"); // Open/Update now work
    expect(isCrossDeviceOnly(cards[0])).toBe(false);
  });

  test("a later cross-device edit lights up Live · edits pending", () => {
    const edited = instance({
      instanceId: "wf_remote",
      publishedSlug: "remote00",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z", // > publishedAt ⇒ pending
      },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "remote00" })],
      instances: [edited],
      sessionEmail: OWNER,
    });
    expect(cards[0].status).toBe("live-edits-pending");
    expect(cards[0].instanceId).toBe("wf_remote");
  });
});
