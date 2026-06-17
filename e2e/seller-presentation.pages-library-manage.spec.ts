import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  DEFAULT_MANAGE_SORT,
  MANAGE_EMPTY,
  MANAGE_LIST_COLUMNS,
  defaultDirFor,
  lastActivityAt,
  manageClientText,
  manageFollowUpText,
  manageLastActivityText,
  manageUpdatedText,
  nextManageSort,
  sortManageList,
  type ManageSort,
  type PageCard,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Pages Library — management List, Packet 1 (PAGES_MANAGE_LIST).
 *
 * Packet 1 revives a dense, sortable management TABLE behind a desktop-only
 * "Manage" mode, composed on top of the V3 cockpit (Cards stays the primary +
 * the only mobile view). It is pure derivation + flag gating, so — consistent
 * with how the v2/v3 passes were pinned (the e2e harness renders the WIZARD on
 * the bare route, library flag off) — this runs as a node-context spec:
 *
 *   1. PURE: the per-column comparators (incl. the pinned `followUpAt ??
 *      lastViewedAt ?? updatedAt` Last-activity fallback), the stable + total
 *      sort (deterministic `key` tiebreak), the header-click toggle, and the
 *      empty-graceful cell text for the optional / flag-gated columns.
 *   2. SOURCE-CONTRACT: the flag is read + threaded, the Manage affordance + the
 *      table are gated desktop-only AND `PAGES_MANAGE_LIST`-only, the 7-column
 *      set is the single source of truth, flag-off is byte-identical, and the
 *      Pass-3c `showViewToggle = !libraryV3Enabled` guarantee still holds.
 *
 * The in-browser verification (Manage opens the table, columns sort, per-row
 * actions work, empty cells graceful, mobile hidden, flag-off identical) is the
 * preview check the packet assigns to Cowork, with PAGES_MANAGE_LIST=true.
 */

