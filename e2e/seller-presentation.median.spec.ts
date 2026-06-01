import { test, expect } from "@playwright/test";
import type { Comp } from "../src/tools/seller-presentation/engine/types";
import { computeCompMedian } from "../src/lib/seller-presentation/median";

/**
 * Seller Presentation — comp median engine unit tests (Phase A).
 *
 * NOTE ON LOCATION: the Phase A packet specified Vitest at
 * `src/lib/seller-presentation/median.test.ts`. This repo has no Vitest
 * (no `npm test` script, no vitest config, no existing unit tests) and
 * Phase A forbids new dependencies. The only runner present is
 * Playwright. `computeCompMedian` is a pure function (its single `Comp`
 * import is type-only, erased at compile), so it runs fine as a
 * node-context Playwright spec — and this way the tests actually execute
 * in the existing CI rather than rotting at an unrunnable path. Same
 * coverage the packet asked for: empty → null, single, even/odd median,
 * tight/wide spread → confidence, comma+$ parsing, and the isCounted
 * predicate.
 */

function comp(soldPrice: string): Comp {
  return { address: "1 Test St", soldPrice, source: "manual" };
}

// Every comp counts unless a test overrides the predicate.
const all = () => true;

test.describe("computeCompMedian", () => {
  test("empty input → null (truthful-copy gate)", () => {
    expect(computeCompMedian([], all)).toBeNull();
  });

  test("no counted comps → null even when comps exist", () => {
    const result = computeCompMedian([comp("$500,000")], () => false);
    expect(result).toBeNull();
  });

  test("single comp → median = that price, spread 0, high confidence", () => {
    const result = computeCompMedian([comp("$685,000")], all);
    expect(result).not.toBeNull();
    expect(result!.median).toBe(685000);
    expect(result!.low).toBe(685000);
    expect(result!.high).toBe(685000);
    expect(result!.spreadPct).toBe(0);
    expect(result!.countedCount).toBe(1);
    expect(result!.confidence).toBe("high");
  });

  test("four comps, tight spread → high confidence", () => {
    const result = computeCompMedian(
      [comp("$495,000"), comp("$500,000"), comp("$505,000"), comp("$510,000")],
      all,
    );
    // sorted [495k,500k,505k,510k] → median (500k+505k)/2 = 502,500
    expect(result!.median).toBe(502500);
    expect(result!.low).toBe(495000);
    expect(result!.high).toBe(510000);
    // (15,000 / 502,500) * 100 = 2.985... → 3.0
    expect(result!.spreadPct).toBe(3);
    expect(result!.countedCount).toBe(4);
    expect(result!.confidence).toBe("high");
  });

  test("four comps, wide spread → low confidence", () => {
    const result = computeCompMedian(
      [comp("$400,000"), comp("$500,000"), comp("$600,000"), comp("$700,000")],
      all,
    );
    // sorted → median (500k+600k)/2 = 550,000; spread (300k/550k)*100 = 54.5
    expect(result!.median).toBe(550000);
    expect(result!.spreadPct).toBe(54.5);
    expect(result!.confidence).toBe("low");
  });

  test("medium band boundary: 5%–10% spread → medium", () => {
    // median 500k, low 487.5k, high 512.5k → spread exactly 5.0% → medium
    const result = computeCompMedian(
      [comp("$487,500"), comp("$500,000"), comp("$512,500")],
      all,
    );
    expect(result!.median).toBe(500000);
    expect(result!.spreadPct).toBe(5);
    expect(result!.confidence).toBe("medium");
  });

  test("even-count median averages the two middle values", () => {
    const result = computeCompMedian([comp("$400,000"), comp("$600,000")], all);
    expect(result!.median).toBe(500000);
    expect(result!.countedCount).toBe(2);
  });

  test("odd-count median picks the middle value", () => {
    const result = computeCompMedian(
      [comp("$400,000"), comp("$450,000"), comp("$600,000")],
      all,
    );
    expect(result!.median).toBe(450000);
  });

  test("parses comma + dollar-sign soldPrice strings", () => {
    const result = computeCompMedian([comp("$1,200,000")], all);
    expect(result!.median).toBe(1200000);
  });

  test("isCounted predicate filters which comps contribute", () => {
    const comps = [comp("$400,000"), comp("$500,000"), comp("$900,000")];
    // Count only the first → countedCount 1, median = 400k.
    const result = computeCompMedian(comps, (c) => c.soldPrice === "$400,000");
    expect(result!.countedCount).toBe(1);
    expect(result!.median).toBe(400000);
  });
});
