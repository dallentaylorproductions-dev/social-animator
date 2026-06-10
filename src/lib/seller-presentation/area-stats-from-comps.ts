/**
 * Seller Presentation — derive the §05 Area Snapshot from the comp set
 * (FR-2). Pure functions, no React, no state, fully unit-testable.
 *
 * WHY THIS EXISTS
 * The Editorial §05 "Recent area sales" stat block + animated chart is
 * beautiful but agents won't fill it in by hand. The comp set the agent
 * already entered/imported on Step 2 carries everything the snapshot
 * needs, so we build the snapshot from the comps automatically. Manual
 * entry stays the override — anything the agent typed wins over the
 * derived value (see `mergeAreaStats`).
 *
 * WHAT IS DERIVABLE
 *   medianSale      ← median of counted comps' soldPrice (reuses
 *                     `computeCompMedian`, the same engine Step 3's
 *                     "From your comps · Median of N…" line is built on)
 *   daysOnMarket    ← median of counted comps' `daysOnMarket`
 *   listToSaleRatio ← median of counted comps' `saleToListPercent`
 *   closings90d     ← count of counted comps that CLOSED in the last 90
 *                     days (windowed against `now` so the §05 cell label
 *                     "Closings · 90 days" stays literally truthful — a
 *                     comp with no/old soldDate is NOT counted)
 *   monthlySeries   ← counted comps bucketed by sale month → median price
 *                     per month (needs ≥2 distinct months to be a trend)
 *
 * NOT derivable from comps (stay manual-only, never invented here):
 *   medianSaleDeltaYoy, daysOnMarketZipAvg — both need an external
 *   benchmark the comp set doesn't carry.
 *
 * TRUTHFUL-COPY DISCIPLINE: every field is OMITTED when its underlying
 * comp data is absent (no placeholder, no zero, no fake). An empty comp
 * set yields `{}`, so the merge collapses to `undefined` and §05 flexes
 * out exactly as LS-1 intended.
 */

import type {
  AreaStats,
  AreaStatsMonthly,
  Comp,
} from "@/tools/seller-presentation/engine/types";
import { computeCompMedian } from "./median";

/** Phase-B2 set-aside predicate — undefined/true counts, false is set aside. */
const isCounted = (c: Comp) => c.counted !== false;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Up to a year of monthly points; mirrors the editor's MAX_MONTHLY. */
const MAX_MONTHLY = 12;

/** Mirror of StepEditorial's MONTH_SHORT_NAMES so derived labels match
 *  the manually-authored "May '26" form byte-for-byte. */
const MONTH_SHORT_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Median of a non-empty numeric array (caller guarantees length ≥ 1). */
function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** "$685,432" → 685000 rounded to nearest thousand, locale-formatted.
 *  Matches StepStrategy's `fmtAboutThousands` so the §05 median reads the
 *  same as the Step-3 "from your comps" line.
 *  Exported so the RentCast normalizer formats market-sourced prices the
 *  same way comp-derived ones are (`rentcast-area-trend.ts`). */
export function formatAboutThousands(n: number): string {
  return "$" + (Math.round(n / 1000) * 1000).toLocaleString("en-US");
}

/** Strip non-digits from a free-text integer field ("21 days" → 21). */
function parseLooseInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

/** "98%" / "98" / "98.4%" → 98.4 (number). Null when unparseable. */
function parsePercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "$642,000" → 642000. Null when unparseable / non-positive. */
function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Parse a comp's `soldDate` ("ISO YYYY-MM-DD or free-text") into both an
 * epoch-ms timestamp (for the 90-day window) and a "YYYY-MM" month key
 * (for the chart buckets). Returns null when no usable date is present so
 * the caller can simply skip that comp.
 */
function parseSoldDate(
  raw: string | undefined,
): { ms: number; ym: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Fast path: leading ISO "YYYY-MM" (the form both the manual <input
  // type="date"> and the importer emit). Use UTC noon to dodge TZ edges.
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(trimmed);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10);
    const day = iso[3] ? Number.parseInt(iso[3], 10) : 1;
    if (month >= 1 && month <= 12) {
      const ms = Date.UTC(year, month - 1, day, 12);
      return { ms, ym: `${iso[1]}-${iso[2]}` };
    }
  }
  // Fallback: anything Date can parse (free-text). Derive the month key
  // from the parsed date so a "March 4, 2026" comp still buckets.
  const t = Date.parse(trimmed);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { ms: t, ym };
}

/** "2026-05" → "May '26"; falls back to the input if unparseable. Kept in
 *  lock-step with StepEditorial.formatMonthLabel.
 *  Exported so the RentCast normalizer emits the same "May '26" label form
 *  as comp-derived / manual series (`rentcast-area-trend.ts`). */
