import { test, expect } from '@playwright/test';

/**
 * Account-cache isolation (v1.6x auth fix) — node-context unit coverage.
 *
 * No browser: an in-memory localStorage shim is installed on
 * `globalThis.window` (mirrors e2e/lib-data-primitives.spec.ts) so the
 * `typeof window` guards in src/lib/account-storage.ts flip to the truthy
 * branch and the helpers read/write the shim. Shim is torn down per test.
 *
 * Covers:
 *   - clearAccountScopedStorage: wipes every per-account key (exact + prefixed),
 *     preserves app-global UI prefs + the owner stamp.
 *   - reconcileAccountOwnership: match keeps, switch clears+re-stamps, an
 *     unstamped foreign-brand blob clears, an unstamped own/legacy cache adopts.
 *   - planBrandMigration: the cross-account contamination guard (never pushes a
 *     foreign / legacy local blob into a fresh account's empty server record).
 */

import {
  clearAccountScopedStorage,
  reconcileAccountOwnership,
  readOwnerStamp,
  stampOwner,
} from '../src/lib/account-storage';
import { planBrandMigration } from '../src/lib/brand-settings-migration';
import type { BrandSettings } from '../src/lib/brand';

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

function ls(): Storage {
  return (globalThis as MutableGlobal).window!.localStorage;
}

/** Seed a representative spread of per-account + app-global keys. */
function seedFullCache(ownerEmailInBrand?: string): void {
  const store = ls();
  const brand: Record<string, unknown> = { agentName: 'Jordan Rivera' };
  if (ownerEmailInBrand) brand.ownerEmail = ownerEmailInBrand;
  store.setItem('socanim_brand_settings', JSON.stringify(brand));
  store.setItem('socanim_listing_profile', JSON.stringify({ address: '1850 Pine St' }));
  store.setItem('socanim_clients', JSON.stringify({ c1: { name: 'The Johnsons' } }));
  store.setItem('socanim_onboarding_seen', '1');
  store.setItem('socanim_onboarding_sample_walked', '1');
  store.setItem('socanim_onboarding_path_a_complete', '1');
  store.setItem('workflowInstance:index', JSON.stringify(['workflow_abc']));
  store.setItem('workflowInstance:workflow_abc', JSON.stringify({ instanceId: 'workflow_abc' }));
  store.setItem('socanim_colors_listing-card', JSON.stringify({ bg: '#fff' }));
  store.setItem('sep-pages-order', JSON.stringify(['slug-a']));
  store.setItem('listingFlyer:draft', JSON.stringify({ x: 1 }));
  store.setItem('sellerIntelligenceReport:draft', JSON.stringify({ x: 1 }));
  // App-global UI preference — must SURVIVE the clear.
  store.setItem('sep-library-view-mode', 'grid');
}

const ACCOUNT_KEYS = [
  'socanim_brand_settings',
  'socanim_listing_profile',
  'socanim_clients',
  'socanim_onboarding_seen',
  'socanim_onboarding_sample_walked',
  'socanim_onboarding_path_a_complete',
  'workflowInstance:index',
  'workflowInstance:workflow_abc',
  'socanim_colors_listing-card',
  'sep-pages-order',
  'listingFlyer:draft',
  'sellerIntelligenceReport:draft',
];

test.describe('account-storage — clearAccountScopedStorage', () => {
  test.beforeEach(installLocalStorageShim);
  test.afterEach(uninstallLocalStorageShim);

  test('wipes every per-account key (exact + prefixed)', () => {
    seedFullCache();
    clearAccountScopedStorage();
    for (const k of ACCOUNT_KEYS) {
      expect(ls().getItem(k), `${k} should be cleared`).toBeNull();
    }
  });

  test('preserves app-global UI preference + the owner stamp', () => {
    seedFullCache();
    stampOwner('a@x.com');
    clearAccountScopedStorage();
    expect(ls().getItem('sep-library-view-mode')).toBe('grid');
    expect(readOwnerStamp()).toBe('a@x.com');
  });
});

