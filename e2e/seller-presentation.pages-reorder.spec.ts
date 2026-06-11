import { test, expect } from "@playwright/test";
import {
  applyManualOrder,
  sanitizePageOrder,
  type PageCard,
} from "../src/lib/seller-presentation/pages-library";

/**
 * SP-LIB-5 — manual drag-to-reorder: pure-model unit tests.
 *
 * Mirrors the pages-library / server-drafts specs: the order model lives in a
 * PURE module (no React, no KV, no DOM), so it runs as a node-context
 * Playwright spec — the only runner this repo has. Every non-function import is
 * type-only (erased at compile).
 *
 * The two functions under test are the whole order contract:
 *   - `sanitizePageOrder` — the single coercion every untrusted boundary (KV
 *     blob, request body, localStorage cache) funnels through, so a corrupt
 *     order can never crash a render or persist garbage.
 *   - `applyManualOrder` — projects the saved key order onto the live Active
 *     cards, and is where the New / Archive / Restore slotting rules fall out.
 */

const T = "2026-06-01T00:00:00.000Z";

/** A minimal Active-tab card; only `key` + `updatedAt` matter to the order. */
function card(key: string, updatedAt = T): PageCard {
  return {
    key,
    status: "draft",
    instanceId: key,
    propertyLine: key,
    updatedAt,
  };
}

/** Read just the keys, the shape the assertions care about. */
function keys(cards: PageCard[]): string[] {
  return cards.map((c) => c.key);
}

// ===========================================================================
// sanitizePageOrder — coerce any untrusted value into a clean key list.
// ===========================================================================

test.describe("sanitizePageOrder (the untrusted-boundary coercion)", () => {
  test("keeps a clean string list as-is", () => {
    expect(sanitizePageOrder(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("a non-array (null / object / string / number) collapses to []", () => {
    expect(sanitizePageOrder(null)).toEqual([]);
    expect(sanitizePageOrder(undefined)).toEqual([]);
    expect(sanitizePageOrder("a,b")).toEqual([]);
    expect(sanitizePageOrder({ 0: "a" })).toEqual([]);
    expect(sanitizePageOrder(42)).toEqual([]);
  });

  test("drops non-strings and empty/whitespace entries, trims the rest", () => {
    expect(
      sanitizePageOrder(["a", 1, null, "", "   ", "  b  ", true, "c"]),
    ).toEqual(["a", "b", "c"]);
  });

  test("de-dupes, first occurrence wins", () => {
    expect(sanitizePageOrder(["a", "b", "a", "c", "b"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

// ===========================================================================
// applyManualOrder — project the saved order onto the live cards.
// ===========================================================================

test.describe("applyManualOrder (the order projection)", () => {
  test("an empty order leaves the incoming order untouched", () => {
    const cards = [card("a"), card("b"), card("c")];
    expect(applyManualOrder(cards, [])).toBe(cards); // same ref, no work
  });

  test("known cards sort by their position in the order", () => {
    const cards = [card("a"), card("b"), card("c")];
    expect(keys(applyManualOrder(cards, ["c", "a", "b"]))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("a NEW card (key not in the order) floats to the TOP", () => {
    // mergePages hands cards in most-recent-first order, so a fresh page is
    // already first in the incoming list; being unknown keeps it on top.
    const fresh = card("new", "2026-06-09T00:00:00.000Z");
    const cards = [fresh, card("a"), card("b")];
    expect(keys(applyManualOrder(cards, ["a", "b"]))).toEqual([
      "new",
      "a",
      "b",
    ]);
  });

  test("a RESTORED card (its key was pruned from the order) lands on TOP", () => {
    // Archiving removes the key from the order; on restore the card is unknown
    // again, so it slots above the arranged set — the stated Restore rule.
    const restored = card("r");
    const cards = [restored, card("a"), card("b")];
    expect(keys(applyManualOrder(cards, ["a", "b"]))).toEqual(["r", "a", "b"]);
  });

  test("multiple unknowns keep their incoming (recent-first) order, all on top", () => {
    const cards = [card("n1"), card("n2"), card("a"), card("b")];
    expect(keys(applyManualOrder(cards, ["b", "a"]))).toEqual([
      "n1",
      "n2",
      "b",
      "a",
    ]);
  });

  test("a stale key in the order (its card archived/deleted) is simply skipped", () => {
    const cards = [card("a"), card("b")];
    expect(keys(applyManualOrder(cards, ["gone", "b", "a"]))).toEqual([
      "b",
      "a",
    ]);
  });

  test("total + stable: never drops or duplicates a card", () => {
    const cards = [card("a"), card("b"), card("c"), card("d")];
    const out = applyManualOrder(cards, ["d", "b"]);
    expect(out).toHaveLength(4);
    expect([...keys(out)].sort()).toEqual(["a", "b", "c", "d"]);
    // the two arranged keys hold their relative order at the bottom...
    expect(keys(out).slice(-2)).toEqual(["d", "b"]);
    // ...and the two unknowns float above them, in incoming order.
    expect(keys(out).slice(0, 2)).toEqual(["a", "c"]);
  });
});
