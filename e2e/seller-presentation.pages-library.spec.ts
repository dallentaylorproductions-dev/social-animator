import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
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
  isCrossDeviceOnly,
  isViewMode,
  LIBRARY_MOBILE_MAX_WIDTH,
  listMetaLine,
  LONG_PRESS_MOVE_CANCEL_PX,
  LONG_PRESS_MS,
  mergePages,
  movedBeyond,
  projectHandoutSummary,
  publicUrlForSlug,
  relativeTimeAgo,
  resolveViewMode,
  secondaryRowActions,
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
  test("empty selection disables every action", () => {
    expect(bulkActionValidity([])).toEqual({
      canArchive: false,
      canRestore: false,
      canDelete: false,
    });
  });

  test("Draft + Live selection: archive OK, delete + restore blocked (live present)", () => {
    const v = bulkActionValidity([
      card({ status: "draft" }),
      card({ status: "live" }),
    ]);
    expect(v.canArchive).toBe(true);
    expect(v.canDelete).toBe(false);
    expect(v.canRestore).toBe(false);
    expect(v.deleteReason).toMatch(/archive live pages/i);
  });

  test("live-only selection: archive only, no delete + no restore (Cockpit fix #8)", () => {
    const v = bulkActionValidity([
      card({ status: "live" }),
      card({ status: "live-edits-pending" }),
    ]);
    expect(v.canArchive).toBe(true);
    expect(v.canDelete).toBe(false);
    expect(v.canRestore).toBe(false);
  });

  test("edits-pending counts as live for delete-block", () => {
    const v = bulkActionValidity([card({ status: "live-edits-pending" })]);
    expect(v.canDelete).toBe(false);
    expect(v.canArchive).toBe(true);
    expect(v.canRestore).toBe(false);
  });

  test("Draft + Archived selection: delete OK, archive + restore blocked", () => {
    const v = bulkActionValidity([
      card({ status: "draft" }),
      card({ status: "archived" }),
    ]);
    expect(v.canDelete).toBe(true);
    expect(v.canArchive).toBe(false);
    // Restore needs the WHOLE selection archived — a draft has nothing to restore.
    expect(v.canRestore).toBe(false);
    expect(v.archiveReason).toMatch(/already archived/i);
  });

  test("all-Archived selection: restore + delete valid, archive blocked", () => {
    const v = bulkActionValidity([
      card({ status: "archived" }),
      card({ status: "archived" }),
    ]);
    expect(v.canRestore).toBe(true);
    expect(v.canDelete).toBe(true);
    expect(v.canArchive).toBe(false);
  });

  test("all-Draft selection: archive + delete valid, no restore", () => {
    const v = bulkActionValidity([
      card({ status: "draft" }),
      card({ status: "draft" }),
    ]);
    expect(v.canArchive).toBe(true);
    expect(v.canDelete).toBe(true);
    expect(v.canRestore).toBe(false);
  });
});

// ===========================================================================
// Library v3 — Cards / List view (SP-LIB-3).
// ===========================================================================

test.describe("view mode: default-by-viewport + saved-choice override", () => {
  test("no saved choice → List on mobile width, Cards on desktop", () => {
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH)).toBe("list");
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH - 1)).toBe("list");
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH + 1)).toBe("cards");
    expect(resolveViewMode(null, 1280)).toBe("cards");
  });

  test("an explicit saved choice always wins over the viewport default", () => {
    // Saved "cards" on a phone, saved "list" on a desktop — the choice sticks.
    expect(resolveViewMode("cards", 360)).toBe("cards");
    expect(resolveViewMode("list", 1440)).toBe("list");
  });

  test("a junk saved value falls back to the viewport default", () => {
    expect(resolveViewMode("garbage", 360)).toBe("list");
    expect(resolveViewMode("", 1440)).toBe("cards");
  });

  test("isViewMode guards the stored value", () => {
    expect(isViewMode("cards")).toBe(true);
    expect(isViewMode("list")).toBe(true);
    expect(isViewMode("grid")).toBe(false);
    expect(isViewMode(null)).toBe(false);
  });
});

