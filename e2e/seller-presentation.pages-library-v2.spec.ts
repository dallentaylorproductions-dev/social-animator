import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  cardSignal,
  followUpSubline,
  mergePages,
  sortFollowUpGroup,
  splitFollowUp,
  usageMeterLabel,
  type PageCard,
  type ServerPageSummary,
} from "../src/lib/seller-presentation/pages-library";
import type { WorkflowInstance } from "../src/skills/workflow-instance";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";

/**
 * Pages Library v2 — seller-activity cockpit pure tests (PAGES_LIBRARY_V2).
 *
 * Pass 1 is structure: the pinned "Worth a follow-up" group (recency-sorted),
 * the de-duplicated card signal (a card never shows the same fact twice), and
 * the calm, non-alarming usage line. All of it is pure derivation in
 * pages-library.ts, so this runs as a node-context spec like its siblings. The
 * flag-off byte-identical guarantee is a component concern — pinned here with
 * source-contract checks that V2 rendering is gated behind `libraryV2Enabled`.
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

// ── splitFollowUp: the pinned group vs the rest ──

test.describe("splitFollowUp — grouping + no duplication", () => {
  test("only worthFollowUp cards land in the group; the rest keep their order", () => {
    const a = card({ key: "a", worthFollowUp: true, followUpAt: isoBefore(1 * DAY) });
    const b = card({ key: "b" });
    const c = card({ key: "c", worthFollowUp: true, followUpAt: isoBefore(2 * DAY) });
    const d = card({ key: "d" });
    const { followUp, rest } = splitFollowUp([a, b, c, d]);
    expect(followUp.map((x) => x.key)).toEqual(["a", "c"]); // recency-sorted
    expect(rest.map((x) => x.key)).toEqual(["b", "d"]); // input order preserved
  });

  test("a card never appears in both sections", () => {
    const cards = [
      card({ key: "a", worthFollowUp: true, followUpAt: isoBefore(1 * DAY) }),
      card({ key: "b" }),
    ];
    const { followUp, rest } = splitFollowUp(cards);
    const keys = [...followUp, ...rest].map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(["a", "b"]);
  });

  test("a flag-off / no-nudge list: empty group, every card in rest, order untouched", () => {
    const cards = [card({ key: "x" }), card({ key: "y" }), card({ key: "z" })];
    const { followUp, rest } = splitFollowUp(cards);
    expect(followUp).toHaveLength(0);
    expect(rest.map((c) => c.key)).toEqual(["x", "y", "z"]);
  });

  test("dismiss (mark followed up) moves a card from the group into rest", () => {
    const before = [
      card({ key: "a", worthFollowUp: true, followUpAt: isoBefore(1 * DAY) }),
      card({ key: "b" }),
    ];
    expect(splitFollowUp(before).followUp.map((c) => c.key)).toEqual(["a"]);
    // After the dismiss the route stops flagging it; it falls back to rest.
    const after = [card({ key: "a" }), card({ key: "b" })];
    const { followUp, rest } = splitFollowUp(after);
    expect(followUp).toHaveLength(0);
    expect(rest.map((c) => c.key)).toEqual(["a", "b"]);
  });
});

test.describe("sortFollowUpGroup — most-recent meaningful engagement first", () => {
  test("sorts by followUpAt descending", () => {
    const cards = [
      card({ key: "old", worthFollowUp: true, followUpAt: isoBefore(5 * DAY) }),
      card({ key: "new", worthFollowUp: true, followUpAt: isoBefore(1 * HOUR) }),
      card({ key: "mid", worthFollowUp: true, followUpAt: isoBefore(2 * DAY) }),
    ];
    expect(sortFollowUpGroup(cards).map((c) => c.key)).toEqual(["new", "mid", "old"]);
  });

  test("ties on recency break by signal strength: returned > watched/read > opened", () => {
    const at = isoBefore(1 * DAY);
    const opened = card({ key: "opened", worthFollowUp: true, followUpAt: at });
    const watched = card({ key: "watched", worthFollowUp: true, followUpAt: at, watchedVideo: true });
    const returned = card({ key: "returned", worthFollowUp: true, followUpAt: at, returnedAfterReveal: true });
    expect(sortFollowUpGroup([opened, watched, returned]).map((c) => c.key)).toEqual([
      "returned",
      "watched",
      "opened",
    ]);
  });

  test("a card missing a stamp sorts last; non-mutating", () => {
    const input = [
      card({ key: "stamped", worthFollowUp: true, followUpAt: isoBefore(2 * DAY) }),
      card({ key: "nostamp", worthFollowUp: true }),
    ];
    const snapshot = input.map((c) => c.key);
    expect(sortFollowUpGroup(input).map((c) => c.key)).toEqual(["stamped", "nostamp"]);
    expect(input.map((c) => c.key)).toEqual(snapshot); // input untouched
  });
});

// ── cardSignal: de-duplicated card lines ──

test.describe("cardSignal — a card never shows the same fact twice", () => {
  test("follow-up card: marker leads with reasons; context is recency + opens only", () => {
    const sig = cardSignal(
      card({
        worthFollowUp: true,
        followUpReasons: ["Watched your video", "Read to the end"],
        viewCount: 3,
        lastViewedAt: isoBefore(2 * HOUR),
        watchedVideo: true,
        readToEnd: true,
      }),
      NOW,
    );
    expect(sig.marker).toBe("Worth a follow-up · Watched your video · Read to the end");
    // The engagement facts are NOT repeated in the context line — the marker
    // owns them. Context is purely recency + opens.
    expect(sig.context).toBe("Opened · 2 hours ago · 3 views");
    expect(sig.context).not.toContain("Watched your video");
    expect(sig.context).not.toContain("Read to the end");
  });

  test("follow-up card that returned: context never repeats 'Returned' (it's a reason)", () => {
    const sig = cardSignal(
      card({
        worthFollowUp: true,
        followUpReasons: ["Returned after the reveal"],
        returnedAfterReveal: true,
        viewCount: 2,
        lastViewedAt: isoBefore(1 * HOUR),
      }),
      NOW,
    );
    expect(sig.marker).toContain("Returned after the reveal");
    expect(sig.context).toBe("Opened · 1 hour ago · 2 views");
    expect(sig.context).not.toContain("Returned");
  });

  test("non-follow-up live card: no marker; status + count + at most one fact", () => {
    const sig = cardSignal(
      card({
        viewCount: 4,
        lastViewedAt: isoBefore(3 * HOUR),
        watchedVideo: true,
        readToEnd: true, // two facts available, but the card shows only one
      }),
      NOW,
    );
    expect(sig.marker).toBeUndefined();
    expect(sig.context).toBe("Opened · 3 hours ago · 4 views · Watched your video");
  });

  test("draft / never-opened / flag-off card: nothing to show", () => {
    expect(cardSignal(card({ status: "draft" }), NOW)).toEqual({});
    expect(cardSignal(card({ viewCount: 0 }), NOW)).toEqual({});
    expect(cardSignal(card(), NOW)).toEqual({}); // no viewCount = flag-off shape
  });
});

// ── usageMeterLabel: calm, non-alarming ──

test.describe("usageMeterLabel — calm cap framing", () => {
  test("under the cap reads the familiar 'N of M live'", () => {
    expect(usageMeterLabel(12, 25)).toBe("12 of 25 live");
    expect(usageMeterLabel(25, 25)).toBe("25 of 25 live");
  });

  test("over the cap is plain + non-alarming, NEVER '68 of 25'", () => {
    expect(usageMeterLabel(68, 25)).toBe("68 live pages · plan limit 25");
    expect(usageMeterLabel(68, 25)).not.toContain("68 of 25");
  });

  test("no cap (<= 0) shows nothing", () => {
    expect(usageMeterLabel(5, 0)).toBeUndefined();
    expect(usageMeterLabel(5, -1)).toBeUndefined();
  });
});

test.describe("followUpSubline", () => {
  test("pluralizes sellers", () => {
    expect(followUpSubline(1)).toBe("1 seller recently engaged with their page");
    expect(followUpSubline(3)).toBe("3 sellers recently engaged with their page");
  });
});

// ── mergePages carries followUpAt through ──

let seq = 0;
function instance(
  over: Partial<WorkflowInstance<SellerPresentationDraft>> = {},
): WorkflowInstance<SellerPresentationDraft> {
  seq += 1;
  const ts = `2026-06-01T00:00:0${seq % 10}.000Z`;
  return {
    instanceId: `wf_${seq}`,
    skillId: "seller-presentation",
    draft: { propertyAddress: "1 St", propertyCity: "Austin" } as SellerPresentationDraft,
    resolvedPrimitives: {},
    timestamps: { createdAt: ts, updatedAt: ts },
    ownerEmail: "agent@example.com",
    ...over,
  };
}
function serverPage(over: Partial<ServerPageSummary> = {}): ServerPageSummary {
  return {
    slug: "slug0001",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    propertyLine: "1 St, Austin",
    ...over,
  };
}

test.describe("mergePages carries followUpAt onto the card", () => {
  test("standalone live page forwards followUpAt", () => {
    const at = isoBefore(1 * DAY);
    const cards = mergePages({
      serverPages: [serverPage({ slug: "remote", worthFollowUp: true, followUpAt: at })],
      instances: [],
      sessionEmail: "agent@example.com",
    });
    expect(cards[0].followUpAt).toBe(at);
  });

  test("instance-backed live page forwards followUpAt", () => {
    const at = isoBefore(2 * DAY);
    const inst = instance({
      instanceId: "wf_live",
      publishedSlug: "lv",
      publishedAt: "2026-06-02T00:00:00.000Z",
      timestamps: { createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-02T00:00:00.000Z" },
    });
    const cards = mergePages({
      serverPages: [serverPage({ slug: "lv", worthFollowUp: true, followUpAt: at })],
      instances: [inst],
      sessionEmail: "agent@example.com",
    });
    expect(cards[0].followUpAt).toBe(at);
  });
});

// ── flag-off byte-identical: source-contract guards ──

test.describe("PAGES_LIBRARY_V2 is gated (flag-off byte-identical)", () => {
  const tsx = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
    "utf8",
  );
  const page = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/page.tsx"),
    "utf8",
  );

  test("the page reads the PAGES_LIBRARY_V2 env flag and threads it down", () => {
    expect(page).toContain('process.env.PAGES_LIBRARY_V2 === "true"');
    expect(page).toContain("libraryV2Enabled={libraryV2Enabled}");
  });

  test("the cockpit (group, all-caught-up, calm meter, dedup) is all gated on libraryV2", () => {
    // The follow-up group + all-caught-up render only through renderActiveBody,
    // which short-circuits to today's render when the flag is off.
    expect(tsx).toContain("if (!libraryV2Enabled) return renderItems(orderedCards, canReorder);");
    // The de-dup card branch and the alarm-banner suppression are both gated.
    // (Pass 3a nests this under the V3 lead ternary — `) : libraryV2 ? (` — so
    // the gate reads `libraryV2 ? (` rather than `{libraryV2 ? (`.)
    expect(tsx).toContain("libraryV2 ? (");
    expect(tsx).toContain("{atLimit && !libraryV2Enabled && (");
  });
});