const NOW = Date.parse("2026-06-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const isoBefore = (ms: number) => new Date(NOW - ms).toISOString();

function card(over: Partial<PageCard> = {}): PageCard {
  return {
    key: "k",
    status: "live",
    propertyLine: "123 Main St",
    updatedAt: isoBefore(3 * HOUR),
    ...over,
  };
}

const keysOf = (cards: PageCard[]) => cards.map((c) => c.key);

// ── per-column comparators (asc/desc), via the public sort ──

test.describe("sortManageList — one comparator per sortable column", () => {
  test("address: alphabetical by propertyLine", () => {
    const cards = [
      card({ key: "c", propertyLine: "900 Oak Ave" }),
      card({ key: "a", propertyLine: "100 Elm St" }),
      card({ key: "b", propertyLine: "500 Birch Rd" }),
    ];
    expect(
      keysOf(sortManageList(cards, { column: "address", dir: "asc" })),
    ).toEqual(["a", "b", "c"]);
    expect(
      keysOf(sortManageList(cards, { column: "address", dir: "desc" })),
    ).toEqual(["c", "b", "a"]);
  });

  test("client: by sellerLine, empties grouped (asc puts them first)", () => {
    const cards = [
      card({ key: "z", sellerLine: "Zimmer" }),
      card({ key: "a", sellerLine: "Adams" }),
      card({ key: "none" }), // no sellerLine ⇒ "" sorts first in asc
    ];
    expect(
      keysOf(sortManageList(cards, { column: "client", dir: "asc" })),
    ).toEqual(["none", "a", "z"]);
  });

  test("state: semantic rank live < edits-pending < draft < archived", () => {
    const cards = [
      card({ key: "arch", status: "archived" }),
      card({ key: "draft", status: "draft" }),
      card({ key: "live", status: "live" }),
      card({ key: "pend", status: "live-edits-pending" }),
    ];
    expect(
      keysOf(sortManageList(cards, { column: "state", dir: "asc" })),
    ).toEqual(["live", "pend", "draft", "arch"]);
  });

  test("updated: most-recent first under desc (today's base ordering)", () => {
    const cards = [
      card({ key: "old", updatedAt: isoBefore(5 * DAY) }),
      card({ key: "new", updatedAt: isoBefore(1 * HOUR) }),
      card({ key: "mid", updatedAt: isoBefore(2 * DAY) }),
    ];
    expect(
      keysOf(sortManageList(cards, { column: "updated", dir: "desc" })),
    ).toEqual(["new", "mid", "old"]);
  });

  test("follow-up: worth-a-follow-up pages outrank the rest, then by recency", () => {
    const cards = [
      card({ key: "plain" }), // not worth a follow-up
      card({
        key: "older",
        worthFollowUp: true,
        followUpAt: isoBefore(2 * DAY),
      }),
      card({
        key: "newer",
        worthFollowUp: true,
        followUpAt: isoBefore(1 * HOUR),
      }),
    ];
    // desc: the strongest follow-up (most recent) leads; the plain page sinks.
    expect(
      keysOf(sortManageList(cards, { column: "followUp", dir: "desc" })),
    ).toEqual(["newer", "older", "plain"]);
  });
});

// ── the pinned Last-activity fallback: followUpAt ?? lastViewedAt ?? updatedAt ──

test.describe("Last activity — the pinned fallback chain", () => {
  test("lastActivityAt prefers followUpAt, then lastViewedAt, then updatedAt", () => {
    expect(
      lastActivityAt(
        card({
          followUpAt: "2026-01-01T00:00:00.000Z",
          lastViewedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      ),
    ).toBe("2026-01-01T00:00:00.000Z");

    expect(
      lastActivityAt(
        card({
          lastViewedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      ),
    ).toBe("2025-01-01T00:00:00.000Z");

    expect(lastActivityAt(card({ updatedAt: "2024-01-01T00:00:00.000Z" }))).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  test("sort uses the fallback: an unopened page still orders by updatedAt", () => {
    const cards = [
      // No view / follow-up signal ⇒ falls back to a VERY recent updatedAt.
      card({ key: "fresh-update", updatedAt: isoBefore(1 * HOUR) }),
      // Opened long ago, but that lastViewedAt is what it sorts on.
      card({
        key: "stale-view",
        updatedAt: isoBefore(10 * DAY),
        lastViewedAt: isoBefore(6 * DAY),
      }),
      // A recent follow-up beats both.
      card({
        key: "recent-followup",
        updatedAt: isoBefore(9 * DAY),
        followUpAt: isoBefore(30 * 60 * 1000),
      }),
    ];
    expect(
      keysOf(sortManageList(cards, { column: "lastActivity", dir: "desc" })),
    ).toEqual(["recent-followup", "fresh-update", "stale-view"]);
  });
});

// ── stable, total, deterministic ──

test.describe("sortManageList — stable + deterministic tiebreak", () => {
  test("equal-on-column rows break by key ascending, regardless of dir", () => {
    const same = isoBefore(2 * DAY);
    const cards = [
      card({ key: "c", updatedAt: same }),
      card({ key: "a", updatedAt: same }),
      card({ key: "b", updatedAt: same }),
    ];
    // The tiebreak is ALWAYS ascending by key, so asc and desc agree on ties.
    expect(
      keysOf(sortManageList(cards, { column: "updated", dir: "asc" })),
    ).toEqual(["a", "b", "c"]);
    expect(
      keysOf(sortManageList(cards, { column: "updated", dir: "desc" })),
    ).toEqual(["a", "b", "c"]);
  });

  test("non-mutating: the input order is untouched", () => {
    const cards = [
      card({ key: "c", propertyLine: "C" }),
      card({ key: "a", propertyLine: "A" }),
    ];
    const before = keysOf(cards);
    sortManageList(cards, { column: "address", dir: "asc" });
    expect(keysOf(cards)).toEqual(before);
  });
});

// ── header-click toggle ──

test.describe("nextManageSort + defaultDirFor — header-click cycling", () => {
  test("default sort opens on Updated desc (today's base ordering)", () => {
    expect(DEFAULT_MANAGE_SORT).toEqual({ column: "updated", dir: "desc" });
  });

  test("time + follow-up columns default to desc; text/status to asc", () => {
    expect(defaultDirFor("updated")).toBe("desc");
    expect(defaultDirFor("lastActivity")).toBe("desc");
    expect(defaultDirFor("followUp")).toBe("desc");
    expect(defaultDirFor("address")).toBe("asc");
    expect(defaultDirFor("client")).toBe("asc");
    expect(defaultDirFor("state")).toBe("asc");
  });

  test("re-clicking the active column flips direction", () => {
    const start: ManageSort = { column: "address", dir: "asc" };
    const flipped = nextManageSort(start, "address");
    expect(flipped).toEqual({ column: "address", dir: "desc" });
    expect(nextManageSort(flipped, "address")).toEqual({
      column: "address",
      dir: "asc",
    });
  });

  test("clicking a NEW column adopts its natural default direction", () => {
    expect(nextManageSort({ column: "address", dir: "desc" }, "updated")).toEqual(
      { column: "updated", dir: "desc" },
    );
    expect(
      nextManageSort({ column: "updated", dir: "asc" }, "client"),
    ).toEqual({ column: "client", dir: "asc" });
  });
});

// ── empty-graceful cell text for the optional / flag-gated columns ──

test.describe("empty-graceful cells — viewed-signal fields absent", () => {
  test("Client: the seller line, else the empty dash", () => {
    expect(manageClientText(card({ sellerLine: "Jordan Lee" }))).toBe(
      "Jordan Lee",
    );
    expect(manageClientText(card())).toBe(MANAGE_EMPTY);
  });

  test("Last activity: relative open time, else the empty dash", () => {
    expect(
      manageLastActivityText(card({ lastViewedAt: isoBefore(2 * HOUR) }), NOW),
    ).toBe("2 hours ago");
    // Never opened (flag-off shape) ⇒ intentional empty, even though it still
    // SORTS by updatedAt under lastActivityAt.
    expect(manageLastActivityText(card(), NOW)).toBe(MANAGE_EMPTY);
  });

  test("Follow-up: recency when worth it, plain label without a stamp, else dash", () => {
    expect(
      manageFollowUpText(
        card({ worthFollowUp: true, followUpAt: isoBefore(1 * HOUR) }),
        NOW,
      ),
    ).toBe("1 hour ago");
    expect(manageFollowUpText(card({ worthFollowUp: true }), NOW)).toBe(
      "Worth a follow-up",
    );
    expect(manageFollowUpText(card(), NOW)).toBe(MANAGE_EMPTY);
  });

  test("Updated: always present (updatedAt is never empty)", () => {
    expect(manageUpdatedText(card({ updatedAt: isoBefore(1 * DAY) }), NOW)).toBe(
      "1 day ago",
    );
  });
});

// ── the 7-column contract ──

test.describe("MANAGE_LIST_COLUMNS — the single source of truth", () => {
  test("exactly the 7 columns, in order", () => {
    expect(MANAGE_LIST_COLUMNS.map((c) => c.key)).toEqual([
      "address",
      "client",
      "state",
      "lastActivity",
      "followUp",
      "updated",
      "actions",
    ]);
    expect(MANAGE_LIST_COLUMNS.map((c) => c.label)).toEqual([
      "Address",
      "Client",
      "State",
      "Last activity",
      "Follow-up",
      "Updated",
      "Actions",
    ]);
  });

  test("only Follow-up earns the teal accent; only Actions is non-sortable", () => {
    const accented = MANAGE_LIST_COLUMNS.filter((c) => c.accent);
    expect(accented.map((c) => c.key)).toEqual(["followUp"]);
    const nonSortable = MANAGE_LIST_COLUMNS.filter((c) => !c.sortable);
    expect(nonSortable.map((c) => c.key)).toEqual(["actions"]);
  });
});

// ── flag-off / desktop-only byte-identical: source-contract guards ──

test.describe("PAGES_MANAGE_LIST is gated (flag-off + mobile byte-identical)", () => {
  const tsx = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
    "utf8",
  );
  const page = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/page.tsx"),
    "utf8",
  );

  test("the page reads the PAGES_MANAGE_LIST env flag and threads it down", () => {
    expect(page).toContain('process.env.PAGES_MANAGE_LIST === "true"');
    expect(page).toContain("manageListEnabled={manageListEnabled}");
  });

  test("the Manage affordance + table are gated desktop-only AND flag-only", () => {
    // The affordance shows only under the flag AND on a desktop viewport; the
    // table renders only while ALSO toggled on. Flag-off ⇒ both are false, so the
    // render is byte-identical to today's V3 cockpit.
    expect(tsx).toContain(
      "const showManageAffordance = manageListEnabled && manageDesktop;",
    );
    expect(tsx).toContain(
      "const showManageTable = showManageAffordance && manageMode;",
    );
    expect(tsx).toContain("{showManageAffordance && !loading && cards.length > 0 && (");
    // The table replaces the cards in the body switch only when showManageTable.
    expect(tsx).toContain(") : showManageTable ? (");
  });

  test("the desktop guard has its OWN matchMedia, gated on its OWN flag", () => {
    // Independent of PAGES_CARD_EXPAND, so "desktop-only" is reliable regardless
    // of that flag (the packet's isNarrow-reliability requirement).
    expect(tsx).toContain(
      "if (!manageListEnabled || typeof window === \"undefined\") return;",
    );
    expect(tsx).toContain('window.matchMedia("(min-width: 960px)")');
  });

  test("the Pass-3c showViewToggle contract still holds (no V3 regression)", () => {
    // Manage is a NEW, independent affordance — it must not revive the legacy
    // Cards/List toggle or change V3's Cards-only guarantee.
    expect(tsx).toContain("const showViewToggle = !libraryV3Enabled;");
    expect(tsx).toContain(
      'const effectiveViewMode: ViewMode = libraryV3Enabled ? "cards" : viewMode;',
    );
  });

  test("the table renders the 7-column set + the Follow-up accent + no checkboxes", () => {
    // The header + rows come straight off MANAGE_LIST_COLUMNS (the pinned set).
    expect(tsx).toContain("MANAGE_LIST_COLUMNS.map(");
    // The Follow-up cell is the only one marked accented.
    expect(tsx).toContain('data-accent="true"');
    // No bulk checkbox cell this packet (Packet 2). The Select toggle hides while
    // the table is open so the bulk bar never dangles over a table it can't drive.
    expect(tsx).toContain("!loading && cards.length > 0 && !showManageTable && (");
  });
});
