/**
 * Seller Presentation — comp median engine (Phase A foundation).
 *
 * Pure functions, no React, no state, fully unit-testable. Phase A
 * CREATES this engine; later phases (B2/B3/B6) wire it into the Step 3
 * "From your comps · Median of your N comparable sales" UI. Creating it
 * here means the truthful-copy guarantee — never render that line when
 * the math doesn't back it — is enforceable from day one, because
 * `computeCompMedian` returns `null` (not a zeroed object) whenever
 * there are no counted comps for the caller to gate on.
 *
 * NO median computation existed anywhere on the Seller Presentation
 * surface before this file — the redesign's median copy is a NEW
 * feature, not a relocation.
 */

import type { Comp } from "@/tools/seller-presentation/engine/types";

export interface MedianResult {
  median: number;
  low: number;
  high: number;
  /** ((high - low) / median) * 100, rounded to 1 decimal. */
  spreadPct: number;
  /** Number of comps that contributed (i.e. counted comps). */
  countedCount: number;
  /** Derived from spreadPct: <5% high, <=10% medium, >10% low. */
  confidence: "high" | "medium" | "low";
}

/**
 * Parse a comp's `soldPrice` (a formatted string like "$685,000") into
 * a number. Strips `$`, commas, and whitespace. Falls back to 0 on an
 * unparseable value and warn-logs so a fragile parse surfaces in the
 * console rather than silently skewing the statistic.
 */
function parseSoldPrice(soldPrice: string): number {
  const cleaned = soldPrice.replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[seller-presentation/median] unparseable soldPrice "${soldPrice}" — falling back to 0`,
    );
    return 0;
  }
  return n;
}

/** Median of a non-empty numeric array (caller guarantees length >= 1). */
function median(prices: number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** spreadPct → confidence band. <5% high, <=10% medium, >10% low. */
function confidenceFromSpread(spreadPct: number): "high" | "medium" | "low" {
  if (spreadPct < 5) return "high";
  if (spreadPct <= 10) return "medium";
  return "low";
}

/**
 * Compute the median-and-derivatives over the COUNTED comps.
 *
 * Returns `null` when there are zero counted comps — the caller must
 * decide what to render (truthful-copy rule: never display "From your
 * comps · Median of your N..." when the math doesn't back it). The
 * caller checks `!== null`.
 *
 * `isCounted` is supplied by the caller. No "counted" flag exists on
 * the production Comp shape yet — the per-comp set-aside concept lands
 * in Phase B2 (default: "all comps counted unless set-aside"). Phase A
 * just provides the function.
 */
export function computeCompMedian(
  comps: Comp[],
  isCounted: (c: Comp) => boolean,
): MedianResult | null {
  const prices = comps.filter(isCounted).map((c) => parseSoldPrice(c.soldPrice));
  if (prices.length === 0) return null;

  const med = median(prices);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Guard divide-by-zero: a median of 0 (e.g. every counted comp parsed
  // to 0) has no meaningful spread — report 0% (→ high) rather than NaN.
  const spreadPct =
    med === 0 ? 0 : Math.round(((high - low) / med) * 1000) / 10;

  return {
    median: med,
    low,
    high,
    spreadPct,
    countedCount: prices.length,
    confidence: confidenceFromSpread(spreadPct),
  };
}
