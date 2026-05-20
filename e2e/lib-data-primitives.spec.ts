import { test, expect } from '@playwright/test';

/**
 * Unit-style coverage for the v1.47 A2 data-primitive layer:
 *   - src/lib/ids.ts          — generateId uniqueness + prefix shape
 *   - src/lib/client-profile.ts — addressable Client store round-trip
 *
 * No browser. These specs run inside Playwright's Node worker; the
 * `page` fixture is intentionally not destructured. A tiny in-memory
 * localStorage shim is installed on `globalThis.window` in beforeEach
 * so the client-profile module's `typeof window === 'undefined'`
 * guards flip to the truthy branch and the store reads/writes the
 * shim. The shim is torn down in afterEach to keep tests isolated.
 *
 * Why a shim instead of an actual page: the assertions exercise pure
 * data round-trips, not React or routing. Spinning a browser per test
 * would add seconds for zero coverage gain — and Playwright's Node
 * runner is the closest thing to a unit harness this repo has
 * (package.json declares no Vitest/Jest as of v1.47).
 */

import { generateId, type IdPrefix } from '../src/lib/ids';
import {
  createClient,
  getClient,
  loadClients,
  removeClient,
  updateClient,
} from '../src/lib/client-profile';

/**
 * Static imports rather than dynamic `await import(…)` — Playwright's
 * test transpiler handles static `.ts` imports, but dynamic imports
 * fall through to Node's raw loader which rejects them ("Cannot use
 * import statement outside a module"). Module-level code in
 * client-profile.ts never touches `window`; the guards live inside
 * each exported function, so the shim only needs to be in place at
 * CALL time (inside each test) — not at IMPORT time.
 */

const ID_PREFIXES: IdPrefix[] = ['client', 'property', 'workflow', 'artifact'];

test.describe('src/lib/ids.ts — generateId', () => {
  test('prefixes the requested kind', () => {
    for (const prefix of ID_PREFIXES) {
      const id = generateId(prefix);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
    }
  });

  test('produces 12-byte base32 suffixes (no I/L/O/U)', () => {
    const id = generateId('client');
    const suffix = id.slice('client_'.length);
    expect(suffix).toHaveLength(12);
    // Crockford alphabet — no I, L, O, U.
    expect(suffix).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]+$/);
  });

  test('1000 calls per prefix are all unique', () => {
    const seen = new Set<string>();
    for (const prefix of ID_PREFIXES) {
      for (let i = 0; i < 1000; i++) {
        const id = generateId(prefix);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(ID_PREFIXES.length * 1000);
  });
});

test.describe('src/lib/client-profile.ts — addressable store', () => {
  type MutableGlobal = typeof globalThis & {
    window?: { localStorage: Storage };
  };

  test.beforeEach(() => {
    const backing = new Map<string, string>();
    const localStorageShim: Storage = {
      get length() {
        return backing.size;
      },
      clear: () => backing.clear(),
      getItem: (k) => backing.get(k) ?? null,
      key: (i) => Array.from(backing.keys())[i] ?? null,
      removeItem: (k) => {
        backing.delete(k);
      },
      setItem: (k, v) => {
        backing.set(k, String(v));
      },
    };
    (globalThis as MutableGlobal).window = { localStorage: localStorageShim };
  });

  test.afterEach(() => {
    delete (globalThis as MutableGlobal).window;
  });

  test('create → getClient round-trips a record with a stable clientId', () => {
    const created = createClient({
      name: 'Alice Johnson',
      contactEmail: 'alice@example.com',
      relationshipType: 'seller',
    });

    expect(created.clientId.startsWith('client_')).toBe(true);
    expect(created.name).toBe('Alice Johnson');
    expect(created.relationshipType).toBe('seller');
    expect(created.contactEmail).toBe('alice@example.com');
    expect(created.contactPhone).toBeUndefined();
    expect(typeof created.createdAt).toBe('string');
    expect(created.createdAt).toBe(created.updatedAt);

    const reloaded = getClient(created.clientId);
    expect(reloaded).toEqual(created);
  });

  test('multiple records coexist under distinct ids', () => {
    const a = createClient({ name: 'A', relationshipType: 'seller' });
    const b = createClient({ name: 'B', relationshipType: 'buyer' });
    const c = createClient({ name: 'C', relationshipType: 'past-client' });

    const all = loadClients();
    expect(Object.keys(all)).toHaveLength(3);
    expect(all[a.clientId].name).toBe('A');
    expect(all[b.clientId].name).toBe('B');
    expect(all[c.clientId].name).toBe('C');
  });

  test('updateClient patches mutable fields, preserves id+createdAt, bumps updatedAt', async () => {
    const created = createClient({
      name: 'Original Name',
      relationshipType: 'lead',
    });
    // Force a measurable timestamp gap (ISO strings have ms resolution).
    await new Promise((r) => setTimeout(r, 5));

    const patched = updateClient(created.clientId, {
      name: 'Renamed',
      contactPhone: '2532028825',
    });

    expect(patched).not.toBeNull();
    expect(patched!.clientId).toBe(created.clientId);
    expect(patched!.createdAt).toBe(created.createdAt);
    expect(patched!.name).toBe('Renamed');
    expect(patched!.contactPhone).toBe('2532028825');
    expect(patched!.relationshipType).toBe('lead');
    expect(patched!.updatedAt > created.updatedAt).toBe(true);
  });

  test('updateClient on a missing id returns null and does not create', () => {
    const out = updateClient('client_doesnotexist', { name: 'x' });
    expect(out).toBeNull();
    expect(loadClients()).toEqual({});
  });

  test('removeClient deletes the record', () => {
    const created = createClient({
      name: 'Temporary',
      relationshipType: 'lead',
    });
    expect(removeClient(created.clientId)).toBe(true);
    expect(getClient(created.clientId)).toBeNull();
    expect(removeClient(created.clientId)).toBe(false);
  });

  test('loadClients clamps malformed records to safe defaults', () => {
    // Hand-craft a malformed payload directly to the shim.
    (globalThis as MutableGlobal).window!.localStorage.setItem(
      'socanim_clients',
      JSON.stringify({
        client_keep: {
          clientId: 'client_keep',
          name: 'Real Person',
          relationshipType: 'invalid-type-here',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        client_partial: {
          // Missing nearly everything; clamp should backfill safely.
        },
      }),
    );

    const all = loadClients();
    expect(Object.keys(all).sort()).toEqual(['client_keep', 'client_partial']);
    // Invalid relationshipType falls through to the safe default.
    expect(all['client_keep'].relationshipType).toBe('lead');
    expect(all['client_keep'].name).toBe('Real Person');
    expect(all['client_partial'].name).toBe('');
    expect(all['client_partial'].clientId).toBe('client_partial');
  });
});
