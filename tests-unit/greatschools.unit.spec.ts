import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  hasGreatSchoolsKey,
  nearbySchools,
  parseNearbySchools,
  type NormalizedSchool,
} from "../src/lib/buyer-tour-brief/greatschools";
import {
  SYNTHETIC_NEARBY_SCHOOLS_RAW,
  SYNTHETIC_NO_RATING_RAW,
  SYNTHETIC_PARTIAL_RAW,
  SYNTHETIC_EMPTY_RAW,
} from "../src/lib/buyer-tour-brief/__fixtures__/greatschools-synthetic";

/**
 * GreatSchools SPIKE (GREATSCHOOLS_ENABLED, OFF). Proves the normalizer + the
 * fetch-only / no-persistence posture against a SYNTHETIC fixture (never a real GS
 * response — a committed response would be a stored copy, ToS 3.2.2). Covers:
 * shape normalization, EXACT rating-band passthrough (fails if paraphrased),
 * no-rating → null, partial/empty, failure/key-missing graceful path, sourced-
 * fields-only allow-list, and a source-contract no-persistence assertion.
 */

const ORIGINAL_KEY = process.env.GREATSCHOOLS_API_KEY;

test.afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GREATSCHOOLS_API_KEY;
  else process.env.GREATSCHOOLS_API_KEY = ORIGINAL_KEY;
});

