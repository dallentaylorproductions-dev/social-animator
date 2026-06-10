import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Seller Presentation — P2-CHART: RentCast area price-trend (pure, offline).
 *
 * Covers, all in node-context with NO live RentCast call (cost + flake):
 *   1. normalizer — the captured-shape fixture → `monthlySeries` (oldest-first,
 *      "Mon 'YY" labels, "$X,000" prices), plus the defensive edge cases
 *      (zero/missing medianPrice dropped, non-YYYY-MM keys ignored, >12 capped,
 *      malformed/empty payload → []).
 *   2. cache-key derivation — `area-trend:{zip}:{YYYY-MM}` is the cost lever.
 *   3. getAreaPriceTrend fallback SELECTION — invalid-zip / key-missing /
 *      no-data / error each resolve to the right code without throwing.
 *   4. cache HIT vs MISS — a hit returns the cached series and makes NO fetch;
 *      a miss fetches once, normalizes, and writes the normalized series.
 *   5. flag-off == current behavior — the flag helper reads the env exactly.
 *
 * The RentCast network + KV are injected (fetchImpl / kvImpl seams), so this
 * spec is deterministic, free, and offline. The live-API validation is the
 * Preview smoke (the fixture is built to the documented market-data schema).
 */

import {
  normalizeRentCastSaleSeries,
  areaTrendCacheKey,
  yearMonth,
  isValidZip,
  isAreaChartRentcastEnabled,
} from '../src/lib/seller-presentation/rentcast-area-trend';
import {
  getAreaPriceTrend,
  type AreaTrendKv,
} from '../src/lib/seller-presentation/get-area-price-trend';
import type { AreaStatsMonthly } from '../src/tools/seller-presentation/engine/types';

const FIXTURE_PATH = path.resolve(
  __dirname,
  'fixtures/rentcast/markets-98406-sale.json',
);

async function loadFixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
}

/** Build a fetchImpl that returns the given JSON body + status, and records
 *  how many times it was called (to prove cache hits skip the network). */
function stubFetch(
  body: unknown,
  status = 200,
): { fetchImpl: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

/** An in-memory KV honoring the narrow AreaTrendKv surface. */
function memKv(seed?: Record<string, unknown>): AreaTrendKv & {
  setCalls: () => number;
} {
  const store = new Map<string, unknown>(Object.entries(seed ?? {}));
  let setCalls = 0;
  return {
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      setCalls += 1;
      store.set(key, value);
      return 'OK';
    },
    setCalls: () => setCalls,
  };
}

const NOW = new Date('2026-05-15T12:00:00.000Z');

test.describe('P2-CHART normalizer — RentCast saleData.history → monthlySeries', () => {
  test('the captured-shape fixture yields a 12-point oldest-first series', async () => {
    const fixture = await loadFixture();
    const series = normalizeRentCastSaleSeries(fixture);

    expect(series).toHaveLength(12);
    // Oldest-first, byte-identical label form to the comp/manual paths.
    expect(series[0]).toEqual({ month: "Jun '25", medianPrice: '$605,000' });
    expect(series[11]).toEqual({ month: "May '26", medianPrice: '$642,000' });
    // Monotonic month ordering (chronological).
    const months = series.map((m) => m.month);
    expect(months).toEqual([
      "Jun '25", "Jul '25", "Aug '25", "Sep '25", "Oct '25", "Nov '25",
      "Dec '25", "Jan '26", "Feb '26", "Mar '26", "Apr '26", "May '26",
    ]);
  });

  test('drops zero/missing medianPrice months and ignores non-YYYY-MM keys', () => {
    const raw = {
      saleData: {
        history: {
          '2026-01': { date: '2026-01-01', medianPrice: 500000 },
          '2026-02': { date: '2026-02-01', medianPrice: 0 }, // zero → dropped
          '2026-03': { date: '2026-03-01' }, // missing medianPrice → dropped
          '2026-04': { date: '2026-04-01', medianPrice: 510000 },
          'latest': { medianPrice: 999999 }, // non-YYYY-MM key → ignored
        },
      },
    };
    const series = normalizeRentCastSaleSeries(raw);
    expect(series).toEqual([
      { month: "Jan '26", medianPrice: '$500,000' },
      { month: "Apr '26", medianPrice: '$510,000' },
    ]);
  });

  test('caps at the most-recent 12 months', () => {
    const history: Record<string, unknown> = {};
    // 15 months of data; only the most-recent 12 should survive.
    for (let i = 0; i < 15; i++) {
      const m = String((i % 12) + 1).padStart(2, '0');
      const y = 2024 + Math.floor(i / 12);
      history[`${y}-${m}`] = { medianPrice: 400000 + i * 1000 };
    }
    const series = normalizeRentCastSaleSeries({ saleData: { history } });
    expect(series).toHaveLength(12);
  });

  test('malformed / empty payloads collapse to [] (never throws)', () => {
    expect(normalizeRentCastSaleSeries(null)).toEqual([]);
    expect(normalizeRentCastSaleSeries(undefined)).toEqual([]);
    expect(normalizeRentCastSaleSeries('nope')).toEqual([]);
    expect(normalizeRentCastSaleSeries({})).toEqual([]);
    expect(normalizeRentCastSaleSeries({ saleData: {} })).toEqual([]);
    expect(normalizeRentCastSaleSeries({ saleData: { history: {} } })).toEqual([]);
  });
});

