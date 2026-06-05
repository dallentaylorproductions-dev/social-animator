import { test, expect } from "@playwright/test";
import {
  countSentence,
  hasCount,
  priceNoteCountLabel,
} from "../src/tools/seller-presentation/output/flagship/copy";
import {
  priceCountupAttrs,
  priceParts,
} from "../src/tools/seller-presentation/output/flagship/price-format";

/**
 * Flagship (v2) derived-copy gate — PURE functions, node context (no
 * browser, no Vitest). Proves the §02 count grammar + price-note grammar at
 * n = 0 / 1 / N, and that the price count-up contract mirrors v1's gating.
 */

test.describe("Flagship — count grammar (0 / 1 / N)", () => {
  test("n === 1 → singular sale + singular verb 'anchors'", () => {
    expect(hasCount(1)).toBe(true);
    expect(countSentence(1)).toBe("recent sale nearby anchors this number.");
    expect(priceNoteCountLabel(1)).toBe("1 recent sale");
  });

  test("n > 1 → plural sales + plural verb 'anchor'", () => {
    expect(countSentence(3)).toBe("recent sales nearby anchor this number.");
    expect(countSentence(12)).toBe("recent sales nearby anchor this number.");
    expect(priceNoteCountLabel(3)).toBe("3 recent sales");
    expect(priceNoteCountLabel(12)).toBe("12 recent sales");
  });

  test("n === 0 → no count block / no price note (nothing to anchor)", () => {
    expect(hasCount(0)).toBe(false);
  });

  test("'nearby' is one word (the production 'near by' typo is not reproduced)", () => {
    expect(countSentence(1)).toContain("nearby");
    expect(countSentence(1)).not.toContain("near by");
    expect(countSentence(4)).not.toContain("near by");
  });
});

test.describe("Flagship — price count-up contract (mirrors v1 gating)", () => {
  test("clean integer ≥ 100 opts into the count-up", () => {
    const attrs = priceCountupAttrs("$675,000");
    expect(attrs["data-price-countup"]).toBe("");
    expect(attrs["data-price-final"]).toBe("675000");
  });

  test("fancy / non-integer inputs stay static (no count-up attrs)", () => {
    expect(priceCountupAttrs("$675k")).toEqual({});
    expect(priceCountupAttrs("Call for price")).toEqual({});
    expect(priceCountupAttrs("$99")).toEqual({}); // below the 100 floor
  });

  test("priceParts groups digits with comma separators (matches motion end-state)", () => {
    const parts = priceParts("$687,298");
    expect(parts.kind).toBe("grouped");
    if (parts.kind === "grouped") {
      expect(parts.groups).toEqual(["687", "298"]);
      expect(parts.tail).toBe("");
    }
  });

  test("priceParts falls back to raw for non-numeric prices", () => {
    const parts = priceParts("Call for price");
    expect(parts.kind).toBe("raw");
    if (parts.kind === "raw") expect(parts.raw).toBe("Call for price");
  });
});
