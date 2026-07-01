/**
 * Buyer Tour Brief V1 — server-only GreatSchools NearbySchools enrichment
 * (GREATSCHOOLS_ENABLED). SPIKE PROOF: normalizer + fetch, no consumer UI, unwired.
 *
 * Given an already-geocoded home (lat/lng, from the existing proximity pipeline),
 * calls the GreatSchools NearbySchools API and normalizes the response to a
 * minimal, SOURCED-FACTS-ONLY typed shape:
 *   { name, level, gradeRange, district, ratingBand, profileUrl, distanceMi }[]
 *
 * SERVER-ONLY. Reads `process.env.GREATSCHOOLS_API_KEY` (a NON-public, server-side
 * key, present on Vercel Prod + Preview) and calls GreatSchools directly, so it
 * must NEVER be imported into client code.
 *
 * ┌─ HARD ToS CONSTRAINT — fetch-only, NO caching / NO storing / NO derivatives ─┐
 * │ GreatSchools ToS 3.2.2 prohibits caching or storing the GS Data Content;     │
 * │ 3.2.8 prohibits derivative works (a superset/subset of the data); 8.6        │
 * │ requires destroying all GS Data Content + copies on termination. Therefore   │
 * │ this module DELIBERATELY imports no `@vercel/kv`, holds no cache, and has NO  │
 * │ write path. It fetches at call time and returns the data for IMMEDIATE render │
 * │ only. The returned data must never be written to a draft, KV, the published   │
 * │ /tour/[slug] payload, or any cache. (Contrast google-maps.ts, which is        │
 * │ Google data and IS KV-cached — GreatSchools may not be.) A source-contract    │
 * │ test asserts this file contains no persistence.                              │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * STUDIO NEVER INTERPRETS. The normalized object carries ONLY sourced factual
 * fields. No Studio-authored quality / "best" / neighborhood language. The exact
 * GreatSchools rating-band STRING is passed through UNCHANGED (never paraphrased,
 * abbreviated, or mapped); a school with no band normalizes to `ratingBand: null`,
 * never a fabricated band.
 *
 * GRACEFUL FALLBACK (never hard-fail, mirrors google-maps.ts):
 *   • missing key           → { ok: false, code: "key-missing", schools: [] }
 *   • network / HTTP error / rate-limit / malformed / timeout / zero results
 *                           → { ok: false, code: "unavailable", schools: [] }
 *                             (or { ok: true, schools: [] } for a valid-but-empty
 *                             response). Nothing here ever throws to the caller,
 *                             so a render simply omits the school section.
 *
 * The GreatSchools API v2 returns hyphen-kebab keys ("rating-band", "grade-range",
 * "district-name", "overview-url", "lon"). The normalizer is coded against that
 * documented Postman schema; a live preview call confirms the exact keys (and is
 * NOT committed — a committed response is a stored copy). See the findings doc.
 */

import type { LatLng } from "@/tools/buyer-tour-brief/engine/types";

/** NearbySchools endpoint (GreatSchools API v2). Confirmed live on preview
 *  2026-07-01: the `/v2/` prefix is REQUIRED (the un-prefixed path returns an API
 *  Gateway 403 "Forbidden"). Auth = `X-API-Key` header. */
const NEARBY_SCHOOLS_URL = "https://gs-api.greatschools.org/v2/nearby-schools";

const FETCH_TIMEOUT_MS = 8000;

/** How many nearby schools to request per home. The build layer decides how many
 *  to display; the module just returns what the API gives, closest-first. */
const NEARBY_LIMIT = 25;

/**
 * The ONLY fields the module surfaces — all directly sourced from GreatSchools.
 * This set IS the allow-list. A test asserts every normalized object has exactly
 * these keys (no Studio-authored key ever leaks in).
 */
export interface NormalizedSchool {
  /** School name (attribution: rendered as a nofollow text link to profileUrl). */
  name: string;
  /** e.g. "elementary" / "middle" / "high" / "elementary,middle". */
  level: string | null;
  /** e.g. "K-5" / "6-8" / "9-12". */
  gradeRange: string | null;
  /** District name. */
  district: string | null;
  /**
   * The EXACT GreatSchools rating-band string, passed through UNCHANGED
   * ("Above Average" / "Average" / "Below Average"), or null when the school has
   * no rating on this plan. NEVER paraphrased, abbreviated, or fabricated.
   */
  ratingBand: string | null;
  /** GreatSchools profile / overview page URL for this school. */
  profileUrl: string | null;
  /** Distance from the home, in miles, as reported by the API. */
  distanceMi: number | null;
}

export type GreatSchoolsErrorCode = "key-missing" | "unavailable";

/**
 * Result of a render-time NearbySchools fetch. `ok:false` carries a code so the
 * caller can distinguish "not provisioned" from "transient"; `schools` is ALWAYS
 * an array (empty on any non-success), so a renderer can iterate unconditionally.
 */
export interface GreatSchoolsResult {
  ok: boolean;
  code?: GreatSchoolsErrorCode;
  schools: NormalizedSchool[];
}

/** Injectable deps for tests. NOTE: there is intentionally NO `kvImpl` — this
 *  module has no cache and no storage by ToS design. */
export interface GreatSchoolsDeps {
  fetchImpl?: typeof fetch;
}

/** Is the server-side GreatSchools key present? Lets a render/route short-circuit
 *  to a key-missing result before any work (mirrors hasGoogleMapsServerKey). */
