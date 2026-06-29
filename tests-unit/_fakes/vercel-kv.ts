/**
 * In-memory fake of the `@vercel/kv` `kv` client for the node-context unit lane.
 *
 * Redirected in via `tsconfig.unit.json` paths so the real package (an Upstash
 * auto-pipeline Proxy that THROWS without KV_REST_API_URL / KV_REST_API_TOKEN and
 * would otherwise make real HTTP calls) is never loaded. `work-order.ts` imports
 * `{ kv }` from "@vercel/kv"; under the unit tsconfig that resolves here, so the
 * lifecycle logic runs against this deterministic Map with no network.
 *
 * The `__`-prefixed helpers are test controls only (not part of the real client
 * surface); the spec imports them from the same "@vercel/kv" specifier so it
 * shares this one module singleton (and its backing store) with the code-under-test.
 */

type SetOpts = { nx?: boolean; ex?: number };

const store = new Map<string, unknown>();
let hideNextGet = false;
let throwNextGet = false;

export const kv = {
  async get<T = unknown>(key: string): Promise<T | null> {
    if (throwNextGet) {
      throwNextGet = false;
      throw new Error("kv unavailable (fake)");
    }
    if (hideNextGet) {
      // One-shot: model the NX race window where a concurrent writer has not yet
      // become visible to this reader, so the caller falls into the create path.
      hideNextGet = false;
      return null;
    }
    return store.has(key) ? (store.get(key) as T) : null;
  },
  async set(key: string, value: unknown, opts?: SetOpts): Promise<string | null> {
    // SET NX returns null when the key already exists (the create lost the race).
    if (opts?.nx && store.has(key)) return null;
    store.set(key, value);
    return "OK";
  },
  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) if (store.delete(k)) removed += 1;
    return removed;
  },
  async incr(key: string): Promise<number> {
    const next = ((store.get(key) as number) ?? 0) + 1;
    store.set(key, next);
    return next;
  },
  async expire(): Promise<number> {
    return 1;
  },
};

// ---- test controls (not part of the real kv surface) ----
export function __resetKv(): void {
  store.clear();
  hideNextGet = false;
  throwNextGet = false;
}
export function __seedKv(key: string, value: unknown): void {
  store.set(key, value);
}
export function __readKv(key: string): unknown {
  return store.has(key) ? store.get(key) : null;
}
export function __keyCount(): number {
  return store.size;
}
/** Make the NEXT `get` return null once, modeling a not-yet-visible NX winner. */
export function __hideNextGet(): void {
  hideNextGet = true;
}
