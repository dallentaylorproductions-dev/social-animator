import { test, expect } from "@playwright/test";
import type { HandoutRecord } from "../src/lib/share-urls";
import type { WorkflowInstance } from "../src/skills/workflow-instance";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";
import {
  countLivePages,
  hasPendingEdits,
  isAtOrOverLiveCap,
  mergePages,
  projectHandoutSummary,
  publicUrlForSlug,
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

  test("most-recent-first ordering", () => {
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
