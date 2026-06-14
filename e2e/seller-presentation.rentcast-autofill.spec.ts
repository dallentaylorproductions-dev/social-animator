import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Seller Presentation - Phase 2 (SP-AUTOFILL): RentCast property + nearby-sales
 * autofill (pure, offline). No live RentCast call (cost + flake): the network +
 * KV are injected via the fetchImpl / kvImpl seams, mirroring the area-trend
 * spec. The live-API validation is the Preview smoke.
 *
 * Covers:
 *   1. normalizeAddressKey / autofillCacheKey - the cost lever (one key per
 *      address spelling, versioned).
 *   2. normalizePropertyRecord - array + object shapes, partial fields, empty.
 *   3. normalizeAvmComps - fixture -> Comp[], cap, skips rows with no address or
 *      no price, malformed -> [].
 *   4. getAddressAutofill - key-missing / invalid-address gating; cache HIT
 *      (no fetch) vs MISS (fetch once + write normalized); partial endpoint
 *      success; no-data -> empty without caching.
 *   5. The route is server-only + flag-gated + has a maxDuration (structural).
 */

import {
  normalizeAddressKey,
  autofillCacheKey,
  normalizePropertyRecord,
  normalizeAvmComps,
  compHasPhoto,
  selectKeptComps,
  MAX_AUTOFILL_COMPS,
  MAX_COMP_CANDIDATES,
} from "../src/lib/seller-presentation/rentcast-autofill";
import type { Comp } from "../src/tools/seller-intelligence-report/engine/types";
import {
  getAddressAutofill,
  type AutofillKv,
} from "../src/lib/seller-presentation/get-property-autofill";

/* ------------------------------------------------------------------ seams */

/** A fetchImpl that maps a URL substring -> { body, status }, recording calls
 *  so a cache hit can be proven to skip the network. */
