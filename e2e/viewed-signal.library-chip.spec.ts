import { test, expect } from "@playwright/test";
import {
  listMetaLine,
  mergePages,
  viewSignalLabel,
  type PageCard,
  type ServerPageSummary,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Viewed signal (Phase 1) - library chip / meta-line pure tests.
 *
 * The agent surface is the existing pages-library chip + List meta line, both
 * fed by the SAME pure `viewSignalLabel`, so the calm operations-partner voice
 * can never drift between the two layouts. These pin the Phase 1 states and -
 * the hard requirement - that a card with NO view fields (the flag-off shape,
 * since the pages route only populates them under VIEWED_SIGNAL_ENABLED) renders
 * byte-identically to before this phase.
 */

// 2026-06-15T12:00:00Z, two hours after the sample opens below.
const NOW = Date.parse("2026-06-15T12:00:00.000Z");

function liveCard(over: Partial<PageCard> = {}): PageCard {
  return {
    key: "abc12345",
    status: "live",
    slug: "abc12345",
    publicUrl: "/h/abc12345",
    propertyLine: "123 Main St",
    updatedAt: "2026-06-15T09:00:00.000Z",
    ...over,
  };
}

test.describe("viewSignalLabel", () => {
  test("an un-opened card (flag-off shape) yields no label", () => {
    expect(viewSignalLabel(liveCard(), NOW)).toBeUndefined();
    expect(viewSignalLabel(liveCard({ viewCount: 0 }), NOW)).toBeUndefined();
  });

  test("opened (no return) reads 'Opened · 2h ago' with recency", () => {
    const label = viewSignalLabel(
      liveCard({ viewCount: 1, lastViewedAt: "2026-06-15T10:00:00.000Z" }),
      NOW,
    );
    expect(label).toBe("Opened · 2 hours ago");
  });

  test("returned-after-reveal reads the distinct 'Returned' (strongest signal wins)", () => {
    const label = viewSignalLabel(
      liveCard({
        viewCount: 3,
        lastViewedAt: "2026-06-15T10:00:00.000Z",
        returnedAfterReveal: true,
      }),
      NOW,
    );
    expect(label).toBe("Returned");
  });

  test("a count with no timestamp (legacy/unreachable shape) yields no label", () => {
    // The route always sets lastViewedAt alongside viewCount, so this keeps the
    // meta line byte-identical to the pre-phase "N views" for that shape.
    expect(viewSignalLabel(liveCard({ viewCount: 2 }), NOW)).toBeUndefined();
  });
});

test.describe("listMetaLine - viewed signal is additive", () => {
  test("flag-off card (no view fields) is byte-identical: 'Live X ago'", () => {
    expect(listMetaLine(liveCard(), NOW)).toBe("Live 3 hours ago");
  });

  test("flag-off card WITH a seller line is byte-identical: just the seller", () => {
    expect(listMetaLine(liveCard({ sellerLine: "the Johnsons" }), NOW)).toBe(
      "the Johnsons",
    );
  });

  test("opened card appends engagement + pluralized count", () => {
    const line = listMetaLine(
      liveCard({
        sellerLine: "the Johnsons",
        viewCount: 1,
        lastViewedAt: "2026-06-15T10:00:00.000Z",
      }),
      NOW,
    );
    expect(line).toBe("the Johnsons · Opened · 2 hours ago · 1 view");
  });

  test("returned card surfaces 'Returned' before the count", () => {
    const line = listMetaLine(
      liveCard({
        viewCount: 4,
        lastViewedAt: "2026-06-15T11:30:00.000Z",
        returnedAfterReveal: true,
      }),
      NOW,
    );
    expect(line).toBe("Returned · 4 views");
  });

  test("draft + archived meta lines are untouched by the viewed signal", () => {
    expect(listMetaLine(liveCard({ status: "draft" }), NOW)).toBe(
      "Started 3 hours ago",
    );
    expect(
      listMetaLine(
        liveCard({ status: "archived", archivedAt: "2026-06-15T08:00:00.000Z" }),
        NOW,
      ),
    ).toBe("Archived 4 hours ago");
  });
});

test.describe("mergePages - view fields flow onto the card", () => {
  const summary = (over: Partial<ServerPageSummary> = {}): ServerPageSummary => ({
    slug: "abc12345",
    createdAt: "2026-06-10T09:00:00.000Z",
    updatedAt: "2026-06-15T09:00:00.000Z",
    archived: false,
    propertyLine: "123 Main St",
    ...over,
  });

  test("a standalone server page carries viewCount + signal onto its card", () => {
    const [card] = mergePages({
      serverPages: [
        summary({
          viewCount: 5,
          lastViewedAt: "2026-06-15T10:00:00.000Z",
          returnedAfterReveal: true,
        }),
      ],
      instances: [],
      sessionEmail: "agent@example.com",
    });
    expect(card.viewCount).toBe(5);
    expect(card.lastViewedAt).toBe("2026-06-15T10:00:00.000Z");
    expect(card.returnedAfterReveal).toBe(true);
  });

  test("a server page with no view fields yields a card with none (flag-off)", () => {
    const [card] = mergePages({
      serverPages: [summary()],
      instances: [],
      sessionEmail: "agent@example.com",
    });
    expect(card.viewCount).toBeUndefined();
    expect(card.lastViewedAt).toBeUndefined();
    expect(card.returnedAfterReveal).toBeUndefined();
  });
});