test.describe('account-storage — reconcileAccountOwnership', () => {
  test.beforeEach(installLocalStorageShim);
  test.afterEach(uninstallLocalStorageShim);

  test('no authenticated email is a no-op', () => {
    seedFullCache();
    expect(reconcileAccountOwnership(null)).toEqual({ cleared: false, reason: 'no-email' });
    expect(reconcileAccountOwnership('')).toEqual({ cleared: false, reason: 'no-email' });
    expect(ls().getItem('socanim_brand_settings')).not.toBeNull();
  });

  test('same email round-trip keeps the cache intact (case-insensitive)', () => {
    seedFullCache();
    stampOwner('jordan@x.com');
    const r = reconcileAccountOwnership('Jordan@X.com');
    expect(r).toEqual({ cleared: false, reason: 'match' });
    expect(ls().getItem('socanim_listing_profile')).not.toBeNull();
    expect(ls().getItem('listingFlyer:draft')).not.toBeNull();
  });

  test('account switch (stamp differs) clears and re-stamps the new owner', () => {
    seedFullCache('jordan@x.com');
    stampOwner('jordan@x.com');
    const r = reconcileAccountOwnership('blake@y.com');
    expect(r).toEqual({ cleared: true, reason: 'switch' });
    for (const k of ACCOUNT_KEYS) {
      expect(ls().getItem(k), `${k} should be cleared on switch`).toBeNull();
    }
    expect(readOwnerStamp()).toBe('blake@y.com');
    // App-global pref survives.
    expect(ls().getItem('sep-library-view-mode')).toBe('grid');
  });

  test('unstamped browser with a FOREIGN brand owner clears (pre-fix transition)', () => {
    // No global stamp yet, but the brand blob proves it belongs to Jordan.
    seedFullCache('jordan@x.com');
    const r = reconcileAccountOwnership('blake@y.com');
    expect(r).toEqual({ cleared: true, reason: 'foreign-brand' });
    expect(ls().getItem('socanim_brand_settings')).toBeNull();
    expect(readOwnerStamp()).toBe('blake@y.com');
  });

  test('unstamped browser with own/legacy cache adopts without clearing', () => {
    // Legacy blob with no owner stamp anywhere — the legitimate single user's
    // upgrade path. Must NOT destroy their local-only work.
    seedFullCache();
    const r = reconcileAccountOwnership('jordan@x.com');
    expect(r).toEqual({ cleared: false, reason: 'adopt' });
    expect(ls().getItem('socanim_listing_profile')).not.toBeNull();
    expect(readOwnerStamp()).toBe('jordan@x.com');
  });

  test('adopt then a later different sign-in switches cleanly', () => {
    seedFullCache();
    reconcileAccountOwnership('jordan@x.com'); // adopt + stamp
    const r = reconcileAccountOwnership('blake@y.com'); // now a real switch
    expect(r).toEqual({ cleared: true, reason: 'switch' });
    expect(ls().getItem('socanim_clients')).toBeNull();
    expect(readOwnerStamp()).toBe('blake@y.com');
  });
});

test.describe('brand-settings-migration — cross-account contamination guard', () => {
  const base: BrandSettings = {
    logoDataUrl: null,
    agentName: 'Jordan Rivera',
    primaryColor: '#4ef2d9',
    accentColor: '#ffffff',
    backgroundColor: '',
    contactEmail: '',
    contactPhone: '',
    licenseNumber: '',
    brokerage: '',
  };

  test('never pushes a FOREIGN local blob into a fresh account', () => {
    const plan = planBrandMigration({
      localSettings: { ...base, ownerEmail: 'jordan@x.com' },
      serverPresent: false,
      sessionEmail: 'blake@y.com',
    });
    expect(plan).toEqual({ shouldPush: false, reason: 'not-owned' });
  });

  test('never pushes a LEGACY (unowned) local blob', () => {
    const plan = planBrandMigration({
      localSettings: base, // no ownerEmail
      serverPresent: false,
      sessionEmail: 'blake@y.com',
    });
    expect(plan).toEqual({ shouldPush: false, reason: 'not-owned' });
  });

  test('pushes only a local blob the signing-in agent already owns', () => {
    const plan = planBrandMigration({
      localSettings: { ...base, ownerEmail: 'blake@y.com' },
      serverPresent: false,
      sessionEmail: 'Blake@Y.com',
    });
    expect(plan).toEqual({ shouldPush: true, reason: 'claim-local' });
  });

  test('server copy always wins over a local blob (never clobbered)', () => {
    const plan = planBrandMigration({
      localSettings: { ...base, ownerEmail: 'blake@y.com' },
      serverPresent: true,
      sessionEmail: 'blake@y.com',
    });
    expect(plan).toEqual({ shouldPush: false, reason: 'server-wins' });
  });
});
