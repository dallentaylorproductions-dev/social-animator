import { test, expect } from "@playwright/test";
import type {
  Comp,
  SellerPresentationDraft,
} from "../src/tools/seller-presentation/engine/types";
import {
  deriveAreaStatsFromComps,
  mergeAreaStats,
} from "../src/lib/seller-presentation/area-stats-from-comps";
import { toPublicPayload } from "../src/tools/seller-presentation/output/public-payload";

/**
 * FR-2 — derive the §05 area snapshot from the comp set.
 *
 * Pure-logic coverage (runs node-context under Playwright, the repo's only
 * runner — same rationale as median.spec.ts):
 *   - deriveAreaStatsFromComps: median / count / DOM / ratio / monthly chart,
 *     each OMITTED when its comp data is absent (truthful-copy).
 *   - mergeAreaStats: manual entry overrides derived; derived fills gaps;
 *     nothing renderable → undefined (LS-1 hidden-when-empty).
 *   - toPublicPayload end-to-end: comps alone populate §05; no comps + no
 *     manual entry hides it; a manually-entered field wins over derived.
 */

function comp(over: Partial<Comp> & { soldPrice: string }): Comp {
  return { address: "1 Test St", source: "manual", ...over };
}

// 2026-06-08 (matches the project's "today") — injected so the 90-day
// closings window is deterministic regardless of when the suite runs.
const NOW = new Date("2026-06-08T12:00:00Z");

function baseDraft(comps: Comp[]): SellerPresentationDraft {
  return {
    comps,
    pitchPoints: [],
    commitments: [],
    asks: [],
  } as SellerPresentationDraft;
}

test.describe("deriveAreaStatsFromComps", () => {
  test("no comps → {} (nothing to derive)", () => {
    expect(deriveAreaStatsFromComps([])).toEqual({});
    expect(deriveAreaStatsFromComps(undefined)).toEqual({});
  });

  test("all comps set-aside (counted:false) → {}", () => {
    const out = deriveAreaStatsFromComps([
      comp({ soldPrice: "$700,000", counted: false }),
    ]);
    expect(out).toEqual({});
  });

  test("median sale + count derive from price alone (always-on)", () => {
    const out = deriveAreaStatsFromComps(
      [
        comp({ soldPrice: "$600,000", soldDate: "2026-05-10" }),
        comp({ soldPrice: "$700,000", soldDate: "2026-05-20" }),
        comp({ soldPrice: "$800,000", soldDate: "2026-06-01" }),
      ],
      { now: NOW },
    );
    expect(out.medianSale).toBe("$700,000");
    // All three closed inside the 90-day window ending 2026-06-08.
    expect(out.closings90d).toBe("3");
  });

  test("days on market = median of comps that carry DOM", () => {
    const out = deriveAreaStatsFromComps([
      comp({ soldPrice: "$600,000", daysOnMarket: "10" }),
      comp({ soldPrice: "$700,000", daysOnMarket: "20" }),
      comp({ soldPrice: "$800,000", daysOnMarket: "30" }),
    ]);
    expect(out.daysOnMarket).toBe("20");
  });

  test("list-to-sale ratio = median of comps that carry sale-to-list %", () => {
    const out = deriveAreaStatsFromComps([
      comp({ soldPrice: "$600,000", saleToListPercent: "98%" }),
      comp({ soldPrice: "$700,000", saleToListPercent: "100%" }),
      comp({ soldPrice: "$800,000", saleToListPercent: "103%" }),
    ]);
    expect(out.listToSaleRatio).toBe("100%");
  });

  test("monthly series buckets by sale month (oldest-first), needs ≥2 months", () => {
    const out = deriveAreaStatsFromComps([
      comp({ soldPrice: "$600,000", soldDate: "2026-03-04" }),
      comp({ soldPrice: "$640,000", soldDate: "2026-04-11" }),
      comp({ soldPrice: "$620,000", soldDate: "2026-04-25" }),
      comp({ soldPrice: "$680,000", soldDate: "2026-05-02" }),
    ]);
    expect(out.monthlySeries).toBeDefined();
    expect(out.monthlySeries).toHaveLength(3);
    expect(out.monthlySeries![0].month).toBe("Mar '26");
    expect(out.monthlySeries![2].month).toBe("May '26");
    // April bucket → median of 640k & 620k = 630k.
    expect(out.monthlySeries![1].medianPrice).toBe("$630,000");
  });

  test("single sale month → no monthly series (not a trend)", () => {
    const out = deriveAreaStatsFromComps([
      comp({ soldPrice: "$600,000", soldDate: "2026-05-04" }),
      comp({ soldPrice: "$640,000", soldDate: "2026-05-11" }),
    ]);
    expect(out.monthlySeries).toBeUndefined();
  });

  test("absent fields are OMITTED, never zeroed (truthful-copy)", () => {
    // Price only — no DOM, no ratio, no date.
    const out = deriveAreaStatsFromComps([comp({ soldPrice: "$650,000" })]);
    expect(out.medianSale).toBe("$650,000");
    expect(out.daysOnMarket).toBeUndefined();
    expect(out.listToSaleRatio).toBeUndefined();
    expect(out.closings90d).toBeUndefined();
    expect(out.monthlySeries).toBeUndefined();
  });

  test("closings window excludes sales older than 90 days", () => {
    const out = deriveAreaStatsFromComps(
      [
        comp({ soldPrice: "$600,000", soldDate: "2025-10-01" }), // ~8 months old
        comp({ soldPrice: "$700,000", soldDate: "2026-05-20" }), // in window
      ],
      { now: NOW },
    );
    expect(out.closings90d).toBe("1");
  });

  test("set-aside comps don't feed any derived figure", () => {
    const out = deriveAreaStatsFromComps([
      comp({ soldPrice: "$600,000", daysOnMarket: "10" }),
      comp({ soldPrice: "$2,000,000", daysOnMarket: "200", counted: false }),
    ]);
    expect(out.medianSale).toBe("$600,000");
    expect(out.daysOnMarket).toBe("10");
  });
});