/** A `typeof fetch` fake that returns a JSON body (or throws / returns !ok). */
function fakeFetch(
  body: unknown,
  opts: { ok?: boolean; throws?: boolean } = {},
): { impl: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (opts.throws) throw new Error("network down");
    return {
      ok: opts.ok ?? true,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/* ---- normalization -------------------------------------------------------- */

test("parseNearbySchools normalizes the documented shape to the typed fields", () => {
  const schools = parseNearbySchools(SYNTHETIC_NEARBY_SCHOOLS_RAW);
  expect(schools).toHaveLength(3);
  expect(schools[0]).toEqual({
    name: "Fictional Creek Elementary",
    level: "e", // sourced from `level-codes`; build maps e→Elementary
    gradeRange: "KG,1,2,3,4,5", // sourced from `level` grade list; build formats a range
    district: "Made-Up Unified School District",
    ratingBand: "Above average", // live sentence-case, verbatim
    profileUrl:
      "https://www.greatschools.org/example/fictional-creek-elementary/1/",
    distanceMi: 0.4,
  } satisfies NormalizedSchool);
});

/* ---- EXACT rating-band passthrough (the anti-paraphrase lock) ------------- */

test("rating-band strings pass through EXACTLY — no paraphrase, re-casing, or abbreviation", () => {
  const schools = parseNearbySchools(SYNTHETIC_NEARBY_SCHOOLS_RAW);
  const bands = schools.map((s) => s.ratingBand);
  // Verbatim live source vocabulary + casing ("Above average", not "Above Average").
  expect(bands).toEqual(["Above average", "Average", "Below average"]);
  // Explicitly assert the code did NOT abbreviate / reword / re-case.
  expect(bands).not.toContain("Above avg");
  expect(bands).not.toContain("Above Average"); // re-casing is a change → forbidden
  expect(bands).not.toContain("Above-Average");
  expect(bands).not.toContain("A+");
});

test("a rating-band is returned character-for-character as the source gave it", () => {
  const raw = { schools: [{ name: "Verbatim Test School", rating_band: "Above average" }] };
  const [s] = parseNearbySchools(raw);
  expect(s.ratingBand).toBe("Above average");
});

/* ---- no-rating state ------------------------------------------------------ */

test("the live 'null' STRING sentinel normalizes to ratingBand: null (never the word 'null')", () => {
  // GS returns `"rating_band":"null"` (a literal string) for unrated schools.
  const [s] = parseNearbySchools(SYNTHETIC_NO_RATING_RAW);
  expect(s.name).toBe("Unrated Charter Academy");
  expect(s.ratingBand).toBeNull();
  expect(s.ratingBand).not.toBe("null");
});

test("case-variant 'NULL'/'Null' string sentinels also normalize to null", () => {
  for (const sentinel of ["null", "NULL", "Null", " null "]) {
    const [s] = parseNearbySchools({
      schools: [{ name: "S", rating_band: sentinel }],
    });
    expect(s.ratingBand).toBeNull();
  }
});

test("a whitespace-only rating-band is treated as no rating (null)", () => {
  const schools = parseNearbySchools(SYNTHETIC_PARTIAL_RAW);
  const whitespaceBand = schools.find((s) => s.name === "Whitespace Band Middle");
  expect(whitespaceBand?.ratingBand).toBeNull();
});

/* ---- partial / empty / malformed ----------------------------------------- */

test("partial records normalize their present fields and null the rest", () => {
  const schools = parseNearbySchools(SYNTHETIC_PARTIAL_RAW);
  const sparse = schools.find((s) => s.name === "Sparse Fields Elementary");
  expect(sparse).toEqual({
    name: "Sparse Fields Elementary",
    level: null,
    gradeRange: null,
    district: null,
    ratingBand: null,
    profileUrl:
      "https://www.greatschools.org/example/sparse-fields-elementary/5/",
    distanceMi: null,
  } satisfies NormalizedSchool);
});

test("an empty response normalizes to an empty array", () => {
  expect(parseNearbySchools(SYNTHETIC_EMPTY_RAW)).toEqual([]);
});

test("malformed / junk inputs never throw and yield []", () => {
  expect(parseNearbySchools(null)).toEqual([]);
  expect(parseNearbySchools(undefined)).toEqual([]);
  expect(parseNearbySchools({})).toEqual([]);
  expect(parseNearbySchools({ schools: "nope" })).toEqual([]);
  expect(parseNearbySchools({ schools: [null, 3, "x", {}] })).toEqual([]);
  expect(parseNearbySchools("string")).toEqual([]);
});

/* ---- sourced-fields-only allow-list --------------------------------------- */

test("normalized objects carry ONLY the sourced allow-list keys (no Studio fields)", () => {
  const ALLOW = [
    "district",
    "distanceMi",
    "gradeRange",
    "level",
    "name",
    "profileUrl",
    "ratingBand",
  ].sort();
  for (const s of parseNearbySchools(SYNTHETIC_NEARBY_SCHOOLS_RAW)) {
    expect(Object.keys(s).sort()).toEqual(ALLOW);
  }
});

/* ---- graceful fetch entry point ------------------------------------------ */

test("nearbySchools with no key returns key-missing gracefully (no throw)", async () => {
  delete process.env.GREATSCHOOLS_API_KEY;
  const res = await nearbySchools({ lat: 30.1, lng: -97.1 });
  expect(res).toEqual({ ok: false, code: "key-missing", schools: [] });
});

test("nearbySchools swallows a network failure → unavailable, empty (never throws)", async () => {
  process.env.GREATSCHOOLS_API_KEY = "test-key";
  const { impl } = fakeFetch(null, { throws: true });
  const res = await nearbySchools({ lat: 30.1, lng: -97.1 }, { fetchImpl: impl });
  expect(res).toEqual({ ok: false, code: "unavailable", schools: [] });
});

test("nearbySchools maps a non-OK HTTP response → unavailable, empty", async () => {
  process.env.GREATSCHOOLS_API_KEY = "test-key";
  const { impl } = fakeFetch({ schools: [] }, { ok: false });
  const res = await nearbySchools({ lat: 30.1, lng: -97.1 }, { fetchImpl: impl });
  expect(res).toEqual({ ok: false, code: "unavailable", schools: [] });
});

test("nearbySchools with a valid-but-empty response → unavailable (never asserts 'none')", async () => {
  process.env.GREATSCHOOLS_API_KEY = "test-key";
  const { impl } = fakeFetch(SYNTHETIC_EMPTY_RAW);
  const res = await nearbySchools({ lat: 30.1, lng: -97.1 }, { fetchImpl: impl });
  expect(res.ok).toBe(false);
  expect(res.code).toBe("unavailable");
  expect(res.schools).toEqual([]);
});

test("nearbySchools success path returns normalized schools", async () => {
  process.env.GREATSCHOOLS_API_KEY = "test-key";
  const { impl, calls } = fakeFetch(SYNTHETIC_NEARBY_SCHOOLS_RAW);
  const res = await nearbySchools({ lat: 30.1, lng: -97.1 }, { fetchImpl: impl });
  expect(res.ok).toBe(true);
  expect(res.schools).toHaveLength(3);
  expect(res.schools[0].ratingBand).toBe("Above average");
  // the key travels in the header, NEVER in the URL/query (no key leak in logs)
  expect(calls[0].url).not.toContain("test-key");
  const headers = calls[0].init?.headers as Record<string, string>;
  expect(headers["X-API-Key"]).toBe("test-key");
});

test("hasGreatSchoolsKey reflects the env var presence", () => {
  process.env.GREATSCHOOLS_API_KEY = "  ";
  expect(hasGreatSchoolsKey()).toBe(false);
  process.env.GREATSCHOOLS_API_KEY = "real-key";
  expect(hasGreatSchoolsKey()).toBe(true);
});

/* ---- no-persistence source contract (ToS 3.2.2 / 3.2.8 / 8.6) ------------- */

test("the module has NO persistence path — no cache, no KV, no storage", () => {
  const modulePath = path.resolve(
    __dirname,
    "../src/lib/buyer-tour-brief/greatschools.ts",
  );
  const src = readFileSync(modulePath, "utf8");
  // strip block + line comments so the doc-comment prose (which NAMES these things
  // to explain the ban) can't produce a false positive.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  expect(code).not.toContain("@vercel/kv");
  // no write to any cache/store/kv identifier (searchParams.set is not persistence)
  expect(code).not.toMatch(/\b(kv|store|cache)\s*\.\s*set\s*\(/);
  expect(code).not.toContain("localStorage");
  expect(code).not.toContain("sessionStorage");
  expect(code).not.toContain("writeFile");
  expect(code).not.toContain("readFile");
  expect(code).not.toMatch(/\bfs\b/);
});
