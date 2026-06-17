import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  cardOverflowActions,
  cardExpandedInlineActions,
  secondaryRowActions,
  CARD_OVERFLOW_ACTIONS,
  type PageCard,
  type RowAction,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Pages Library Pass 2 — mobile tap-to-expand cards (PAGES_CARD_EXPAND).
 *
 * Pass 2 collapses the phone card to a scan face (lead signal + one primary
 * action) that expands inline on tap. The collapse/expand interaction is
 * component behavior; consistent with how Pass 1 (PAGES_LIBRARY_V2) was pinned,
 * the e2e harness renders the WIZARD on the bare route (the library flag is off
 * in playwright.config's webServer env), so this runs as a node-context spec:
 *
 *   1. PURE: the action SPLIT — which actions live on the expanded face inline
 *      vs. behind the "⋯" overflow — is a filter of `secondaryRowActions`, so it
 *      can never drift from the List row menu. Pinned here across every state.
 *   2. SOURCE-CONTRACT: the flag is read + threaded, the expand affordance is
 *      gated on `expandable` (flag on AND a phone), and the collapse/expand DOM
 *      is emitted only inside that branch — so flag-off / desktop is unchanged.
 *
 * The in-browser mobile interaction (tap-expands, tap-again-collapses, tap does
 * not navigate, overflow = secondary only, desktop unchanged) is the manual
 * preview verification the packet assigns to Cowork, at mobile width with
 * PAGES_CARD_EXPAND=true.
 */

function card(over: Partial<PageCard> = {}): PageCard {
  return {
    key: "k",
    status: "live",
    propertyLine: "123 Main St",
    updatedAt: "2026-06-13T12:00:00.000Z",
    instanceId: "inst-1",
    slug: "123-main-st",
    ...over,
  };
}

// ── the overflow holds ONLY secondary/destructive actions (Decision 5) ──

test.describe("cardOverflowActions — overflow = secondary only", () => {
  test("the overflow is always a subset of archive / duplicate / delete", () => {
    const cards: PageCard[] = [
      card({ status: "live" }),
      card({ status: "live-edits-pending" }),
      card({ status: "draft" }),
      card({ status: "archived", instanceId: undefined }),
      card({ status: "live", worthFollowUp: true, viewCount: 3 }),
      card({ status: "live", instanceId: undefined }), // cross-device, no resume
    ];
    for (const c of cards) {
      const overflow = cardOverflowActions(c);
      for (const a of overflow) {
        expect(CARD_OVERFLOW_ACTIONS).toContain(a);
      }
      // The primary workflow actions are NEVER behind the dots.
      const forbidden: RowAction[] = [
        "mark-followed-up",
        "update-live",
        "view-live",
        "copy-link",
      ];
      for (const f of forbidden) {
        expect(overflow).not.toContain(f);
      }
    }
  });

  test("live card → overflow = archive + duplicate (no delete on a live page)", () => {
    expect(cardOverflowActions(card({ status: "live" }))).toEqual([
      "archive",
      "duplicate",
    ]);
  });

  test("draft → overflow = archive + duplicate + delete", () => {
    expect(cardOverflowActions(card({ status: "draft" }))).toEqual([
      "archive",
      "duplicate",
      "delete",
    ]);
  });

  test("archived (no local draft) → overflow = delete only", () => {
    expect(
      cardOverflowActions(card({ status: "archived", instanceId: undefined })),
    ).toEqual(["delete"]);
  });

  test("cross-device live (no resume) → overflow = archive only", () => {
    expect(
      cardOverflowActions(card({ status: "live", instanceId: undefined })),
    ).toEqual(["archive"]);
  });
});

// ── the expanded inline set is the workflow (non-overflow) actions ──

test.describe("cardExpandedInlineActions — the inline workflow set", () => {
  test("inline never contains a destructive/housekeeping action", () => {
    const cards: PageCard[] = [
      card({ status: "live" }),
      card({ status: "live-edits-pending" }),
      card({ status: "draft" }),
      card({ status: "live", worthFollowUp: true, viewCount: 3 }),
    ];
    for (const c of cards) {
      const inline = cardExpandedInlineActions(c);
      for (const a of inline) {
        expect(CARD_OVERFLOW_ACTIONS).not.toContain(a);
      }
    }
  });

  test("follow-up live → inline leads with mark-followed-up, then view/copy", () => {
    expect(
      cardExpandedInlineActions(
        card({ status: "live", worthFollowUp: true, viewCount: 3 }),
      ),
    ).toEqual(["mark-followed-up", "view-live", "copy-link"]);
  });

  test("edits-pending → inline leads with update-live, then view/copy", () => {
    expect(
      cardExpandedInlineActions(card({ status: "live-edits-pending" })),
    ).toEqual(["update-live", "view-live", "copy-link"]);
  });

  test("draft → no inline workflow actions (primary Continue + overflow only)", () => {
    expect(cardExpandedInlineActions(card({ status: "draft" }))).toEqual([]);
  });
});

// ── the split is exhaustive + drift-proof (never a second rule set) ──

test.describe("the inline + overflow split partitions secondaryRowActions", () => {
  test("every secondary action lands in exactly one of inline / overflow, order kept", () => {
    const cards: PageCard[] = [
      card({ status: "live" }),
      card({ status: "live-edits-pending" }),
      card({ status: "draft" }),
      card({ status: "archived", instanceId: undefined }),
      card({ status: "live", worthFollowUp: true, viewCount: 3 }),
      card({ status: "live", instanceId: undefined }),
    ];
    for (const c of cards) {
      const all = secondaryRowActions(c);
      const inline = cardExpandedInlineActions(c);
      const overflow = cardOverflowActions(c);
      // union covers everything, no duplication
      expect([...inline, ...overflow].sort()).toEqual([...all].sort());
      expect(inline.length + overflow.length).toBe(all.length);
      // each side preserves the source order (a filter, not a re-sort)
      expect(inline).toEqual(all.filter((a) => inline.includes(a)));
      expect(overflow).toEqual(all.filter((a) => overflow.includes(a)));
    }
  });
});

// ── flag-off / desktop byte-identical: source-contract guards ──

test.describe("PAGES_CARD_EXPAND is gated (flag-off + desktop byte-identical)", () => {
  const tsx = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
    "utf8",
  );
  const page = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/page.tsx"),
    "utf8",
  );

  test("the page reads the PAGES_CARD_EXPAND env flag and threads it down", () => {
    expect(page).toContain('process.env.PAGES_CARD_EXPAND === "true"');
    expect(page).toContain("cardExpandEnabled={cardExpandEnabled}");
  });

  test("expand is engaged only when the flag is on AND the viewport is a phone", () => {
    // `expandable` (the per-card flag PageCardView reads) is the AND of the flag
    // and the narrow-viewport matchMedia — so desktop never collapses, and the
    // flag-off path never sets it.
    expect(tsx).toContain("expandable: cardExpandEnabled && isNarrow");
    expect(tsx).toContain('window.matchMedia("(max-width: 640px)")');
  });

  test("the collapse/expand DOM is emitted only inside the expandable branch", () => {
    // The chevron, the data attributes, and the collapsible region all sit
    // behind `expandable`, so when it is false the card markup is unchanged.
    expect(tsx).toContain('data-expandable={expandable ? "true" : undefined}');
    expect(tsx).toContain(
      'data-expanded={expandable && expanded ? "true" : undefined}',
    );
    expect(tsx).toContain("{!selectMode && expandable ? (");
    expect(tsx).toContain('data-testid="lib-card-expand"'); // the chevron
    expect(tsx).toContain('className="lib-card-extra"');
  });

  test("the chevron disclosure is keyboard/SR-accessible (aria-expanded + controls)", () => {
    expect(tsx).toContain("aria-expanded={expanded}");
    expect(tsx).toContain("aria-controls={extraId}");
  });

  test("the expand affordance respects reduced motion", () => {
    const css = readFileSync(
      path.resolve(
        __dirname,
        "../src/app/seller-presentation/pages-library.css",
      ),
      "utf8",
    );
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("lib-card-extra { animation: none");
  });
});
