/**
 * Seller Presentation — P2-CHART: normalize a RentCast market-statistics
 * response into the §05 area chart's `monthlySeries` shape. Pure functions,
 * no fetch, no KV, no React — fully unit-testable against a captured fixture.
 *
 * WHY THIS EXISTS
 * The §05 "Recent area sales" chart used to draw a lazy comp-bucketed (or
 * manually-typed) line. P2-CHART sources a credible month-by-month median
 * SALE PRICE trend from RentCast's market-statistics endpoint. The fetch +
 * cache live in `get-area-price-trend.ts` (server-only); this module is the
 * pure boundary that turns RentCast's raw JSON into the chart's series, so
 * the shape mapping is testable without a network call or the API key.
 *
 * OBSERVED RENTCAST SHAPE (probed 2026-06-10 from the RentCast docs —
 * GET https://api.rentcast.io/v1/markets?zipCode={zip}&dataType=Sale,
 * auth header `X-Api-Key`, `historyRange` defaults to 12):
 *
 *   {
 *     "saleData": {
 *       "medianPrice": 642000,            // current snapshot (unused here)
 *       "history": {
 *         "2025-08": {                    // OBJECT keyed by "YYYY-MM"
 *           "date": "2025-08-01T00:00:00.000Z",
 *           "medianPrice": 295000,
 *           "averagePrice": 356598,
 *           ...
 *         },
 *         "2025-09": { ... },
 *         ...
 *       }
 *     },
 *     "rentalData": { ... }               // ignored (dataType=Sale path)
 *   }
 *
 * We read the monthly MEDIAN SALE PRICE from `saleData.history.{YYYY-MM}.
 * medianPrice`, sort the month keys chronologically, take the most-recent
 * MAX_MONTHLY, and emit oldest-first `{month, medianPrice}` rows in the
 * EXACT label/price form the comp-derived + manual paths use (so the chart,
 * the clamp, and the serializer can't tell market-sourced rows apart).
 *
 * If RentCast's shape ever diverges from the above, this normalizer simply
 * returns fewer/zero rows — never throws — so the caller falls back cleanly.
 */

import type { AreaStatsMonthly } from "@/tools/seller-presentation/engine/types";
import {
  formatAboutThousands,
  formatMonthLabel,
} from "./area-stats-from-comps";

/** Up to a year of monthly points; mirrors the editor's MAX_MONTHLY and the
 *  comp-derivation cap so a RentCast series can't outrun the chart's domain. */
const MAX_MONTHLY = 12;

/** The flag that gates the WHOLE RentCast path (server + client affordance).
 *  OFF by default — flag off ⇒ exact pre-P2 behavior (manual/comp series).
 *  Mirrors the `COMP_IMPORT_ENABLED === "true"` kill-switch pattern. */
export function isAreaChartRentcastEnabled(): boolean {
  return process.env.AREA_CHART_RENTCAST_ENABLED === "true";
}

/** A "YYYY-MM" month stamp for a given date. The cache key's month bucket is
 *  derived from THIS so a zip is fetched ~once per calendar month. */
export function yearMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * KV cache key: `area-trend:{zip}:{YYYY-MM}` (current month). This is the
 * cost lever — every presentation in the same zip in the same month reads
 * the cached NORMALIZED series, so RentCast is hit ~once per zip per month
 * regardless of how many presentations (or page views) reference it.
 */
export function areaTrendCacheKey(zip: string, now: Date): string {
  return `area-trend:${zip}:${yearMonth(now)}`;
}

/** Strict 5-digit US zip. Anything else short-circuits to the fallback path
 *  (no fetch, no cache write) — RentCast only keys on 5-digit zips. */
export function isValidZip(zip: unknown): zip is string {
  return typeof zip === "string" && /^\d{5}$/.test(zip.trim());
}

/** A finite, positive price survives; 0 / negative / NaN / non-number does not.
 *  RentCast omits fields it has no data for, so a missing/zero medianPrice for
 *  a sparse month is simply dropped rather than charted as a $0 dip. */
function isUsablePrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Normalize a RentCast `/v1/markets` (dataType=Sale) response into the chart's
 * `monthlySeries`. Returns oldest-first `{month, medianPrice}` rows, capped at
 * the most-recent MAX_MONTHLY months, formatted byte-identically to the
 * comp-derived / manual series. NEVER throws — a malformed/absent payload, an
 * empty history, or a shape mismatch all collapse to `[]` so the caller falls
 * back to today's behavior.
 *
 * @param raw  The parsed RentCast JSON (or anything — defended at the boundary).
 */
export function normalizeRentCastSaleSeries(raw: unknown): AreaStatsMonthly[] {
  if (!raw || typeof raw !== "object") return [];
  const saleData = (raw as Record<string, unknown>).saleData;
  if (!saleData || typeof saleData !== "object") return [];
  const history = (saleData as Record<string, unknown>).history;
  if (!history || typeof history !== "object") return [];

  const rows: Array<{ ym: string; price: number }> = [];
  for (const [ym, entry] of Object.entries(history as Record<string, unknown>)) {
    // Month keys are "YYYY-MM"; ignore anything that isn't (defensive).
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    if (!entry || typeof entry !== "object") continue;
    const price = (entry as Record<string, unknown>).medianPrice;
    if (!isUsablePrice(price)) continue;
    rows.push({ ym, price });
  }

  // "YYYY-MM" sorts chronologically as a plain string. Oldest-first is the
  // order the chart reads left-to-right; keep the most-recent MAX_MONTHLY.
  rows.sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0));
  const recent = rows.slice(-MAX_MONTHLY);

  return recent.map(({ ym, price }) => ({
    month: formatMonthLabel(ym),
    medianPrice: formatAboutThousands(price),
  }));
}