function routedFetch(
  routes: Array<{ match: string; body: unknown; status?: number }>,
): { fetchImpl: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetchImpl = (async (input: unknown) => {
    calls += 1;
    const url = String(input);
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

function memKv(seed?: Record<string, unknown>): AutofillKv & {
  setCalls: () => number;
  keys: () => string[];
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
      return "OK";
    },
    setCalls: () => setCalls,
    keys: () => [...store.keys()],
  };
}

const PROPERTIES_FIXTURE = [
  {
    bedrooms: 3,
    bathrooms: 2.5,
    squareFootage: 2140,
    yearBuilt: 1998,
    // extra fields that must be dropped at the boundary:
    ownerName: "PRIVATE",
    taxAssessments: { "2025": { value: 500000 } },
  },
];

const AVM_FIXTURE = {
  price: 642000,
  comparables: [
    {
      formattedAddress: "742 N Cedar St, Tacoma, WA 98406",
      price: 685000,
      removedDate: "2026-04-12T00:00:00.000Z",
      squareFootage: 2210,
      yearBuilt: 1996,
      correlation: 0.97,
    },
    {
      formattedAddress: "1120 S Ainsworth Ave, Tacoma, WA 98405",
      price: 640000,
      lastSeenDate: "2026-03-01",
      squareFootage: 1980,
      yearBuilt: 1925,
    },
    { addressLine1: "915 N Steele St", price: 599000 }, // uses addressLine1
    { formattedAddress: "No price comp, dropped", correlation: 0.5 }, // skip
    { price: 500000 }, // no address, skip
    { formattedAddress: "Fourth kept comp", price: 700000 },
    { formattedAddress: "Fifth comp beyond the cap", price: 710000 },
  ],
};

/* --------------------------------------------------------- address keying */

test.describe("SP-AUTOFILL - address key + cache key", () => {
  test("normalizeAddressKey collapses spelling variants to one key", () => {
    const a = normalizeAddressKey("742 N. Cedar St., Tacoma, WA 98406");
    const b = normalizeAddressKey("  742  N Cedar St  Tacoma WA 98406 ");
    expect(a).toBe("742 n cedar st tacoma wa 98406");
    expect(a).toBe(b);
  });

  test("normalizeAddressKey rejects unusable input", () => {
    expect(normalizeAddressKey("")).toBe("");
    expect(normalizeAddressKey("   ")).toBe("");
    expect(normalizeAddressKey(undefined)).toBe("");
    expect(normalizeAddressKey(42)).toBe("");
  });

  test("autofillCacheKey is per-kind + versioned (v2: larger candidate pool)", () => {
    const k = normalizeAddressKey("742 N Cedar St, Tacoma");
    expect(autofillCacheKey("prop", k)).toBe(
      "sp-autofill:v2:prop:742 n cedar st tacoma",
    );
    expect(autofillCacheKey("comps", k)).toBe(
      "sp-autofill:v2:comps:742 n cedar st tacoma",
    );
  });
});

/* ----------------------------------------------------- property normalizer */

test.describe("SP-AUTOFILL - normalizePropertyRecord", () => {
  test("array shape -> subject fields (strings); extras dropped", () => {
    const out = normalizePropertyRecord(PROPERTIES_FIXTURE);
    expect(out).toEqual({
      bedrooms: "3",
      baths: "2.5",
      sqft: "2,140",
      yearBuilt: "1998",
    });
  });

  test("object shape (single record, not array) is accepted", () => {
    const out = normalizePropertyRecord(PROPERTIES_FIXTURE[0]);
    expect(out.bedrooms).toBe("3");
    expect(out.sqft).toBe("2,140");
  });

  test("whole baths render without a trailing .0; half-steps keep .5", () => {
    expect(normalizePropertyRecord([{ bathrooms: 2 }]).baths).toBe("2");
    expect(normalizePropertyRecord([{ bathrooms: 2.5 }]).baths).toBe("2.5");
  });

  test("partial / empty / malformed -> only-present fields, never throws", () => {
    expect(normalizePropertyRecord([{ bedrooms: 4 }])).toEqual({ bedrooms: "4" });
    expect(normalizePropertyRecord([])).toEqual({});
    expect(normalizePropertyRecord(null)).toEqual({});
    expect(normalizePropertyRecord("nope")).toEqual({});
    // 0 / negative / out-of-range year are dropped (not charted as junk).
    expect(normalizePropertyRecord([{ bedrooms: 0, yearBuilt: 1500 }])).toEqual(
      {},
    );
  });
});

/* --------------------------------------------------------- comps normalizer */

test.describe("SP-AUTOFILL - normalizeAvmComps", () => {
  test("fixture -> ranked Comp[] candidate pool, price-formatted, source imported", () => {
    const comps = normalizeAvmComps(AVM_FIXTURE);
    // Default cap is the candidate pool (MAX_COMP_CANDIDATES); the fixture has
    // five rows with both an address and a price, so all five survive (the two
    // with no address / no price are dropped). The client later resolves Street
    // View coverage across the pool and KEEPS the photographed ones.
    expect(comps).toHaveLength(5);
    expect(comps.map((c) => c.address)).toEqual([
      "742 N Cedar St, Tacoma, WA 98406",
      "1120 S Ainsworth Ave, Tacoma, WA 98405",
      "915 N Steele St",
      "Fourth kept comp",
      "Fifth comp beyond the cap",
    ]);
    expect(comps[0]).toEqual({
      address: "742 N Cedar St, Tacoma, WA 98406",
      soldPrice: "$685,000",
      source: "imported",
      soldDate: "2026-04-12T00:00:00.000Z",
      squareFeet: "2,210",
      yearBuilt: 1996,
    });
    // lastSeenDate is the fallback date when removedDate is absent.
    expect(comps[1].soldDate).toBe("2026-03-01");
    // addressLine1 fallback row carries only what it had.
    expect(comps[2]).toEqual({
      address: "915 N Steele St",
      soldPrice: "$599,000",
      source: "imported",
    });
  });

  test("rows with no usable address or no price are skipped", () => {
    const comps = normalizeAvmComps(AVM_FIXTURE);
    expect(comps.some((c) => c.address.includes("No price"))).toBe(false);
    expect(comps.some((c) => c.soldPrice === "")).toBe(false);
  });

  test("custom cap is honored", () => {
    expect(normalizeAvmComps(AVM_FIXTURE, 2)).toHaveLength(2);
    // The candidate-pool cap is well above the final kept count, so the buffer
    // exists for photographed-first selection.
    expect(MAX_COMP_CANDIDATES).toBeGreaterThan(MAX_AUTOFILL_COMPS);
  });

  test("malformed / empty -> [], never throws", () => {
    expect(normalizeAvmComps(null)).toEqual([]);
    expect(normalizeAvmComps({})).toEqual([]);
    expect(normalizeAvmComps({ comparables: "nope" })).toEqual([]);
    expect(normalizeAvmComps({ comparables: [] })).toEqual([]);
  });
});

/* ----------------------------------------- photographed-comp selection (brief) */

test.describe("SP-AUTOFILL - compHasPhoto + selectKeptComps", () => {
  const withStreetView = (address: string): Comp => ({
    address,
    soldPrice: "",
    source: "imported",
    hasStreetView: true,
    streetViewPanoId: `pano-${address}`,
  });
  const noCoverage = (address: string): Comp => ({
    address,
    soldPrice: "",
    source: "imported",
    hasStreetView: false,
  });
  const manualPhoto = (address: string): Comp => ({
    address,
    soldPrice: "",
    source: "imported",
    photoUrl: "https://blob.example/photo.jpg",
  });

  test("compHasPhoto: true for resolved Street View OR a manual photo", () => {
    expect(compHasPhoto(withStreetView("A"))).toBe(true);
    expect(compHasPhoto(manualPhoto("B"))).toBe(true);
    // A manual photo wins even if coverage came back false.
    expect(
      compHasPhoto({ ...noCoverage("C"), photoUrl: "https://blob/x.jpg" }),
    ).toBe(true);
  });

  test("compHasPhoto: false for no-coverage, unresolved, or pano-less", () => {
    expect(compHasPhoto(noCoverage("A"))).toBe(false); // resolved, no coverage
    expect(compHasPhoto({ address: "B", soldPrice: "" })).toBe(false); // unresolved
    // hasStreetView true but no usable pano id is not a renderable photo.
    expect(
      compHasPhoto({ address: "C", soldPrice: "", hasStreetView: true }),
    ).toBe(false);
    expect(compHasPhoto({ address: "D", soldPrice: "", photoUrl: "   " })).toBe(
      false,
    );
  });

  test("selectKeptComps: photographed first, no-coverage backfills, capped", () => {
    const pool: Comp[] = [
      noCoverage("no-1"),
      withStreetView("sv-1"),
      noCoverage("no-2"),
      withStreetView("sv-2"),
      manualPhoto("man-1"),
      noCoverage("no-3"),
    ];
    const kept = selectKeptComps(pool, MAX_AUTOFILL_COMPS);
    expect(kept).toHaveLength(MAX_AUTOFILL_COMPS); // 4
    // The three photographed comps come first (in their original rank), then
    // one no-coverage comp backfills to reach the cap.
    expect(kept.map((c) => c.address)).toEqual([
      "sv-1",
      "sv-2",
      "man-1",
      "no-1",
    ]);
  });

  test("selectKeptComps: when >= cap are photographed, no-coverage never shows", () => {
    const pool: Comp[] = [
      withStreetView("sv-1"),
      withStreetView("sv-2"),
      withStreetView("sv-3"),
      withStreetView("sv-4"),
      withStreetView("sv-5"),
      noCoverage("no-1"),
    ];
    const kept = selectKeptComps(pool, MAX_AUTOFILL_COMPS);
    expect(kept).toHaveLength(MAX_AUTOFILL_COMPS);
    expect(kept.every((c) => compHasPhoto(c))).toBe(true);
  });

  test("selectKeptComps: fewer than cap photographed -> shows what is available", () => {
    const pool: Comp[] = [withStreetView("sv-1"), noCoverage("no-1")];
    const kept = selectKeptComps(pool, MAX_AUTOFILL_COMPS);
    // Both kept (the photographed one + one backfill), never padded past the
    // pool, and never throws on a short / non-array input.
    expect(kept.map((c) => c.address)).toEqual(["sv-1", "no-1"]);
    expect(selectKeptComps([], MAX_AUTOFILL_COMPS)).toEqual([]);
    expect(
      selectKeptComps(null as unknown as Comp[], MAX_AUTOFILL_COMPS),
    ).toEqual([]);
  });
});

/* --------------------------------------------- getAddressAutofill orchestration */

test.describe("SP-AUTOFILL - getAddressAutofill (cache + fetch + fallback)", () => {
  const ADDRESS = "742 N Cedar St, Tacoma, WA 98406";

  test("missing key -> ok:false key-missing, no fetch", async () => {
    const prev = process.env.Rent_Cast_API;
    delete process.env.Rent_Cast_API;
    const { fetchImpl, calls } = routedFetch([]);
    const res = await getAddressAutofill(ADDRESS, {
      fetchImpl,
      kvImpl: memKv(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("key-missing");
    expect(calls()).toBe(0);
    if (prev !== undefined) process.env.Rent_Cast_API = prev;
  });

  test("unusable address -> ok:false invalid-address", async () => {
    process.env.Rent_Cast_API = "test-key";
    const res = await getAddressAutofill("   ", { kvImpl: memKv() });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid-address");
  });

  test("cache MISS: fetches each endpoint once, writes normalized, source live", async () => {
    process.env.Rent_Cast_API = "test-key";
    const { fetchImpl, calls } = routedFetch([
      { match: "/v1/properties", body: PROPERTIES_FIXTURE },
      { match: "/v1/avm/value", body: AVM_FIXTURE },
    ]);
    const kv = memKv();
    const res = await getAddressAutofill(ADDRESS, { fetchImpl, kvImpl: kv });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.property.bedrooms).toBe("3");
      // The candidate pool (all five valid fixture comps) is returned + cached;
      // the client trims to MAX_AUTOFILL_COMPS after resolving coverage.
      expect(res.comps).toHaveLength(5);
      expect(res.source).toEqual({ property: "live", comps: "live" });
    }
    expect(calls()).toBe(2); // one per endpoint
    expect(kv.setCalls()).toBe(2); // both normalized results cached
  });

  test("cache HIT: returns cached shapes and makes NO fetch", async () => {
    process.env.Rent_Cast_API = "test-key";
    const norm = normalizeAddressKey(ADDRESS);
    const kv = memKv({
      [autofillCacheKey("prop", norm)]: { bedrooms: "5" },
      [autofillCacheKey("comps", norm)]: normalizeAvmComps(AVM_FIXTURE),
    });
    const { fetchImpl, calls } = routedFetch([]);
    const res = await getAddressAutofill(ADDRESS, { fetchImpl, kvImpl: kv });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.property.bedrooms).toBe("5");
      // Cached candidate pool returned as-is (sliced to MAX_COMP_CANDIDATES).
      expect(res.comps).toHaveLength(5);
      expect(res.source).toEqual({ property: "cache", comps: "cache" });
    }
    expect(calls()).toBe(0);
  });

  test("partial: property has data, AVM returns nothing -> comps [] none, not cached", async () => {
    process.env.Rent_Cast_API = "test-key";
    const { fetchImpl } = routedFetch([
      { match: "/v1/properties", body: PROPERTIES_FIXTURE },
      { match: "/v1/avm/value", body: { comparables: [] } },
    ]);
    const kv = memKv();
    const res = await getAddressAutofill(ADDRESS, { fetchImpl, kvImpl: kv });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.property.bedrooms).toBe("3");
      expect(res.comps).toEqual([]);
      expect(res.source).toEqual({ property: "live", comps: "none" });
    }
    // Only the property result is cached; the empty comps result is NOT (so a
    // later AVM that gains data isn't pinned to empty).
    expect(kv.setCalls()).toBe(1);
  });

  test("a non-2xx (404 no record) on both -> ok:true with empty data, nothing cached", async () => {
    process.env.Rent_Cast_API = "test-key";
    const { fetchImpl } = routedFetch([
      { match: "/v1/properties", body: {}, status: 404 },
      { match: "/v1/avm/value", body: {}, status: 404 },
    ]);
    const kv = memKv();
    const res = await getAddressAutofill(ADDRESS, { fetchImpl, kvImpl: kv });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.property).toEqual({});
      expect(res.comps).toEqual([]);
      expect(res.source).toEqual({ property: "none", comps: "none" });
    }
    expect(kv.setCalls()).toBe(0);
  });
});

/* ----------------------------------------------------------- route structure */

test.describe("SP-AUTOFILL - route discipline (structural)", () => {
  test("the autofill route is server-only, flag-gated, with a maxDuration", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/app/api/seller-presentation/autofill/route.ts"),
      "utf8",
    );
    expect(src).toContain('export const runtime = "nodejs"');
    expect(src).toMatch(/export const maxDuration = \d+/);
    // Flag gate + auth gate present.
    expect(src).toContain("isSellerStateAEnabled");
    expect(src).toContain("auth()");
    // The cost-bearing key is READ server-side ONLY (inside the lib), never in
    // the route itself (a doc comment may name it, but it is never accessed).
    expect(src).not.toContain("process.env.Rent_Cast_API");
    // External-API route logs on the unexpected path (maxDuration lesson).
    expect(src).toContain("console.error");
  });
});
