/**
 * Seller Presentation — P2-CHART: server-only RentCast fetch + per-zip-per-
 * month KV cache for the §05 area price-trend chart.
 *
 * SERVER-ONLY. This module reads `process.env.Rent_Cast_API` and calls the
 * RentCast API directly — it must never be imported into client code. The
 * only caller is the `/api/seller-presentation/area-trend` route (nodejs
 * runtime). The published consumer page NEVER calls this: the wizard resolves
 * the series at AUTHORING time and bakes it into the KV payload, so a 1:many
 * consumer page can't multiply the RentCast cost.
 *
 * COST DESIGN (the non-negotiable):
 *   • Cache key `area-trend:{zip}:{YYYY-MM}` (current month), reusing the same
 *     `@vercel/kv` store the publish flow uses (share-urls.ts). Cache HIT →
 *     return the cached NORMALIZED series (not the raw payload). Cache MISS →
 *     fetch RentCast ONCE, normalize, store. Net: ~1 RentCast request per zip
 *     per calendar month no matter how many presentations use that zip.
 *   • Empty / error / no-data results are NEVER cached as if they were data,
 *     so a transient outage doesn't poison the month's cache for a real zip.
 *
 * GRACEFUL FALLBACK (never hard-fail): missing key, RentCast error, rate-limit,
 * a zip RentCast has no data for, or a <2-point series all resolve to an
 * `ok:false` result with a machine code — the route maps that to a quiet
 * "enter manually" state and the wizard keeps today's manual/comp behavior.
 * Nothing here ever throws to the route.
 */

import { kv } from "@vercel/kv";
import type { AreaStatsMonthly } from "@/tools/seller-presentation/engine/types";
import {
  areaTrendCacheKey,
  isValidZip,
  normalizeRentCastSaleSeries,
} from "./rentcast-area-trend";

const RENTCAST_MARKETS_URL = "https://api.rentcast.io/v1/markets";
/** Default window — last 12 months of median sale price (RentCast history
 *  starts Jan 2024, so a full year is available; chart flexes if fewer). */
const HISTORY_RANGE_MONTHS = 12;
/** A trend needs ≥2 points to read as a line (matches AreaStats.tsx hasChart). */
const MIN_SERIES_POINTS = 2;
/** Cache TTL — comfortably longer than a month so the current bucket survives,
 *  but bounded so stale month buckets self-evict instead of accruing forever. */
const CACHE_TTL_SECONDS = 45 * 24 * 60 * 60;
/** Don't let a slow/hung RentCast call stall the wizard fetch. */
const FETCH_TIMEOUT_MS = 8000;

export type AreaTrendResult =
  | { ok: true; series: AreaStatsMonthly[]; source: "cache" | "live" }
  | { ok: false; code: "invalid-zip" | "key-missing" | "no-data" | "error" };

/** The slice of the `@vercel/kv` surface this module uses. Narrowed to an
 *  interface so tests can inject an in-memory store and assert cache hit/miss
 *  deterministically without a live KV connection. */
export interface AreaTrendKv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

/** Injectable seams so the orchestration is testable without a live network,
 *  KV, or the real clock. Defaults are the production `fetch` + `@vercel/kv`. */
export interface GetAreaPriceTrendDeps {
  now?: Date;
  fetchImpl?: typeof fetch;
  kvImpl?: AreaTrendKv;
}

/**
 * Resolve the normalized monthly median-sale series for a zip, cached per
 * zip per month. Returns `{ok:true, series, source}` on a hit/live fetch, or
 * `{ok:false, code}` for every fallback case. NEVER throws.
 */
export async function getAreaPriceTrend(
  zip: string,
  deps: GetAreaPriceTrendDeps = {},
): Promise<AreaTrendResult> {
  if (!isValidZip(zip)) return { ok: false, code: "invalid-zip" };
  const cleanZip = zip.trim();

  const apiKey = process.env.Rent_Cast_API;
  if (!apiKey) return { ok: false, code: "key-missing" };

  const now = deps.now ?? new Date();
  const doFetch = deps.fetchImpl ?? fetch;
  const store: AreaTrendKv = deps.kvImpl ?? kv;
  const cacheKey = areaTrendCacheKey(cleanZip, now);

  // 1) Cache hit — return the cached NORMALIZED series, no RentCast call.
  try {
    const cached = await store.get<AreaStatsMonthly[]>(cacheKey);
    if (Array.isArray(cached) && cached.length >= MIN_SERIES_POINTS) {
      return { ok: true, series: cached, source: "cache" };
    }
  } catch {
    // KV read failure is non-fatal — fall through to a live fetch.
  }

  // 2) Cache miss — fetch RentCast once.
  let raw: unknown;
  try {
    const url = new URL(RENTCAST_MARKETS_URL);
    url.searchParams.set("zipCode", cleanZip);
    url.searchParams.set("dataType", "Sale");
    url.searchParams.set("historyRange", String(HISTORY_RANGE_MONTHS));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method: "GET",
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // RentCast returns 404 for a zip it has no market data for — that's a
    // legitimate no-data fallback, not an error. Any other non-2xx (401 bad
    // key, 429 rate-limit, 5xx) is an error; both fall back gracefully.
    if (res.status === 404) return { ok: false, code: "no-data" };
    if (!res.ok) return { ok: false, code: "error" };
    raw = await res.json();
  } catch {
    // Network failure, timeout/abort, or unparseable JSON → graceful fallback.
    return { ok: false, code: "error" };
  }

  // 3) Normalize. A sparse/empty zip yields <2 points → no-data fallback.
  //    Crucially we do NOT cache the empty result, so a zip that gains data
  //    later isn't pinned to "empty" for the rest of the month.
  const series = normalizeRentCastSaleSeries(raw);
  if (series.length < MIN_SERIES_POINTS) return { ok: false, code: "no-data" };

  // 4) Store the normalized series for the rest of the month, then return.
  //    A KV write failure is non-fatal — the agent still gets live data; the
  //    next presentation in this zip just re-fetches.
  try {
    await store.set(cacheKey, series, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* best-effort cache write */
  }

  return { ok: true, series, source: "live" };
}
