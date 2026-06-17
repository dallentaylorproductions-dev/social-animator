import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  cardOverflowActions,
  secondaryRowActions,
  type PageCard,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Cockpit fix Packet 1 — mobile app-feel + layout + copy.
 *
 * Bug/polish fixes to the already-LIVE cockpit (PAGES_LIBRARY_V3 +
 * PAGES_CARD_EXPAND are ON in prod, no new flag). Consistent with how the rest
 * of the Pages Library is pinned, the e2e harness renders the WIZARD on the bare
 * route (the library flag is off in playwright.config's webServer env), so this
 * runs as a node-context source-contract + pure spec:
 *
 *   1. COPY — the editor-open primary verb is "Edit page" (not the old "Open"),
 *      and it comes from a SINGLE source so Cards / List / Manage table can never
 *      drift.
 *   2. ACTION-AREA LAYOUT — the collapsed mobile face groups the chevron WITH the
 *      primary (no `margin-left: auto` stranding it at the screen edge).
 *   3. OVERFLOW MENU STACKING — the "⋯" menu is portaled (createPortal) and
 *      `position: fixed`, so it escapes the card's clip/stacking context, and it
 *      flips up near the viewport bottom.
 *   4. LONG-PRESS CLEAN SELECT — the card/row surface suppresses native text
 *      selection + the iOS touch-callout.
 *   5. HORIZONTAL-SCROLL LOCK — the library root is `overflow-x: hidden` +
 *      `overscroll-behavior-x: none` (vertical-only, app-feel).
 *
 * The in-browser mobile verification (chevron grouped, menu above siblings +
 * flips up, long-press clean-select, no horizontal rubber-band, "Edit page"
 * label) is the Preview check the packet assigns to Cowork, at mobile width.
 */

const tsx = readFileSync(
  path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
  "utf8",
);
const css = readFileSync(
  path.resolve(__dirname, "../src/app/seller-presentation/pages-library.css"),
  "utf8",
);

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

// ── 1. Copy: the editor-open verb is "Edit page", single-sourced ──

test.describe("primary verb — Edit page (single source)", () => {
  test('the live primary label is "Edit page", not "Open"', () => {
    // The single source — primaryActionLabel — drives Cards, the List row's
    // accessible name, and the Manage table cell.
    expect(tsx).toContain('return "Edit page";');
    expect(tsx).not.toContain('return "Open";');
  });

  test("the card reads the primary label from the single source", () => {
    // PageCardView no longer inlines its own "Open" / "Continue" literals for the
    // non-archived primary; it projects `primaryActionLabel(card)` so it can
    // never drift from the row / table.
    expect(tsx).toContain("{ label: primaryActionLabel(card), onClick: onContinue }");
    expect(tsx).not.toContain('label: "Open"');
  });

  test("the parallel action set is unchanged + outcome-worded", () => {
    // The rest of the verbs stay exactly as locked.
    expect(tsx).toContain('"update-live": "Update live page"');
    expect(tsx).toContain('"view-live": "View live page"');
    expect(tsx).toContain('"copy-link": "Copy link"');
    expect(tsx).toContain('"mark-followed-up": "Mark as followed up"');
  });
});

// ── 2. Action-area layout: chevron grouped with the primary ──

test.describe("collapsed face — chevron grouped with the primary", () => {
  test("the collapsed face actions row carries the grouping class", () => {
    expect(tsx).toContain('className="lib-actions lib-card-face"');
  });

  test("the face groups primary + chevron inside the padding (no edge-stranding)", () => {
    // `.lib-card-face` makes the primary fill the row and drops the chevron's
    // `margin-left: auto`, so the disclosure stays attached to the action it
    // expands rather than floating to the far-right screen edge.
    expect(css).toContain(".lib-card-face .lib-btn-primary");
    expect(css).toContain(".lib-card-face .lib-chevron");
    expect(css).toMatch(/\.lib-card-face \.lib-chevron \{[^}]*margin-left: 0/);
  });
});

// ── 3. Overflow (⋯) menu stacking: portaled, fixed, flips up ──

test.describe("overflow menu — portaled above siblings, flips up", () => {
  test("the menu is portaled and positioned fixed", () => {
    expect(tsx).toContain('import { createPortal } from "react-dom";');
    expect(tsx).toContain("createPortal(menu, host)");
    // The portal host is the library root, so the menu keeps the library's CSS
    // tokens + `.lib-menu*` rules while escaping the card's clip/stacking trap.
    expect(tsx).toContain('btn.closest<HTMLElement>(".sep-library")');
    expect(tsx).toContain('position: "fixed"');
  });

  test("the menu opens downward normally and flips up near the viewport bottom", () => {
    expect(tsx).toContain("const flipUp =");
    expect(tsx).toContain("bottom: window.innerHeight - r.top + 6");
    expect(tsx).toContain("top: r.bottom + 6");
  });

  test("the menu CSS is fixed at a higher stacking layer (not absolute/clipped)", () => {
    // The menu sits ABOVE sibling cards + section headings; it is no longer the
    // old `position: absolute` that lived inside (and was clipped by) the card.
    expect(css).toMatch(/\.lib-menu \{[^}]*position: fixed/);
    expect(css).not.toMatch(/\.lib-menu \{[^}]*position: absolute/);
  });

  test("an outside-click clears BOTH the trigger wrap and the portaled menu", () => {
    // With the menu in a portal outside the wrap, the outside-click guard must
    // also exempt the menu itself, or a menu-item click would close it first.
    expect(tsx).toContain("wrapRef.current?.contains(target)");
    expect(tsx).toContain("menuRef.current?.contains(target)");
  });
});

// ── 4. Long-press = clean select (no text selection / iOS callout) ──

test.describe("long-press — clean select surface", () => {
  test("the card + row surfaces suppress native selection + the iOS callout", () => {
    expect(css).toMatch(/\.lib-card,\s*\n?\s*\.sep-library \.lib-row \{/);
    expect(css).toContain("-webkit-touch-callout: none");
    expect(css).toContain("-webkit-user-select: none");
    expect(css).toContain("user-select: none");
  });
});

// ── 5. Horizontal-scroll lock (app-feel, vertical-only) ──

test.describe("horizontal scroll — locked, vertical-only", () => {
  test("the library root clips horizontal overflow + kills the rubber-band", () => {
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("overscroll-behavior-x: none");
  });
});

// ── the overflow set is still a pure FILTER of the row actions (no drift) ──

test.describe("overflow stays a subset of the row menu", () => {
  test("every overflow action is one the row menu already validated, in order", () => {
    const cards: PageCard[] = [
      card({ status: "live" }),
      card({ status: "live-edits-pending" }),
      card({ status: "draft" }),
      card({ status: "archived", instanceId: undefined }),
      card({ status: "live", worthFollowUp: true, viewCount: 3 }),
    ];
    for (const c of cards) {
      const overflow = cardOverflowActions(c);
      const row = secondaryRowActions(c);
      // subset, and the relative order is preserved (a filter, not a re-sort)
      expect(row.filter((a) => overflow.includes(a))).toEqual(overflow);
    }
  });
});
