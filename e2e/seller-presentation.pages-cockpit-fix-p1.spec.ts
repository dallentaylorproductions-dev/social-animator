import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  cardOverflowActions,
  clampMenuCoords,
  secondaryRowActions,
  MENU_VIEWPORT_MARGIN,
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
 *   3. OVERFLOW MENU STACKING + PLACEMENT — the "⋯" menu is portaled
 *      (createPortal) and `position: fixed`, so it escapes the card's
 *      clip/stacking context; it is measured then clamped fully within the
 *      viewport on both axes (`clampMenuCoords`) so it never hangs off-screen.
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
    expect(tsx).toContain('closest<HTMLElement>(".sep-library")');
    expect(tsx).toContain('position: "fixed"');
  });

  test("the menu is measured then clamped (no estimate, no flash)", () => {
    // Placement happens after mount from the menu's REAL size, and the menu is
    // hidden until placed — so it appears already clamped on-screen.
    expect(tsx).toContain("clampMenuCoords(");
    expect(tsx).toContain("menu.offsetWidth");
    expect(tsx).toContain("menu.offsetHeight");
    expect(tsx).toContain("visibility: coords ? \"visible\" : \"hidden\"");
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

  test("the menu CSS caps its height so a tall menu scrolls, never overflows", () => {
    expect(css).toMatch(/\.lib-menu \{[^}]*max-height: calc\(100vh - 16px\)/);
    expect(css).toMatch(/\.lib-menu \{[^}]*overflow-y: auto/);
  });
});

// ── clampMenuCoords — the menu is always fully on-screen (both axes) ──

const VW = 390; // a phone viewport
const VH = 844;
const MW = 168; // the menu's min-width
const MH = 140;
const M = MENU_VIEWPORT_MARGIN;

test.describe("clampMenuCoords — never hangs off-screen", () => {
  test("right edge trigger with room below → opens down, right-aligned", () => {
    // ⋯ near the right edge (a List row / table row): right-aligned to it.
    const c = clampMenuCoords({ top: 200, bottom: 234, right: 370 }, MW, MH, VW, VH);
    expect(c.top).toBe(234 + 6);
    expect(c.left).toBe(370 - MW); // right edge of menu == trigger right
    expect(c.left).toBeGreaterThanOrEqual(M);
  });

  test("trigger on the LEFT (mid-card ⋯) → clamps in, never off the left edge", () => {
    // The observed bug: a left-positioned trigger right-aligned the menu off the
    // left edge. The left clamp pins it to the margin instead.
    const c = clampMenuCoords({ top: 200, bottom: 234, right: 90 }, MW, MH, VW, VH);
    expect(c.left).toBe(M);
    expect(c.left + MW).toBeLessThanOrEqual(VW - M + 1);
  });

  test("near the bottom → flips above the trigger", () => {
    const c = clampMenuCoords({ top: 800, bottom: 834, right: 370 }, MW, MH, VW, VH);
    // Flips up: bottom edge of the menu sits just above the trigger top.
    expect(c.top).toBe(800 - 6 - MH);
    expect(c.top).toBeGreaterThanOrEqual(M);
    expect(c.top + MH).toBeLessThanOrEqual(VH - M);
  });

  test("never exceeds any viewport edge across a sweep of trigger positions", () => {
    for (let right = 20; right <= VW; right += 17) {
      for (let bottom = 20; bottom <= VH; bottom += 41) {
        const c = clampMenuCoords(
          { top: bottom - 34, bottom, right },
          MW,
          MH,
          VW,
          VH,
        );
        expect(c.left).toBeGreaterThanOrEqual(M);
        expect(c.left + MW).toBeLessThanOrEqual(VW - M);
        expect(c.top).toBeGreaterThanOrEqual(M);
        expect(c.top + MH).toBeLessThanOrEqual(VH - M);
      }
    }
  });
});

// ── header pill row wraps fully on-screen at phone width ──

test.describe("header — stacked mobile rhythm (grouped, not crowded)", () => {
  test("the pills are grouped in a wrapper that is layout-transparent on desktop", () => {
    // The wrapper exists in the markup but is `display: contents` by default, so
    // the desktop header row is byte-identical (pills stay direct flex children).
    expect(tsx).toContain('className="lib-head-pills"');
    expect(css).toMatch(/\.lib-head-pills \{[^}]*display: contents/);
  });

  test("the mobile header stacks into one consistent spacing rhythm (V3-scoped)", () => {
    // <=640px, scoped under the V3 hook so the dead flag-off path stays
    // byte-identical: title block / pills set / CTA / tabs row, with 8px WITHIN
    // the pills set and a larger 16px BETWEEN every group.
    expect(css).toContain("@media (max-width: 640px)");
    // (a)->actions: the header stacks with a 16px between-group gap
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-head-row \{[^}]*flex-direction: column;[^}]*gap: 16px/,
    );
    // the actions stack vertically, full width, 16px between (b) pills and (c) CTA
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-head-actions \{[^}]*flex-direction: column;[^}]*gap: 16px/,
    );
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-head-actions \{[^}]*align-items: stretch/,
    );
    // (b) the two pills, grouped with a tight 8px within-group gap
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-head-pills \{[^}]*display: flex;[^}]*gap: 8px/,
    );
    // (c) full-width primary CTA
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-newbtn \{[^}]*width: 100%/,
    );
    // (d) tabs + Select row sits one between-group step below, wraps if needed
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-toolbar \{[^}]*margin-top: 16px/,
    );
    expect(css).toMatch(
      /\[data-library-v3="true"\] \.lib-toolbar-right \{[^}]*flex-wrap: wrap/,
    );
  });
});

// ── iOS image long-press: no native photo menu / drag-lift on cover + thumb ──

test.describe("cover/thumb images — clean long-press (no iOS image menu/drag)", () => {
  test("both cover + thumbnail imgs are non-draggable", () => {
    // draggable={false} on the cover <img> and the List/expanded-card thumbnail.
    expect(tsx).toContain('className="lib-poster-img" src={card.cover} alt="" draggable={false}');
    expect(tsx).toContain('className="lib-row-thumb-img" src={card.cover} alt="" draggable={false}');
  });

  test("the image CSS suppresses the iOS callout + user-drag + selection", () => {
    // Targeted at the images specifically (the card-surface suppression alone
    // does not stop iOS from popping the image menu / drag preview).
    expect(css).toMatch(
      /\.lib-poster-img,\s*\n?\s*\.sep-library \.lib-row-thumb-img \{/,
    );
    expect(css).toMatch(
      /\.lib-row-thumb-img \{[^}]*-webkit-touch-callout: none/,
    );
    expect(css).toMatch(/\.lib-row-thumb-img \{[^}]*-webkit-user-drag: none/);
    expect(css).toMatch(/\.lib-row-thumb-img \{[^}]*user-select: none/);
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
