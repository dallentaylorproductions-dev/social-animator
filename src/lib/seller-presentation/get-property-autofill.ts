/**
 * Seller Presentation - Phase 2 (SP-AUTOFILL): server-only RentCast fetch +
 * per-address KV cache for the "type the address once" build. Powers two
 * autofills behind the prepared-invitation flow:
 *
 *   1. Subject property details (beds / baths / sqft / year) from /v1/properties
 *   2. Nearby recent sales (the brief's "nearby sales reviewed") from /v1/avm/value
 *
 * SERVER-ONLY. Reads `process.env.Rent_Cast_API` (the SAME key the area-trend
 * chart already uses - provisioned + runtime-verified in Preview + Production)
 * and calls RentCast directly, so it must NEVER be imported into client code.
 * The only caller is the `/api/seller-presentation/autofill` route (nodejs).
 *
 * COST DESIGN (the non-negotiable, mirrors get-area-price-trend.ts):
 *   • Cache key `sp-autofill:v1:{prop|comps}:{normalizedAddress}` in the same
 *     `@vercel/kv` store. Cache HIT -> return the cached NORMALIZED shape, no
 *     RentCast call. Cache MISS -> fetch ONCE, normalize, store. Net: ~1 request
 *     per endpoint per address, no matter how many edits / re-publishes hit it.
 *   • Empty / error / no-data results are NEVER cached, so a transient outage or
 *     a plan that lacks one endpoint doesn't pin an address to "empty".
 *   • The route fires on BLUR (debounced), never per-keystroke - so the only
 *     billable event is the first time a NEW address is committed.
 *
 * GRACEFUL FALLBACK (never hard-fail): missing key -> ok:false code; everything
 * else (RentCast error, rate-limit, no record, a plan without /avm or
 * /properties, a malformed payload) resolves to an EMPTY {} / [] at ok:true, so
 * the wizard simply leaves the fields blank / the brief flexes out. Nothing here
 * ever throws to the route.
 */

import { kv } from "@vercel/kv";
import type { Comp } from "@/tools/seller-intelligence-report/engine/types";
import {
  AVM_COMP_COUNT,
  MAX_COMP_CANDIDATES,
  autofillCacheKey,
  normalizeAddressKey,
  normalizeAvmComps,
  normalizePropertyRecord,
  type AutofillPropertyDetails,
} from "./rentcast-autofill";

const RENTCAST_PROPERTIES_URL = "https://api.rentcast.io/v1/properties";
const RENTCAST_AVM_VALUE_URL = "https://api.rentcast.io/v1/avm/value";

/** Don't let a slow/hung RentCast call stall the wizard fetch (each endpoint). */
const FETCH_TIMEOUT_MS = 8000;
/** Cache TTL - property records + recent sales move slowly; ~30 days keeps an
 *  address warm across a normal authoring + re-publish cycle, then self-evicts. */
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Where a given slice came from - surfaced for the preview smoke + cache asserts. */
export type AutofillSource = "cache" | "live" | "none";

export type AutofillResult =
  | {
      ok: true;
      property: AutofillPropertyDetails;
      comps: Comp[];
      source: { property: AutofillSource; comps: AutofillSource };
    }
  | { ok: false; code: "invalid-address" | "key-missing" };

/** The slice of `@vercel/kv` this module uses - narrowed so tests can inject an
 *  in-memory store and assert cache hit/miss without a live KV connection. */
export interface AutofillKv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

/** Injectable seams so the orchestration is testable without a live network or
 *  KV. Defaults are the production `fetch` + `@vercel/kv`. */
export interface GetPropertyAutofillDeps {
  fetchImpl?: typeof fetch;
  kvImpl?: AutofillKv;
}

/** One RentCast GET with a hard timeout. Returns the parsed JSON, or null for
 *  ANY non-2xx / network / timeout / parse failure (the caller treats null as
 *  "no data" and falls back). A 404 (RentCast has no record for the address) is
 *  a legitimate no-data case and also lands null. */
async function fetchRentCast(
  url: string,
  apiKey: string,
  doFetch: typeof fetch,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "GET",
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the subject property details + nearby recent sales for an address,
 * each cached per address. Returns `{ok:true, property, comps, source}` (either
 * slice may be {} / []), or `{ok:false, code}` for the two gating failures
 * (no key / unusable address). NEVER throws.
 */
export async function getAddressAutofill(
  address: string,
  deps: GetPropertyAutofillDeps = {},
): Promise<AutofillResult> {
  const norm = normalizeAddressKey(address);
  if (!norm) return { ok: false, code: "invalid-address" };

  const apiKey = process.env.Rent_Cast_API;
  if (!apiKey) return { ok: false, code: "key-missing" };

  const doFetch = deps.fetchImpl ?? fetch;
  const store: AutofillKv = deps.kvImpl ?? kv;
  const propKey = autofillCacheKey("prop", norm);
  const compsKey = autofillCacheKey("comps", norm);

  // Resolve the two endpoints concurrently; each is independent and self-caching.
  const [property, comps] = await Promise.all([
    resolveProperty(address, apiKey, propKey, doFetch, store),
    resolveComps(address, apiKey, compsKey, doFetch, store),
  ]);

  return {
    ok: true,
    property: property.value,
    comps: comps.value,
    source: { property: property.source, comps: comps.source },
  };
}

async function resolveProperty(
  address: string,
  apiKey: string,
  cacheKey: string,
  doFetch: typeof fetch,
  store: AutofillKv,
): Promise<{ value: AutofillPropertyDetails; source: AutofillSource }> {
  try {
    const cached = await store.get<AutofillPropertyDetails>(cacheKey);
    if (cached && typeof cached === "object" && Object.keys(cached).length > 0) {
      return { value: cached, source: "cache" };
    }
  } catch {
    /* KV read failure is non-fatal - fall through to a live fetch. */
  }

  const url = new URL(RENTCAST_PROPERTIES_URL);
  url.searchParams.set("address", address.trim());
  const raw = await fetchRentCast(url.toString(), apiKey, doFetch);
  const value = normalizePropertyRecord(raw);
  if (Object.keys(value).length === 0) return { value: {}, source: "none" };

  try {
    await store.set(cacheKey, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* best-effort cache write */
  }
  return { value, source: "live" };
}

async function resolveComps(
  address: string,
  apiKey: string,
  cacheKey: string,
  doFetch: typeof fetch,
  store: AutofillKv,
): Promise<{ value: Comp[]; source: AutofillSource }> {
  try {
    const cached = await store.get<Comp[]>(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      return { value: cached.slice(0, MAX_COMP_CANDIDATES), source: "cache" };
    }
  } catch {
    /* KV read failure is non-fatal - fall through to a live fetch. */
  }

  const url = new URL(RENTCAST_AVM_VALUE_URL);
  url.searchParams.set("address", address.trim());
  url.searchParams.set("compCount", String(AVM_COMP_COUNT));
  const raw = await fetchRentCast(url.toString(), apiKey, doFetch);
  // Cache the whole candidate pool (up to MAX_COMP_CANDIDATES); the client
  // resolves Street View coverage across it and keeps the photographed comps.
  const value = normalizeAvmComps(raw, MAX_COMP_CANDIDATES);
  if (value.length === 0) return { value: [], source: "none" };

  try {
    await store.set(cacheKey, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* best-effort cache write */
  }
  return { value, source: "live" };
}