test.describe("row '⋯' menu = the card's secondary actions, per status", () => {
  test("Draft: archive, duplicate, delete (no view/copy, no update)", () => {
    expect(secondaryRowActions(card({ status: "draft", instanceId: "wf_1" }))).toEqual([
      "archive",
      "duplicate",
      "delete",
    ]);
  });

  test("Live: view, copy, archive, duplicate (NEVER delete)", () => {
    expect(
      secondaryRowActions(
        card({ status: "live", instanceId: "wf_1", slug: "s1" }),
      ),
    ).toEqual(["view-live", "copy-link", "archive", "duplicate"]);
  });

  test("Live · edits pending: update-live leads, then view/copy/archive/duplicate", () => {
    expect(
      secondaryRowActions(
        card({ status: "live-edits-pending", instanceId: "wf_1", slug: "s1" }),
      ),
    ).toEqual([
      "update-live",
      "view-live",
      "copy-link",
      "archive",
      "duplicate",
    ]);
  });

  test("Archived: duplicate + delete only (Restore is the row tap, never Archive)", () => {
    expect(
      secondaryRowActions(
        card({ status: "archived", instanceId: "wf_1", slug: "s1" }),
      ),
    ).toEqual(["duplicate", "delete"]);
  });

  test("standalone Live page (no local draft): view + copy + archive, no duplicate", () => {
    // No instanceId → can't resume → no Duplicate (matches the card rule).
    expect(secondaryRowActions(card({ status: "live", slug: "s1" }))).toEqual([
      "view-live",
      "copy-link",
      "archive",
    ]);
  });

  test("standalone Archived page (no local draft): delete only", () => {
    expect(secondaryRowActions(card({ status: "archived", slug: "s1" }))).toEqual([
      "delete",
    ]);
  });

  test("Delete is offered ONLY on Draft + Archived, never on Live or edits-pending", () => {
    const has = (c: PageCard) => secondaryRowActions(c).includes("delete");
    expect(has(card({ status: "draft", instanceId: "wf_1" }))).toBe(true);
    expect(has(card({ status: "archived", instanceId: "wf_1" }))).toBe(true);
    expect(has(card({ status: "live", instanceId: "wf_1", slug: "s" }))).toBe(false);
    expect(
      has(card({ status: "live-edits-pending", instanceId: "wf_1", slug: "s" })),
    ).toBe(false);
  });
});

test.describe("row meta line", () => {
  const NOW = Date.parse("2026-06-10T00:00:00.000Z");

  test("draft → 'Started X ago'", () => {
    const c = card({ status: "draft", updatedAt: "2026-06-08T00:00:00.000Z" });
    expect(listMetaLine(c, NOW)).toBe("Started 2 days ago");
  });

  test("live → 'seller · N views' when both present", () => {
    const c = card({
      status: "live",
      sellerLine: "The Reyes Family",
      viewCount: 12,
    });
    expect(listMetaLine(c, NOW)).toBe("The Reyes Family · 12 views");
  });

  test("live with seller, views not tracked → just the seller", () => {
    const c = card({ status: "live", sellerLine: "The Reyes Family" });
    expect(listMetaLine(c, NOW)).toBe("The Reyes Family");
  });

  test("live with neither seller nor views → 'Live X ago'", () => {
    const c = card({ status: "live", updatedAt: "2026-06-09T00:00:00.000Z" });
    expect(listMetaLine(c, NOW)).toBe("Live 1 day ago");
  });

  test("archived → 'Archived X ago' by archivedAt (not updatedAt)", () => {
    const c = card({
      status: "archived",
      archivedAt: "2026-06-06T00:00:00.000Z", // 4 days before NOW
      updatedAt: "2026-06-01T00:00:00.000Z", // older — must be ignored
    });
    expect(listMetaLine(c, NOW)).toBe("Archived 4 days ago");
  });

  test("singular view count is not pluralized", () => {
    const c = card({ status: "live", sellerLine: "Sam", viewCount: 1 });
    expect(listMetaLine(c, NOW)).toBe("Sam · 1 view");
  });
});