test.describe('P2-CHART cache-key derivation (the per-zip-per-month cost lever)', () => {
  test('keys as area-trend:{zip}:{YYYY-MM} for the current month', () => {
    expect(yearMonth(NOW)).toBe('2026-05');
    expect(areaTrendCacheKey('98406', NOW)).toBe('area-trend:98406:2026-05');
    expect(areaTrendCacheKey('98406', new Date('2026-12-02T00:00:00Z'))).toBe(
      'area-trend:98406:2026-12',
    );
  });

  test('isValidZip accepts only 5-digit zips', () => {
    expect(isValidZip('98406')).toBe(true);
    expect(isValidZip(' 98406 ')).toBe(true);
    expect(isValidZip('9840')).toBe(false);
    expect(isValidZip('984066')).toBe(false);
    expect(isValidZip('abcde')).toBe(false);
    expect(isValidZip(undefined)).toBe(false);
    expect(isValidZip(98406 as unknown)).toBe(false);
  });
});

test.describe('P2-CHART getAreaPriceTrend — fallback selection + cache hit/miss', () => {
  test('invalid zip → invalid-zip, no key/fetch needed', async () => {
    const result = await getAreaPriceTrend('123', { now: NOW });
    expect(result).toEqual({ ok: false, code: 'invalid-zip' });
  });

  test('missing Rent_Cast_API key → key-missing', async () => {
    const prev = process.env.Rent_Cast_API;
    delete process.env.Rent_Cast_API;
    try {
      const result = await getAreaPriceTrend('98406', { now: NOW });
      expect(result).toEqual({ ok: false, code: 'key-missing' });
    } finally {
      if (prev !== undefined) process.env.Rent_Cast_API = prev;
    }
  });

  test('cache MISS → fetches once, normalizes, writes the normalized series', async () => {
    const prev = process.env.Rent_Cast_API;
    process.env.Rent_Cast_API = 'test-key';
    try {
      const fixture = await loadFixture();
      const { fetchImpl, calls } = stubFetch(fixture);
      const kvImpl = memKv();
      const result = await getAreaPriceTrend('98406', {
        now: NOW,
        fetchImpl,
        kvImpl,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe('live');
        expect(result.series).toHaveLength(12);
        expect(result.series[0]).toEqual({
          month: "Jun '25",
          medianPrice: '$605,000',
        });
      }
      expect(calls()).toBe(1); // one RentCast call
      expect(kvImpl.setCalls()).toBe(1); // normalized series cached
    } finally {
      if (prev !== undefined) process.env.Rent_Cast_API = prev;
      else delete process.env.Rent_Cast_API;
    }
  });

  test('cache HIT → returns cached series, makes NO RentCast call', async () => {
    const prev = process.env.Rent_Cast_API;
    process.env.Rent_Cast_API = 'test-key';
    try {
      const cached: AreaStatsMonthly[] = [
        { month: "Apr '26", medianPrice: '$640,000' },
        { month: "May '26", medianPrice: '$642,000' },
      ];
      const kvImpl = memKv({ 'area-trend:98406:2026-05': cached });
      const { fetchImpl, calls } = stubFetch({}, 500); // would error if called
      const result = await getAreaPriceTrend('98406', {
        now: NOW,
        fetchImpl,
        kvImpl,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe('cache');
        expect(result.series).toEqual(cached);
      }
      expect(calls()).toBe(0); // the cost lever: NO second RentCast call
    } finally {
      if (prev !== undefined) process.env.Rent_Cast_API = prev;
      else delete process.env.Rent_Cast_API;
    }
  });

  test('RentCast 404 (zip with no data) → no-data, nothing cached', async () => {
    const prev = process.env.Rent_Cast_API;
    process.env.Rent_Cast_API = 'test-key';
    try {
      const kvImpl = memKv();
      const { fetchImpl } = stubFetch({ error: 'not found' }, 404);
      const result = await getAreaPriceTrend('00000', {
        now: NOW,
        fetchImpl,
        kvImpl,
      });
      expect(result).toEqual({ ok: false, code: 'no-data' });
      expect(kvImpl.setCalls()).toBe(0); // never cache a no-data result
    } finally {
      if (prev !== undefined) process.env.Rent_Cast_API = prev;
      else delete process.env.Rent_Cast_API;
    }
  });

  test('sparse history (<2 usable points) → no-data, nothing cached', async () => {
    const prev = process.env.Rent_Cast_API;
    process.env.Rent_Cast_API = 'test-key';
    try {
      const kvImpl = memKv();
      const { fetchImpl } = stubFetch({
        saleData: { history: { '2026-05': { medianPrice: 642000 } } },
      });
      const result = await getAreaPriceTrend('98406', {
        now: NOW,
        fetchImpl,
        kvImpl,
      });
      expect(result).toEqual({ ok: false, code: 'no-data' });
      expect(kvImpl.setCalls()).toBe(0);
    } finally {
      if (prev !== undefined) process.env.Rent_Cast_API = prev;
      else delete process.env.Rent_Cast_API;
    }
  });

  test('RentCast 5xx / rate-limit → error, nothing cached', async () => {
    const prev = process.env.Rent_Cast_API;
    process.env.Rent_Cast_API = 'test-key';
    try {
      const kvImpl = memKv();
      const { fetchImpl } = stubFetch({ error: 'rate limited' }, 429);
      const result = await getAreaPriceTrend('98406', {
        now: NOW,
        fetchImpl,
        kvImpl,
      });
      expect(result).toEqual({ ok: false, code: 'error' });
      expect(kvImpl.setCalls()).toBe(0);
    } finally {
      if (prev !== undefined) process.env.Rent_Cast_API = prev;
      else delete process.env.Rent_Cast_API;
    }
  });
});

test.describe('P2-CHART flag — OFF by default == pre-P2 behavior', () => {
  test('isAreaChartRentcastEnabled reads AREA_CHART_RENTCAST_ENABLED exactly', () => {
    const prev = process.env.AREA_CHART_RENTCAST_ENABLED;
    try {
      delete process.env.AREA_CHART_RENTCAST_ENABLED;
      expect(isAreaChartRentcastEnabled()).toBe(false); // OFF by default
      process.env.AREA_CHART_RENTCAST_ENABLED = 'false';
      expect(isAreaChartRentcastEnabled()).toBe(false);
      process.env.AREA_CHART_RENTCAST_ENABLED = '1';
      expect(isAreaChartRentcastEnabled()).toBe(false); // only "true" enables
      process.env.AREA_CHART_RENTCAST_ENABLED = 'true';
      expect(isAreaChartRentcastEnabled()).toBe(true);
    } finally {
      if (prev !== undefined) process.env.AREA_CHART_RENTCAST_ENABLED = prev;
      else delete process.env.AREA_CHART_RENTCAST_ENABLED;
    }
  });
});
