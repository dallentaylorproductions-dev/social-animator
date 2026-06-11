import { test, expect } from "@playwright/test";
import type { HandoutRecord } from "../src/lib/share-urls";
import type { WorkflowInstance } from "../src/skills/workflow-instance";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";
import {
  buildDuplicateDraft,
  bulkActionValidity,
  countLivePages,
  filterByTab,
  hasPendingEdits,
  isAtOrOverLiveCap,
  mergePages,
  projectHandoutSummary,
  publicUrlForSlug,
  tabCounts,
  type PageCard,
  type ServerPageSummary,
} from "../src/lib/seller-presentation/pages-library";
import {
  maxLivePagesCap,
  MAX_LIVE_PAGES_CAP_FALLBACK,
} from "../src/lib/entitlements/usage-caps";

/**
 * "Your pages" library — pure model unit tests (SP-LIB).
 *
 * Mirrors the median/caps specs: the derivation lives in a pure module
 * (src/lib/seller-presentation/pages-library.ts), so it runs as a
 * node-context Playwright spec — the only runner this repo has. Every
 * import that isn't a function is type-only (erased at compile).
 *
 * Coverage: status derivation incl. the load-bearing "Live · edits
 * pending"; agent-scoping of drafts (the hard privacy gate); only-Live
 * counts toward the cap; archive frees a slot; the soft at-limit seam;
 * the publish-summary projection; and the cap table.
 */

const OWNER = "agent@example.com";
const OTHER = "rival@example.com";

function draft(over: Partial<SellerPresentationDraft> = {}): SellerPresentationDraft {
  // Only the card-facing fields matter to the library; cast a partial so
  // the fixture stays readable (the module never touches the rest).
  return {
    propertyAddress: "123 Main St",
    propertyCity: "Austin",
    ...over,
  } as SellerPresentationDraft;
}

let seq = 0;
function instance(
  over: Partial<WorkflowInstance<SellerPresentationDraft>> = {},
): WorkflowInstance<SellerPresentationDraft> {
  seq += 1;
  const ts = `2026-06-01T00:00:0${seq % 10}.000Z`;
  return {
    instanceId: `wf_${seq}`,
    skillId: "seller-presentation",
    draft: draft(),
    resolvedPrimitives: {},
    timestamps: { createdAt: ts, updatedAt: ts },
    ownerEmail: OWNER,
    ...over,
  };
}

function serverPage(over: Partial<ServerPageSummary> = {}): ServerPageSummary {
  return {
    slug: "slug0001",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    propertyLine: "123 Main St, Austin",
    ...over,
  };
}

test.describe("status derivation", () => {
  test("no publishedSlug → Draft", () => {
    const cards = mergePages({
      serverPages: [],
      instances: [instance()],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("draft");
    expect(cards[0].slug).toBeUndefined();
    expect(cards[0].instanceId).toBe("wf_1");
  });

  test("publishedSlug + matching live server page → Live", () => {
    const inst = instance({
      publishedSlug: "slugLIVE0",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z", // == publishedAt → not pending
      },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "slugLIVE0" })],
      instances: [inst],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("live");
    expect(cards[0].slug).toBe("slugLIVE0");
    expect(cards[0].publicUrl).toBe("/h/slugLIVE0");
  });

  test("a draft edit after publish → Live · edits pending", () => {
    const inst = instance({
      publishedSlug: "slugLIVE1",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-03T09:00:00.000Z", // > publishedAt → pending
      },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "slugLIVE1" })],
      instances: [inst],
      sessionEmail: OWNER,
    });
    expect(cards[0].status).toBe("live-edits-pending");
  });

  test("archived server page → Archived (even with pending local edits)", () => {
    const inst = instance({
      publishedSlug: "slugARCH0",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "slugARCH0", archived: true })],
      instances: [inst],
      sessionEmail: OWNER,
    });
    expect(cards[0].status).toBe("archived");
  });

  test("locally-archived draft → Archived", () => {
    const inst = instance({ archivedAt: "2026-06-05T00:00:00.000Z" });
    const cards = mergePages({
      serverPages: [],
      instances: [inst],
      sessionEmail: OWNER,
    });
    expect(cards[0].status).toBe("archived");
  });

  test("stale publishedSlug (page gone from server) → Draft", () => {
    const inst = instance({ publishedSlug: "ghost000" });
    const cards = mergePages({
      serverPages: [], // server no longer lists it (revoked / deleted)
      instances: [inst],
      sessionEmail: OWNER,
    });
    expect(cards[0].status).toBe("draft");
  });

  test("server page with no local instance → standalone Live, no resume", () => {
    const cards = mergePages({
      serverPages: [serverPage({ slug: "remote00" })],
      instances: [],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("live");
    expect(cards[0].instanceId).toBeUndefined(); // can't Continue/Open
    expect(cards[0].slug).toBe("remote00");
  });
});