test.describe("relativeTimeAgo buckets", () => {
  const NOW = Date.parse("2026-06-10T12:00:00.000Z");
  const ago = (ms: number) => relativeTimeAgo(new Date(NOW - ms).toISOString(), NOW);

  test("sub-minute reads 'just now'; future (clock skew) too", () => {
    expect(ago(30_000)).toBe("just now");
    expect(relativeTimeAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe("just now");
  });

  test("minutes / hours / days / weeks / months / years", () => {
    expect(ago(5 * 60_000)).toBe("5 minutes ago");
    expect(ago(60 * 60_000)).toBe("1 hour ago");
    expect(ago(3 * 24 * 60 * 60_000)).toBe("3 days ago");
    expect(ago(2 * 7 * 24 * 60 * 60_000)).toBe("2 weeks ago");
    expect(ago(2 * 30 * 24 * 60 * 60_000)).toBe("2 months ago");
    expect(ago(400 * 24 * 60 * 60_000)).toBe("1 year ago");
  });

  test("unparseable input → empty string", () => {
    expect(relativeTimeAgo("not-a-date", NOW)).toBe("");
  });
});

// ===========================================================================
// Library v4 — list polish: long-press select + cross-device tap (SP-LIB-4).
// ===========================================================================

test.describe("long-press movement threshold", () => {
  test("constants are sane (held > 0, drift > 0)", () => {
    expect(LONG_PRESS_MS).toBeGreaterThan(0);
    expect(LONG_PRESS_MOVE_CANCEL_PX).toBeGreaterThan(0);
  });

  test("a stationary (or sub-threshold) press does NOT cancel", () => {
    // exactly at the threshold is still a press (strict >), as is no movement.
    expect(movedBeyond(100, 100, 100, 100)).toBe(false);
    expect(
      movedBeyond(100, 100, 100 + LONG_PRESS_MOVE_CANCEL_PX, 100),
    ).toBe(false);
    expect(
      movedBeyond(100, 100, 100, 100 - LONG_PRESS_MOVE_CANCEL_PX),
    ).toBe(false);
  });

  test("a drag past the threshold on EITHER axis cancels", () => {
    expect(
      movedBeyond(100, 100, 100 + LONG_PRESS_MOVE_CANCEL_PX + 1, 100),
    ).toBe(true); // horizontal
    expect(
      movedBeyond(100, 100, 100, 100 + LONG_PRESS_MOVE_CANCEL_PX + 1),
    ).toBe(true); // vertical (a scroll)
  });

  test("a custom threshold overrides the default", () => {
    expect(movedBeyond(0, 0, 5, 0, 4)).toBe(true);
    expect(movedBeyond(0, 0, 4, 0, 4)).toBe(false);
  });
});

test.describe("isCrossDeviceOnly (published elsewhere, no local draft)", () => {
  test("a standalone Live page (no instance) is cross-device", () => {
    expect(isCrossDeviceOnly(card({ status: "live", slug: "s1" }))).toBe(true);
  });

  test("a Live page WITH a local draft is NOT cross-device", () => {
    expect(
      isCrossDeviceOnly(card({ status: "live", slug: "s1", instanceId: "wf_1" })),
    ).toBe(false);
  });

  test("Draft / Archived are never cross-device (their primary always works)", () => {
    expect(isCrossDeviceOnly(card({ status: "draft", instanceId: "wf_1" }))).toBe(
      false,
    );
    expect(isCrossDeviceOnly(card({ status: "archived", slug: "s1" }))).toBe(
      false,
    );
  });

  test("an edits-pending card always has an instance, so never cross-device", () => {
    expect(
      isCrossDeviceOnly(
        card({ status: "live-edits-pending", slug: "s1", instanceId: "wf_1" }),
      ),
    ).toBe(false);
  });
});

// ===========================================================================
// Select-mode checkbox visual (SP-LIB-4 fix). The selected fill + checkmark
// MUST be driven by the shared `data-checked` state, not a CSS
// `.lib-check input:checked + .lib-check-box` sibling rule — that rule only
// reached the Cards box and left every List-row checkbox stuck empty on mobile
// (where List is the default). These are pure-Node source/CSS contract checks:
// the library is flag-gated OFF, so the browser harness never renders it (same
// reason the rest of this file is node-context). They fail loudly if anyone
// reverts to the layout-scoped approach.
// ===========================================================================

test.describe("select-mode checkbox is bound to selected state in BOTH layouts", () => {
  const tsx = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
    "utf8",
  );
  const css = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/pages-library.css"),
    "utf8",
  );

  test("both checkbox sites bind the box fill to `checked` and render the glyph", () => {
    // Cards (.lib-check), List (.lib-row-check), AND the Manage table's per-row
    // bulk checkbox (PAGES_MANAGE_LIST Packet 2) each render the box with the
    // SAME data-checked binding + conditional CheckGlyph — three occurrences each,
    // never a layout-scoped fork.
    const dataBound = tsx.match(/data-checked=\{checked \? "true" : undefined\}/g);
    expect(dataBound?.length).toBe(3);
    const glyph = tsx.match(/\{checked && <CheckGlyph \/>\}/g);
    expect(glyph?.length).toBe(3);
    // The glyph component exists.
    expect(tsx).toContain("function CheckGlyph()");
  });

  test("the filled state is keyed off data-checked, shared across both boxes", () => {
    expect(css).toContain('.lib-check-box[data-checked="true"]');
    // The brittle, Cards-only sibling rules that left List empty are gone.
    expect(css).not.toContain(".lib-check input:checked + .lib-check-box");
  });
});