export function hasGreatSchoolsKey(): boolean {
  const k = process.env.GREATSCHOOLS_API_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** First candidate key that holds a non-empty string. Tolerant of the small key-
 *  spelling variance across GS docs versions; confirmed against the live shape. */
function pickString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (isFiniteNumber(v)) return v;
  }
  return null;
}

/**
 * Read the EXACT rating-band string from a school record, UNCHANGED. Returns the
 * original source string verbatim (not trimmed, not remapped) when a school has a
 * real band, else null. Deliberately NOT routed through pickString so the value
 * can never be altered — the whole point is verbatim passthrough.
 *
 * CONFIRMED LIVE (2026-07-01): the key is `rating_band` (underscore), and an
 * UNRATED school comes back as the literal STRING "null" (not JSON null, not an
 * absent key), e.g. `"rating_band":"null"`. That sentinel MUST normalize to null —
 * otherwise the word "null" would render as a rating band. Real values seen live
 * are sentence-case: "Above average" / "Average" / "Below average".
 */
function readRatingBand(obj: Record<string, unknown>): string | null {
  const candidates = ["rating_band", "rating-band", "ratingBand"] as const;
  for (const k of candidates) {
    const v = obj[k];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length === 0) continue;
    if (t.toLowerCase() === "null") return null; // GS "no rating" sentinel string
    return v; // verbatim — never paraphrased or re-cased
  }
  return null;
}

/**
 * Normalize ONE GreatSchools school record to the sourced-facts-only shape. Pure.
 * Drops records with no name (nothing to attribute/link). Never throws.
 */
function normalizeSchool(raw: unknown): NormalizedSchool | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = pickString(o, ["name", "school-name", "schoolName"]);
  if (!name) return null;
  return {
    name,
    // CONFIRMED LIVE: there is NO "grade-range" field. `level-codes` is the school-
    // level indicator ("e,m,h" = elementary/middle/high) and `level` is the served-
    // grades LIST ("KG,1,2,3,…"). We surface both verbatim; the BUILD layer maps the
    // codes to "Elementary/Middle/High" and formats the grade list into a range.
    level: pickString(o, ["level-codes", "levelCodes"]),
    gradeRange: pickString(o, ["grade-range", "gradeRange", "level"]),
    district: pickString(o, ["district-name", "district", "districtName"]),
    ratingBand: readRatingBand(o),
    profileUrl: pickString(o, ["overview-url", "overviewUrl", "profile-url", "url"]),
    distanceMi: pickNumber(o, ["distance", "distanceMi", "distance-mi"]),
  };
}

/**
 * Normalize a full NearbySchools response body to `NormalizedSchool[]`. Pure,
 * exported for direct unit testing. Accepts the documented `{ schools: [...] }`
 * envelope (also tolerates a bare top-level array). Any malformed / empty input
 * yields `[]` — never throws.
 */
export function parseNearbySchools(raw: unknown): NormalizedSchool[] {
  if (!raw) return [];
  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    list = Array.isArray(r.schools) ? r.schools : Array.isArray(r.results) ? r.results : null;
  }
  if (!Array.isArray(list)) return [];
  const out: NormalizedSchool[] = [];
  for (const item of list) {
    const school = normalizeSchool(item);
    if (school) out.push(school);
  }
  return out;
}

/**
 * Fetch + normalize NearbySchools for a home using an EXPLICIT key. Never throws:
 * any network / HTTP / parse failure resolves to `[]`. No caching, no storage.
 */
async function fetchNearbySchoolsWithKey(
  home: LatLng,
  apiKey: string,
  deps: GreatSchoolsDeps = {},
): Promise<NormalizedSchool[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  const url = new URL(NEARBY_SCHOOLS_URL);
  url.searchParams.set("lat", String(home.lat));
  url.searchParams.set("lon", String(home.lng));
  url.searchParams.set("limit", String(NEARBY_LIMIT));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url.toString(), {
      method: "GET",
      // GreatSchools API v2 authenticates via header (keeps the key out of the
      // URL/logs). Confirm the exact header name with the live preview call.
      headers: { Accept: "application/json", "X-API-Key": apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    return parseNearbySchools(body);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * RENDER-TIME ENTRY POINT. Given an already-geocoded home, return the normalized
 * nearby schools for immediate render. Reads the server key from the env; a
 * missing key degrades gracefully (no throw, empty result). The returned data is
 * for the duration of this call/render ONLY and must NEVER be persisted.
 */
export async function nearbySchools(
  home: LatLng,
  deps: GreatSchoolsDeps = {},
): Promise<GreatSchoolsResult> {
  const apiKey = process.env.GREATSCHOOLS_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return { ok: false, code: "key-missing", schools: [] };
  }
  const schools = await fetchNearbySchoolsWithKey(home, apiKey.trim(), deps);
  // A valid-but-empty response is a legitimate `ok:true` with no schools. We can't
  // distinguish "genuinely none nearby" from a swallowed transient failure without
  // leaking the transport error up; treat empty as unavailable so a render omits
  // the section rather than asserting "no schools nearby". The build layer decides
  // copy; the module stays honest with a code.
  if (schools.length === 0) return { ok: false, code: "unavailable", schools: [] };
  return { ok: true, schools };
}

/** Exported for the render-time-only smoke path in tests. Never persists. */
export { fetchNearbySchoolsWithKey };