test.describe("hasPendingEdits", () => {
  test("never pending without a publish", () => {
    expect(hasPendingEdits(instance())).toBe(false);
  });
  test("equal timestamps → not pending", () => {
    expect(
      hasPendingEdits(
        instance({
          publishedAt: "2026-06-02T00:00:00.000Z",
          timestamps: {
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
  });
});

test.describe("agent-scoping (hard privacy gate)", () => {
  test("a draft owned by another agent is never shown", () => {
    const mine = instance({ ownerEmail: OWNER });
    const theirs = instance({ ownerEmail: OTHER });
    const cards = mergePages({
      serverPages: [],
      instances: [mine, theirs],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].instanceId).toBe(mine.instanceId);
  });

  test("an unowned (legacy) draft is never shown", () => {
    const legacy = instance({ ownerEmail: undefined });
    const cards = mergePages({
      serverPages: [],
      instances: [legacy],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(0);
  });

  test("no session → no drafts surface at all", () => {
    const cards = mergePages({
      serverPages: [],
      instances: [instance()],
      sessionEmail: null,
    });
    expect(cards).toHaveLength(0);
  });

  test("non-SP instances are ignored", () => {
    const other = instance({
      skillId: "open-house-prep" as WorkflowInstance["skillId"],
    });
    const cards = mergePages({
      serverPages: [],
      instances: [other],
      sessionEmail: OWNER,
    });
    expect(cards).toHaveLength(0);
  });
});

test.describe("cap meter + soft seam", () => {
  test("only Live (non-archived) server pages count", () => {
    const pages = [
      serverPage({ slug: "a", archived: false }),
      serverPage({ slug: "b", archived: false }),
      serverPage({ slug: "c", archived: true }), // archived → free
    ];
    expect(countLivePages(pages)).toBe(2);
  });

  test("archive frees a slot, restore uses one", () => {
    const live = serverPage({ slug: "x", archived: false });
    expect(countLivePages([live])).toBe(1);
    const archived = { ...live, archived: true };
    expect(countLivePages([archived])).toBe(0);
  });

  test("at-limit seam is a >= boundary (shown, not enforced)", () => {
    expect(isAtOrOverLiveCap(2, 3)).toBe(false);
    expect(isAtOrOverLiveCap(3, 3)).toBe(true);
    expect(isAtOrOverLiveCap(4, 3)).toBe(true);
  });
});

test.describe("publish summary projection", () => {
  test("pulls cover + lines from the public payload only", () => {
    const record: HandoutRecord = {
      slug: "proj0001",
      type: "seller-presentation",
      ownerEmail: OWNER,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
      archived: true,
      data: {
        propertyAddress: "9 Oak Ave",
        propertyCity: "Round Rock",
        preparedFor: "The Reyes Family",
        property: { heroPhotoUrl: "https://img/cover.jpg" },
        // A private field would never be in `data` (allowlist), but prove
        // the projection ignores anything it isn't told to read:
        confidence: "high",
      },
    };
    const summary = projectHandoutSummary(record);
    expect(summary.slug).toBe("proj0001");
    expect(summary.archived).toBe(true);
    expect(summary.cover).toBe("https://img/cover.jpg");
    expect(summary.propertyLine).toBe("9 Oak Ave, Round Rock");
    expect(summary.sellerLine).toBe("The Reyes Family");
    expect(summary.updatedAt).toBe("2026-06-04T00:00:00.000Z");
  });
});

test.describe("misc helpers", () => {
  test("publicUrlForSlug", () => {
    expect(publicUrlForSlug("abc")).toBe("/h/abc");
  });

  test("cap table: internal-test generous, unknown mode → fallback", () => {
    expect(maxLivePagesCap("internal-test")).toBe(100);
    expect(maxLivePagesCap("trial")).toBe(3);
    expect(maxLivePagesCap(undefined)).toBe(MAX_LIVE_PAGES_CAP_FALLBACK);
    expect(maxLivePagesCap("nonsense")).toBe(MAX_LIVE_PAGES_CAP_FALLBACK);
  });

  test("most-recent-first ordering (active)", () => {
    const older = instance({
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    const newer = instance({
      timestamps: {
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    });
    const cards = mergePages({
      serverPages: [],
      instances: [older, newer],
      sessionEmail: OWNER,
    });
    expect(cards.map((c) => c.instanceId)).toEqual([
      newer.instanceId,
      older.instanceId,
    ]);
  });
});

// ===========================================================================
// Library v2 — organization + management (SP-LIB-2).
// ===========================================================================

function card(over: Partial<PageCard> = {}): PageCard {
  return {
    key: "k",
    status: "draft",
    propertyLine: "123 Main St",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

test.describe("tabs: Active / Archived split", () => {
  test("Active excludes archived; Archived holds only archived", () => {
    const cards = [
      card({ key: "d", status: "draft" }),
      card({ key: "l", status: "live" }),
      card({ key: "p", status: "live-edits-pending" }),
      card({ key: "a", status: "archived" }),
    ];
    expect(filterByTab(cards, "active").map((c) => c.key)).toEqual([
      "d",
      "l",
      "p",
    ]);
    expect(filterByTab(cards, "archived").map((c) => c.key)).toEqual(["a"]);
  });

  test("counts reflect the split", () => {
    const cards = [
      card({ key: "d", status: "draft" }),
      card({ key: "l", status: "live" }),
      card({ key: "a1", status: "archived" }),
      card({ key: "a2", status: "archived" }),
    ];
    expect(tabCounts(cards)).toEqual({ active: 2, archived: 2 });
  });

  test("archiving a draft moves it OUT of Active into Archived", () => {
    // The draft instance, then the SAME instance after a local archive.
    const before = mergePages({
      serverPages: [],
      instances: [instance({ instanceId: "wf_a" })],
      sessionEmail: OWNER,
    });
    expect(filterByTab(before, "active")).toHaveLength(1);
    expect(filterByTab(before, "archived")).toHaveLength(0);

    const after = mergePages({
      serverPages: [],
      instances: [
        instance({ instanceId: "wf_a", archivedAt: "2026-06-05T00:00:00.000Z" }),
      ],
      sessionEmail: OWNER,
    });
    expect(filterByTab(after, "active")).toHaveLength(0);
    expect(filterByTab(after, "archived")).toHaveLength(1);
  });

  test("Active preserves mergePages order; a recently-archived card never appears", () => {
    // filterByTab("active") does NOT re-sort — it preserves the most-recent-
    // first order mergePages already produced. The point: an archived card,
    // even with the freshest timestamp, is filtered OUT of Active entirely, so
    // archiving can never bump the Active order.
    const newer = card({ key: "new", updatedAt: "2026-06-08T00:00:00.000Z" });
    const older = card({ key: "old", updatedAt: "2026-06-01T00:00:00.000Z" });
    const archivedRecent = card({
      key: "arch",
      status: "archived",
      updatedAt: "2026-06-09T00:00:00.000Z",
      archivedAt: "2026-06-09T00:00:00.000Z",
    });
    // Input is in mergePages order (most-recent-first), archived last.
    const active = filterByTab([newer, older, archivedRecent], "active");
    expect(active.map((c) => c.key)).toEqual(["new", "old"]);
  });

  test("Archived is ordered most-recently-archived first", () => {
    const a = card({
      key: "a",
      status: "archived",
      archivedAt: "2026-06-02T00:00:00.000Z",
    });
    const b = card({
      key: "b",
      status: "archived",
      archivedAt: "2026-06-09T00:00:00.000Z",
    });
    const c = card({
      key: "c",
      status: "archived",
      archivedAt: "2026-06-05T00:00:00.000Z",
    });
    expect(filterByTab([a, b, c], "archived").map((x) => x.key)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

test.describe("duplicate is always a fresh, unpublished Draft", () => {
  test("deep-clones content and renames to 'Copy of <address>'", () => {
    const source = draft({
      propertyAddress: "9 Oak Ave",
      comps: [{ id: "c1" }] as unknown as SellerPresentationDraft["comps"],
    });
    const dup = buildDuplicateDraft(source);
    expect(dup.propertyAddress).toBe("Copy of 9 Oak Ave");
    // Deep clone: mutating the copy's nested content never touches the source.
    (dup.comps as unknown[]).push({ id: "c2" });
    expect((source.comps as unknown[]).length).toBe(1);
  });

  test("falls back to a neutral name when the source has no address", () => {
    const dup = buildDuplicateDraft(draft({ propertyAddress: undefined }));
    expect(dup.propertyAddress).toBe("Copy of page");
  });

  test("duplicating a Live page yields a Draft; original stays Live + keeps its slug", () => {
    // Original: a live instance backed by its server page.
    const original = instance({
      instanceId: "wf_orig",
      publishedSlug: "liveSLUG",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    });
    // The duplicate is a brand-new instance with NO publishedSlug (createInstance
    // never carries one) — modeled here as a fresh instance off the cloned draft.
    const dup = instance({
      instanceId: "wf_dup",
      draft: buildDuplicateDraft(original.draft),
      publishedSlug: undefined,
      publishedAt: undefined,
      timestamps: {
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "liveSLUG" })],
      instances: [original, dup],
      sessionEmail: OWNER,
    });
    const orig = cards.find((c) => c.instanceId === "wf_orig");
    const copy = cards.find((c) => c.instanceId === "wf_dup");
    expect(orig?.status).toBe("live");
    expect(orig?.slug).toBe("liveSLUG"); // seller link untouched
    expect(copy?.status).toBe("draft");
    expect(copy?.slug).toBeUndefined(); // no link minted for the copy
  });
});

test.describe("bulk action validity (mirrors single-card rules)", () => {
  test("empty selection disables both actions", () => {
    expect(bulkActionValidity([])).toEqual({
      canArchive: false,
      canDelete: false,
    });
  });

  test("Draft + Live selection: archive OK, delete blocked (live present)", () => {
    const v = bulkActionValidity([
      card({ status: "draft" }),
      card({ status: "live" }),
    ]);
    expect(v.canArchive).toBe(true);
    expect(v.canDelete).toBe(false);
    expect(v.deleteReason).toMatch(/archive live pages/i);
  });

  test("edits-pending counts as live for delete-block", () => {
    const v = bulkActionValidity([card({ status: "live-edits-pending" })]);
    expect(v.canDelete).toBe(false);
    expect(v.canArchive).toBe(true);
  });

  test("Draft + Archived selection: delete OK, archive blocked (already archived)", () => {
    const v = bulkActionValidity([
      card({ status: "draft" }),
      card({ status: "archived" }),
    ]);
    expect(v.canDelete).toBe(true);
    expect(v.canArchive).toBe(false);
    expect(v.archiveReason).toMatch(/already archived/i);
  });

  test("all-Draft selection: both actions valid", () => {
    const v = bulkActionValidity([
      card({ status: "draft" }),
      card({ status: "draft" }),
    ]);
    expect(v.canArchive).toBe(true);
    expect(v.canDelete).toBe(true);
  });
});
