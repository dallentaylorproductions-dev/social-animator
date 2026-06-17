import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  MANAGE_LIST_COLUMNS,
  MANAGE_SELECT_COLUMN_WIDTH,
  selectAllState,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Pages Library — management List, Packet 2 (PAGES_MANAGE_LIST · bulk select).
 *
 * Packet 2 wires the EXISTING, view-agnostic bulk engine (the shared `selected`
 * Set, `bulkActionValidity`, `runBulk`) into the P1 management table: a leading
 * always-on checkbox column, a select-all header (with an indeterminate face),
 * and the existing bulk bar surfacing once a row is checked. No new bulk logic —
 * the archive/delete validity + batching specs in the P1 / v2 suites still own
 * that behavior. So, consistent with the harness limitation (the e2e harness
 * renders the WIZARD on the bare route, library flag off), this runs as a node-
 * context spec in two registers:
 *
 *   1. PURE: the select-all tri-state (`selectAllState`) over the shared Set,
 *      and the leading column's width keeping the fixed-layout grid at 100%.
 *   2. SOURCE-CONTRACT: the table renders a leading checkbox column + select-all
 *      header, the per-row + header checkboxes bind to the SHARED `selected` Set
 *      (never a forked selection), the bulk bar surfaces on a Manage selection,
 *      "Done" clears it, flag-off stays byte-identical, and the Cards "Select"
 *      flow is untouched.
 *
 * The in-browser verification (checkboxes select, select-all + indeterminate,
 * bulk archive runs + the table reconciles, Done clears, mobile hidden, flag-off
 * identical) is the preview check the packet assigns to Cowork, flag on.
 */

// ── PURE: select-all tri-state over the shared `selected` Set ──

test.describe("selectAllState — the header tri-state", () => {
  const keys = ["a", "b", "c"];

  test("empty selection ⇒ none", () => {
    expect(selectAllState(keys, new Set())).toBe("none");
  });

  test("a strict, non-empty subset ⇒ some (indeterminate)", () => {
    expect(selectAllState(keys, new Set(["a"]))).toBe("some");
    expect(selectAllState(keys, new Set(["a", "b"]))).toBe("some");
  });

  test("every rendered row selected ⇒ all", () => {
    expect(selectAllState(keys, new Set(["a", "b", "c"]))).toBe("all");
  });

  test("'all' is judged over the RENDERED rows only — extra keys don't matter", () => {
    // The Set is view-agnostic and may hold keys from another tab; select-all is
    // 'all' as long as every CURRENTLY rendered row is in it.
    expect(selectAllState(keys, new Set(["a", "b", "c", "x", "y"]))).toBe("all");
  });

  test("no rendered rows ⇒ none (an empty table's header is simply unchecked)", () => {
    expect(selectAllState([], new Set(["a"]))).toBe("none");
  });
});

// ── PURE: the leading column width keeps the fixed-layout grid at 100% ──

test.describe("MANAGE_SELECT_COLUMN_WIDTH — the fixed-layout fit", () => {
  const pct = (w: string) => Number(w.replace("%", ""));

  test("the leading select column + the 7 data columns sum to 100%", () => {
    const dataTotal = MANAGE_LIST_COLUMNS.reduce(
      (sum, col) => sum + pct(col.width),
      0,
    );
    expect(dataTotal + pct(MANAGE_SELECT_COLUMN_WIDTH)).toBe(100);
  });

  test("the select column is NOT a data column (no sort key pollution)", () => {
    // It lives beside MANAGE_LIST_COLUMNS, so the 7-column sort contract is
    // unchanged — the table still has exactly the 7 sortable/actions columns.
    expect(MANAGE_LIST_COLUMNS).toHaveLength(7);
    expect(MANAGE_LIST_COLUMNS.map((c) => c.key)).not.toContain("select");
  });
});

// ── SOURCE-CONTRACT: the wiring (no browser; harness flag-off limitation) ──

test.describe("PAGES_MANAGE_LIST Packet 2 — bulk select wiring", () => {
  const tsx = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
    "utf8",
  );

  test("the table renders a leading checkbox column + select-all header", () => {
    // A leading colgroup entry sized by the shared width constant.
    expect(tsx).toContain(
      "<col style={{ width: MANAGE_SELECT_COLUMN_WIDTH }} />",
    );
    // A leading header cell carrying the select-all control.
    expect(tsx).toContain(
      "<SelectAllCheckbox state={allState} onToggle={toggleSelectAll} />",
    );
    // The tri-state is derived over the rendered rows via the pure helper.
    expect(tsx).toContain("const allState = selectAllState(");
  });

  test("the per-row + select-all checkboxes bind to the SHARED `selected` Set", () => {
    // The row checkbox is bound to the shared selection (the same `checked` /
    // `onToggleSelect` the cards use), NOT a forked table-only selection.
    expect(tsx).toContain('data-testid="lib-table-row-check"');
    expect(tsx).toContain("onChange={onToggleSelect}");
    // Select-all toggles the shared Set, keyed by card.key.
    expect(tsx).toContain("function toggleSelectAll()");
    expect(tsx).toContain("const keys = visibleCards.map((c) => c.key);");
    expect(tsx).toContain("setSelected((prev) => {");
  });

  test("the select-all checkbox carries an indeterminate (mixed) state", () => {
    expect(tsx).toContain('aria-checked={state === "some" ? "mixed" : state === "all"}');
    expect(tsx).toContain('data-indeterminate={state === "some" ? "true" : undefined}');
  });

  test("the bulk bar surfaces on a Manage selection, reusing the existing bar", () => {
    // One derived flag drives both surfaces: Cards Select mode OR a non-empty
    // Manage-table selection. Flag-off ⇒ showManageTable is false, so this is
    // exactly today's `selectMode`.
    expect(tsx).toContain(
      "const showBulkBar =\n    selectMode || (showManageTable && selectedCards.length > 0);",
    );
    expect(tsx).toContain("{showBulkBar && (");
    // The bar still calls the EXISTING bulk handlers — no new bulk logic.
    expect(tsx).toContain("onClick={requestBulkArchive}");
    expect(tsx).toContain("onClick={requestBulkDelete}");
  });

  test('"Done" (leaving Manage) clears the table selection', () => {
    // toggleManage clears `selected` so the bulk bar never dangles after exit.
    const toggle = tsx.slice(
      tsx.indexOf("function toggleManage()"),
      tsx.indexOf("function toggleSelectAll()"),
    );
    expect(toggle).toContain("setSelected(new Set());");
  });

  test("flag-off byte-identical: every checkbox surface is inside the table path", () => {
    // The select column / select-all / row checkbox only render inside
    // renderManageTable + PageTableRow, which the body switch reaches ONLY when
    // showManageTable (flag-only + desktop-only). So flag-off paints no column,
    // no header checkbox, no row checkbox — identical to today's V3 cockpit.
    expect(tsx).toContain(") : showManageTable ? (");
    expect(tsx).toContain(
      "selectMode || (showManageTable && selectedCards.length > 0);",
    );
  });

  test("the Cards 'Select' flow is untouched (still hidden while the table is open)", () => {
    // P2 adds NO separate Select toggle to Manage; the Cards Select button still
    // hides while the table is open and still drives selectMode / exitSelect.
    expect(tsx).toContain("!loading && cards.length > 0 && !showManageTable && (");
    expect(tsx).toContain("onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}");
  });
});