export function formatMonthLabel(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return ym;
  const monthIdx = Number.parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx >= MONTH_SHORT_NAMES.length) return ym;
  return `${MONTH_SHORT_NAMES[monthIdx]} '${match[1].slice(-2)}`;
}

/**
 * Bucket counted comps by sale month, take the median price per month,
 * and emit oldest-first {month, medianPrice} rows (the order the chart
 * reads left-to-right). Capped at the most-recent MAX_MONTHLY months.
 */
function deriveMonthlySeries(counted: Comp[]): AreaStatsMonthly[] {
  const byMonth = new Map<string, number[]>();
  for (const c of counted) {
    const date = parseSoldDate(c.soldDate);
    const price = parsePrice(c.soldPrice);
    if (!date || price === null) continue;
    const list = byMonth.get(date.ym);
    if (list) list.push(price);
    else byMonth.set(date.ym, [price]);
  }
  const ymSorted = [...byMonth.keys()].sort(); // ISO "YYYY-MM" sorts chronologically
  const recent = ymSorted.slice(-MAX_MONTHLY);
  return recent.map((ym) => ({
    month: formatMonthLabel(ym),
    medianPrice: formatAboutThousands(median(byMonth.get(ym)!)),
  }));
}

/**
 * Derive the area snapshot from the comp set. Returns ONLY the fields the
 * comp data supports — missing fields are omitted, never zeroed. An empty
 * (or fully set-aside) comp set returns `{}`.
 *
 * `opts.now` defaults to the current time; it's injectable so the
 * 90-day-closings window is deterministic in tests.
 */
export function deriveAreaStatsFromComps(
  comps: Comp[] | undefined,
  opts: { now?: Date } = {},
): Partial<AreaStats> {
  const counted = (comps ?? []).filter(isCounted);
  if (counted.length === 0) return {};

  const out: Partial<AreaStats> = {};

  // Median sale — reuse the Step-3 engine so §05 and Strategy agree.
  const med = computeCompMedian(counted, () => true);
  if (med && med.median > 0) out.medianSale = formatAboutThousands(med.median);

  // Days on market — median across comps that carry a DOM value.
  const doms = counted
    .map((c) => parseLooseInt(c.daysOnMarket))
    .filter((n): n is number => n !== null && n >= 0);
  if (doms.length > 0) out.daysOnMarket = String(Math.round(median(doms)));

  // List-to-sale ratio — median across comps that carry a sale-to-list %.
  const ratios = counted
    .map((c) => parsePercent(c.saleToListPercent))
    .filter((n): n is number => n !== null && n > 0);
  if (ratios.length > 0) out.listToSaleRatio = `${Math.round(median(ratios))}%`;

  // Closings · 90 days — count comps that genuinely closed in the window.
  const nowMs = (opts.now ?? new Date()).getTime();
  const windowStart = nowMs - NINETY_DAYS_MS;
  const closings = counted.filter((c) => {
    const date = parseSoldDate(c.soldDate);
    return date !== null && date.ms >= windowStart && date.ms <= nowMs;
  }).length;
  if (closings > 0) out.closings90d = String(closings);

  // Monthly chart — needs ≥2 distinct months to read as a trend.
  const series = deriveMonthlySeries(counted);
  if (series.length >= 2) out.monthlySeries = series;

  return out;
}

/** A non-empty string survives; blank/whitespace/undefined does not. */
function hasText(v: string | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Merge the agent's manually-entered snapshot over the comp-derived one:
 * a manually-entered field WINS; an absent manual field falls back to the
 * derived value. Returns `undefined` when neither source yields anything
 * renderable — so the caller (projectAreaStats / the renderer) keeps §05
 * flexed out, preserving LS-1's hidden-when-empty behavior.
 */
export function mergeAreaStats(
  manual: AreaStats | undefined,
  derived: Partial<AreaStats>,
): AreaStats | undefined {
  const pick = (m: string | undefined, d: string | undefined) =>
    hasText(m) ? m : d;

  const merged: AreaStats = {
    medianSale: pick(manual?.medianSale, derived.medianSale),
    // Not comp-derivable — manual only.
    medianSaleDeltaYoy: hasText(manual?.medianSaleDeltaYoy)
      ? manual!.medianSaleDeltaYoy
      : undefined,
    daysOnMarket: pick(manual?.daysOnMarket, derived.daysOnMarket),
    // Not comp-derivable — manual only.
    daysOnMarketZipAvg: hasText(manual?.daysOnMarketZipAvg)
      ? manual!.daysOnMarketZipAvg
      : undefined,
    closings90d: pick(manual?.closings90d, derived.closings90d),
    listToSaleRatio: pick(manual?.listToSaleRatio, derived.listToSaleRatio),
    monthlySeries:
      manual?.monthlySeries && manual.monthlySeries.length > 0
        ? manual.monthlySeries
        : derived.monthlySeries,
  };

  const renderable = Object.values(merged).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined,
  );
  return renderable ? merged : undefined;
}