test.describe("mergeAreaStats", () => {
  test("manual entry wins over the derived value, field-by-field", () => {
    const merged = mergeAreaStats(
      { medianSale: "$999,000" },
      { medianSale: "$700,000", daysOnMarket: "14" },
    );
    expect(merged?.medianSale).toBe("$999,000"); // manual wins
    expect(merged?.daysOnMarket).toBe("14"); // derived fills the gap
  });

  test("blank manual field falls back to derived", () => {
    const merged = mergeAreaStats(
      { medianSale: "   " },
      { medianSale: "$700,000" },
    );
    expect(merged?.medianSale).toBe("$700,000");
  });

  test("manual monthly series wins whole-cloth over derived", () => {
    const manualSeries = [{ month: "Jan '26", medianPrice: "$1" }];
    const merged = mergeAreaStats(
      { monthlySeries: manualSeries },
      { monthlySeries: [{ month: "May '26", medianPrice: "$2" }] },
    );
    expect(merged?.monthlySeries).toEqual(manualSeries);
  });

  test("nothing renderable from either side → undefined", () => {
    expect(mergeAreaStats(undefined, {})).toBeUndefined();
    expect(mergeAreaStats({}, {})).toBeUndefined();
  });
});

test.describe("toPublicPayload — §05 auto-fills from comps", () => {
  test("comps alone populate §05 (no manual area entry needed)", () => {
    const draft = baseDraft([
      comp({ soldPrice: "$600,000", daysOnMarket: "10", saleToListPercent: "98%" }),
      comp({ soldPrice: "$700,000", daysOnMarket: "20", saleToListPercent: "100%" }),
      comp({ soldPrice: "$800,000", daysOnMarket: "30", saleToListPercent: "102%" }),
    ]);
    const payload = toPublicPayload(draft, {});
    expect(payload.areaStats).toBeDefined();
    expect(payload.areaStats?.medianSale).toBe("$700,000");
    expect(payload.areaStats?.daysOnMarket).toBe("20");
    expect(payload.areaStats?.listToSaleRatio).toBe("100%");
  });

  test("no comps + no manual entry → §05 stays hidden (areaStats undefined)", () => {
    const payload = toPublicPayload(baseDraft([]), {});
    expect(payload.areaStats).toBeUndefined();
  });

  test("a manually-entered field overrides the comp-derived one", () => {
    const draft = baseDraft([
      comp({ soldPrice: "$600,000" }),
      comp({ soldPrice: "$800,000" }),
    ]);
    draft.areaStats = { medianSale: "$725,000" };
    const payload = toPublicPayload(draft, {});
    // Manual median wins; derived would have been $700,000.
    expect(payload.areaStats?.medianSale).toBe("$725,000");
  });

  test("set-aside comps are excluded from the derived snapshot", () => {
    const draft = baseDraft([
      comp({ soldPrice: "$600,000" }),
      comp({ soldPrice: "$5,000,000", counted: false }),
    ]);
    const payload = toPublicPayload(draft, {});
    expect(payload.areaStats?.medianSale).toBe("$600,000");
  });
});
