import { test, expect } from '@playwright/test';

/**
 * Unit-style coverage for the v1.47 data-primitive layer:
 *   - src/lib/ids.ts                            — A2; generateId uniqueness + prefix shape
 *   - src/lib/client-profile.ts                 — A2; addressable Client store round-trip
 *   - src/skills/workflow-instance-storage.ts   — A3; converged WorkflowInstance CRUD
 *
 * No browser. These specs run inside Playwright's Node worker; the
 * `page` fixture is intentionally not destructured. A tiny in-memory
 * localStorage shim is installed on `globalThis.window` in beforeEach
 * so each module's `typeof window === 'undefined'` guards flip to the
 * truthy branch and the store reads/writes the shim. The shim is torn
 * down in afterEach to keep tests isolated.
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
import {
  createInstance,
  deleteInstance,
  listInstanceIds,
  listInstances,
  loadInstance,
  markOpened,
  saveInstance,
} from '../src/skills/workflow-instance-storage';
import type { WorkflowInstance } from '../src/skills/workflow-instance';

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

type MutableGlobal = typeof globalThis & {
  window?: { localStorage: Storage };
};

function installLocalStorageShim(): void {
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
}

function uninstallLocalStorageShim(): void {
  delete (globalThis as MutableGlobal).window;
}

test.describe('src/lib/client-profile.ts — addressable store', () => {
  test.beforeEach(installLocalStorageShim);
  test.afterEach(uninstallLocalStorageShim);

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

test.describe('src/skills/workflow-instance-storage.ts — per-record CRUD', () => {
  test.beforeEach(installLocalStorageShim);
  test.afterEach(uninstallLocalStorageShim);

  // A synthetic per-skill draft shape — the storage layer never
  // inspects this; the test uses it to confirm `draft` survives a
  // round-trip unchanged.
  interface FakeDraft {
    propertyAddress: string;
    recommendedPrice: string;
    pitchPoints: Array<{ text: string; visibility: 'public' | 'private' }>;
  }

  function makeDraft(): FakeDraft {
    return {
      propertyAddress: '1234 Test Drive NE',
      recommendedPrice: '$685,000',
      pitchPoints: [
        { text: 'Public point', visibility: 'public' },
        { text: 'Private note', visibility: 'private' },
      ],
    };
  }

  test('createInstance assigns a workflow_-prefixed id and round-trips via loadInstance', () => {
    const created = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
    });

    expect(created.instanceId.startsWith('workflow_')).toBe(true);
    expect(created.skillId).toBe('seller-presentation');
    expect(created.resolvedPrimitives).toEqual({});
    expect(created.currentStep).toBeUndefined();
    expect(created.timestamps.createdAt).toBe(created.timestamps.updatedAt);
    expect(created.timestamps.lastOpenedAt).toBeUndefined();
    expect(created.timestamps.completedAt).toBeUndefined();

    const reloaded = loadInstance<FakeDraft>(created.instanceId);
    expect(reloaded).toEqual(created);
    expect(reloaded!.draft.pitchPoints).toHaveLength(2);
  });

  test('createInstance respects optional resolvedPrimitives + currentStep', () => {
    const created = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
      resolvedPrimitives: { propertyId: 'property_abc', clientId: 'client_xyz' },
      currentStep: 'property',
    });
    expect(created.resolvedPrimitives.propertyId).toBe('property_abc');
    expect(created.resolvedPrimitives.clientId).toBe('client_xyz');
    expect(created.currentStep).toBe('property');
  });

  test('saveInstance bumps updatedAt and preserves createdAt + completedAt', async () => {
    const created = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
    });
    const completedStamp = '2026-05-20T12:00:00.000Z';
    // Force a measurable timestamp gap (ISO strings have ms resolution).
    await new Promise((r) => setTimeout(r, 5));

    const patched = saveInstance<FakeDraft>({
      ...created,
      currentStep: 'review',
      timestamps: { ...created.timestamps, completedAt: completedStamp },
    });

    expect(patched.timestamps.createdAt).toBe(created.timestamps.createdAt);
    expect(patched.timestamps.updatedAt > created.timestamps.updatedAt).toBe(true);
    expect(patched.timestamps.completedAt).toBe(completedStamp);
    expect(patched.currentStep).toBe('review');

    const reloaded = loadInstance<FakeDraft>(created.instanceId);
    expect(reloaded!.timestamps.updatedAt).toBe(patched.timestamps.updatedAt);
  });

  test('markOpened stamps lastOpenedAt + updatedAt; null when missing', async () => {
    const created = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
    });
    await new Promise((r) => setTimeout(r, 5));

    const opened = markOpened<FakeDraft>(created.instanceId);
    expect(opened).not.toBeNull();
    expect(opened!.timestamps.lastOpenedAt).toBeDefined();
    expect(opened!.timestamps.lastOpenedAt!.length).toBeGreaterThan(0);
    expect(opened!.timestamps.updatedAt > created.timestamps.updatedAt).toBe(true);
    expect(opened!.timestamps.createdAt).toBe(created.timestamps.createdAt);

    expect(markOpened('workflow_doesnotexist')).toBeNull();
  });

  test('listInstances + listInstanceIds reflect the index in creation order', () => {
    const a = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
    });
    const b = createInstance<FakeDraft>({
      skillId: 'open-house-prep',
      draft: makeDraft(),
    });
    const c = createInstance<FakeDraft>({
      skillId: 'seller-intelligence-report',
      draft: makeDraft(),
    });

    expect(listInstanceIds()).toEqual([a.instanceId, b.instanceId, c.instanceId]);

    const all = listInstances();
    expect(all).toHaveLength(3);
    expect(all.map((i) => i.skillId)).toEqual([
      'seller-presentation',
      'open-house-prep',
      'seller-intelligence-report',
    ]);
  });

  test('deleteInstance removes both record and index entry; idempotent on missing', () => {
    const a = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
    });
    const b = createInstance<FakeDraft>({
      skillId: 'open-house-prep',
      draft: makeDraft(),
    });

    expect(deleteInstance(a.instanceId)).toBe(true);
    expect(loadInstance(a.instanceId)).toBeNull();
    expect(listInstanceIds()).toEqual([b.instanceId]);
    expect(listInstances().map((i) => i.instanceId)).toEqual([b.instanceId]);

    // Second delete is a no-op + reports false.
    expect(deleteInstance(a.instanceId)).toBe(false);
  });

  test('listInstances silently drops index entries whose record vanished', () => {
    const a = createInstance<FakeDraft>({
      skillId: 'seller-presentation',
      draft: makeDraft(),
    });
    const b = createInstance<FakeDraft>({
      skillId: 'open-house-prep',
      draft: makeDraft(),
    });
    // Simulate a manual devtools nuke: remove the record but leave the
    // index entry behind. listInstances must self-heal by dropping the
    // dangling id from the returned list (it doesn't mutate the index —
    // any subsequent saveInstance on a survivor leaves the dangler
    // alone; an explicit deleteInstance would remove it).
    (globalThis as MutableGlobal).window!.localStorage.removeItem(
      `workflowInstance:${a.instanceId}`,
    );

    expect(listInstanceIds()).toEqual([a.instanceId, b.instanceId]);
    const survivors = listInstances();
    expect(survivors).toHaveLength(1);
    expect(survivors[0].instanceId).toBe(b.instanceId);
  });

  test('loadInstance returns null for missing or structurally invalid records', () => {
    expect(loadInstance('workflow_neverexisted')).toBeNull();

    // Hand-craft a structurally invalid record (missing timestamps).
    (globalThis as MutableGlobal).window!.localStorage.setItem(
      'workflowInstance:workflow_bad',
      JSON.stringify({ instanceId: 'workflow_bad', skillId: 'whatever', draft: {} }),
    );
    expect(loadInstance('workflow_bad')).toBeNull();
  });

  test('saveInstance self-heals: an in-memory instance whose id is not in the index gets indexed on save', () => {
    // Construct an instance directly (bypassing createInstance, simulating
    // a future "import from server" code path) — its id is NOT in the index.
    const orphan: WorkflowInstance<FakeDraft> = {
      instanceId: 'workflow_orphan',
      skillId: 'seller-presentation',
      draft: makeDraft(),
      resolvedPrimitives: {},
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    expect(listInstanceIds()).toEqual([]);
    saveInstance(orphan);
    expect(listInstanceIds()).toEqual(['workflow_orphan']);
    expect(loadInstance('workflow_orphan')).not.toBeNull();
  });
});
