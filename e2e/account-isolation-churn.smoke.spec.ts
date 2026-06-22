import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * PRE-LAUNCH multi-account isolation + brand-integrity smoke.
 *
 * Why this exists (the class of bug it guards): the v1.6x breach was a NEW
 * account, on a shared browser still holding ANOTHER account's full brand,
 * seeing that foreign profile — name/contact/reviews/bio rendered, the capture
 * name field pre-filled (the concatenated "Morgan LeeDallen Taylor"), and the
 * foreign brand autosaved UP into the new account's server record. It slipped
 * past every per-function unit + DOM check because no test exercised the thing
 * that actually breaks in the field: SIGN-IN CHURN across several accounts on
 * ONE browser, with the cross-surface invariant asserted after each hop.
 *
 * `e2e/account-storage.spec.ts` already pins the reconcile UNIT behavior and
 * the single A→B /welcome scenario. This file is deliberately higher-altitude:
 * it churns three distinct accounts in sequence — each one entering through a
 * DIFFERENT real entry point — and after every sign-in asserts ONE blunt
 * invariant across EVERY account-scoped surface (brand, reviews, contact,
 * listing, clients, per-tool drafts, minted/published workflow records,
 * onboarding "published" markers):
 *
 *     the only account data on this browser belongs to whoever is signed in
 *     right now — no foreign token anywhere, no concatenated name, nothing
 *     minted/published carried over.
 *
 * "Sign in as X through entry E" is modeled as the exact call every entry point
 * makes: reconcileAccountOwnership(X). All three entries (/welcome,
 * DashboardEntry, /login) are proven below to funnel through that one call, so
 * driving it directly is faithful — and the source-contract block at the bottom
 * fails loudly if any entry ever stops calling it (which would silently reopen
 * the hole for that surface).
 *
 * Node-context (no browser), matching account-storage.spec.ts: an in-memory
 * localStorage shim is installed on globalThis.window so the `typeof window`
 * guards in src/lib/account-storage.ts flip truthy.
 */

import {
  reconcileAccountOwnership,
  readOwnerStamp,
} from '../src/lib/account-storage';

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

/**
 * A full cross-surface account fixture. Every string in `tokens` is UNIQUE to
 * this account and appears somewhere in the data it writes — so a single
 * substring scan over all of localStorage proves whether any of it leaked into
 * another account's session.
 */
interface Account {
  email: string;
  name: string;
  contact: string;
  bio: string;
  review: string;
  listingAddress: string;
  clientName: string;
  draftTitle: string;
  mintedSlug: string; // a "published"/minted artifact
  /** Distinctive strings that must NEVER appear while a DIFFERENT account is in. */
  tokens: string[];
}

const ACCOUNTS: Account[] = [
  {
    email: 'morgan@maplerealty.com',
    name: 'Morgan Lee',
    contact: 'morgan@maplerealty.com',
    bio: 'Selling maples since 2009.',
    review: 'Morgan sold our home in a weekend.',
    listingAddress: '12 Maple Court',
    clientName: 'The Abernathys',
    draftTitle: 'Maple Court Open House',
    mintedSlug: 'maple-court-flyer',
    tokens: [
      'Morgan Lee',
      'morgan@maplerealty.com',
      'Selling maples since 2009.',
      'Morgan sold our home in a weekend.',
      '12 Maple Court',
      'The Abernathys',
      'Maple Court Open House',
      'maple-court-flyer',
    ],
  },
  {
    email: 'dallentaylorproductions+onbprodsmoke@gmail.com',
    name: 'Dallen Taylor',
    contact: 'aaron@aaronthomashometeam.com',
    bio: 'Working in the PNW for the last 20+ years.',
    review: 'What a guy, heck of a realtor.',
    listingAddress: '88 Cedar Ridge',
    clientName: 'The Johnsons',
    draftTitle: 'Cedar Ridge Listing',
    mintedSlug: 'cedar-ridge-presentation',
    tokens: [
      'Dallen Taylor',
      'aaron@aaronthomashometeam.com',
      'Working in the PNW for the last 20+ years.',
      'What a guy, heck of a realtor.',
      '88 Cedar Ridge',
      'The Johnsons',
      'Cedar Ridge Listing',
      'cedar-ridge-presentation',
    ],
  },
  {
    email: 'blake@summitgroup.io',
    name: 'Blake Rivera',
    contact: 'blake@summitgroup.io',
    bio: 'Summit-area specialist.',
    review: 'Blake got us above asking.',
    listingAddress: '400 Summit Way',
    clientName: 'The Patels',
    draftTitle: 'Summit Way Promo',
    mintedSlug: 'summit-way-promo',
    tokens: [
      'Blake Rivera',
      'blake@summitgroup.io',
      'Summit-area specialist.',
      'Blake got us above asking.',
      '400 Summit Way',
      'The Patels',
      'Summit Way Promo',
      'summit-way-promo',
    ],
  },
];

/**
 * Write a full cross-surface cache for `acct` — exactly the keys the auth fix
 * scopes (brand, listing, clients, onboarding markers, the draft index +
 * records, per-tool drafts, saved colors, pages order). Represents this agent
 * doing real work after signing in. Brand carries the owner stamp the live app
 * writes via useBrandSettings().update.
 */
function doWorkAs(acct: Account): void {
  const store = ls();
  store.setItem(
    'socanim_brand_settings',
    JSON.stringify({
      agentName: acct.name,
      contactEmail: acct.contact,
      agentBioShort: acct.bio,
      agentReviews: [{ body: acct.review }],
      ownerEmail: acct.email.toLowerCase(),
    }),
  );
  store.setItem('socanim_listing_profile', JSON.stringify({ address: acct.listingAddress }));
  store.setItem('socanim_clients', JSON.stringify({ c1: { name: acct.clientName } }));
  store.setItem('socanim_onboarding_seen', '1');
  store.setItem('socanim_onboarding_sample_walked', '1');
  // path_a_complete is the "I minted/published my first asset" marker.
  store.setItem('socanim_onboarding_path_a_complete', '1');
  store.setItem('workflowInstance:index', JSON.stringify([acct.mintedSlug]));
  store.setItem(
    `workflowInstance:${acct.mintedSlug}`,
    JSON.stringify({ instanceId: acct.mintedSlug, title: acct.draftTitle }),
  );
  store.setItem('listingFlyer:draft', JSON.stringify({ title: acct.draftTitle }));
  store.setItem(`socanim_colors_${acct.mintedSlug}`, JSON.stringify({ bg: '#101010' }));
  store.setItem('sep-pages-order', JSON.stringify([acct.mintedSlug]));
  // App-global UI pref — present throughout, must always survive.
  store.setItem('sep-library-view-mode', 'grid');
}

/** Concatenate every account-scoped value currently in storage (skip the app-global pref + the stamp). */
function dumpAccountData(): string {
  const store = ls();
  const parts: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || k === 'sep-library-view-mode' || k === 'socanim_owner_email') continue;
    parts.push(store.getItem(k) ?? '');
  }
  return parts.join(' ');
}

/**
 * THE invariant. After `current` has signed in (reconcile already run), assert
 * NO other account's tokens survive anywhere in account-scoped storage, and no
 * name got concatenated.
 */
function assertOnlyMine(current: Account): void {
  const dump = dumpAccountData();
  for (const other of ACCOUNTS) {
    if (other.email === current.email) continue;
    for (const token of other.tokens) {
      expect(
        dump.includes(token),
        `leak: "${token}" (from ${other.email}) is still present while ${current.email} is signed in`,
      ).toBe(false);
    }
  }
  // No concatenated agent name — the "Morgan LeeDallen Taylor" artifact. The
  // current name must stand alone, never glued to a prior agent's.
  const raw = ls().getItem('socanim_brand_settings');
  if (raw) {
    const agentName = (JSON.parse(raw) as { agentName?: string }).agentName ?? '';
    for (const other of ACCOUNTS) {
      if (other.email === current.email) continue;
      expect(
        agentName.includes(other.name),
        `concatenated name: "${agentName}" contains ${other.name}`,
      ).toBe(false);
    }
  }
}

/**
 * The reconcile-clearing hop is what makes a fresh account START clean — and a
 * clean start (no brand blob to pre-fill from) is precisely what prevents the
 * name-concatenation. Assert the brand blob is gone the instant a different
 * account signs in, BEFORE it writes anything.
 */
function assertFreshStart(): void {
  expect(ls().getItem('socanim_brand_settings'), 'a switched-in account must start with NO brand blob').toBeNull();
  expect(ls().getItem('socanim_listing_profile')).toBeNull();
  expect(ls().getItem('workflowInstance:index'), 'no minted records carried over').toBeNull();
  expect(ls().getItem('socanim_onboarding_path_a_complete'), 'no published marker carried over').toBeNull();
}

test.describe('account isolation — multi-account sign-in churn (pre-launch smoke)', () => {
  test.beforeEach(installLocalStorageShim);
  test.afterEach(uninstallLocalStorageShim);

  test('A→B→C→A churn on one browser: each session sees only its own data', () => {
    const [A, B, C] = ACCOUNTS;

    // --- A signs in on a fresh browser (legacy/empty → adopt), then works.
    expect(reconcileAccountOwnership(A.email).reason).toBe('adopt');
    doWorkAs(A);
    assertOnlyMine(A);
    expect(readOwnerStamp()).toBe(A.email.toLowerCase());

    // --- A signs out (no clear — clear-on-CHANGE), B signs in on the same browser.
    // B's first hop must clear A wholesale and start fresh, then B works.
    expect(reconcileAccountOwnership(B.email)).toEqual({ cleared: true, reason: 'switch' });
    assertFreshStart();
    doWorkAs(B);
    assertOnlyMine(B);
    expect(readOwnerStamp()).toBe(B.email.toLowerCase());

    // --- B → C.
    expect(reconcileAccountOwnership(C.email)).toEqual({ cleared: true, reason: 'switch' });
    assertFreshStart();
    doWorkAs(C);
    assertOnlyMine(C);

    // --- C → back to A. A returns to a CLEAN slate (server rehydrates A's real
    // brand; nothing of C lingers). The round-trip must not resurrect A's old
    // local-only work as if it were still there OR leak C's.
    expect(reconcileAccountOwnership(A.email)).toEqual({ cleared: true, reason: 'switch' });
    assertFreshStart();
    doWorkAs(A);
    assertOnlyMine(A);
    expect(readOwnerStamp()).toBe(A.email.toLowerCase());
  });

  test('same-account round-trip (sign out → back in as self) keeps that agent’s work', () => {
    const [, B] = ACCOUNTS;
    reconcileAccountOwnership(B.email); // adopt
    doWorkAs(B);
    // Sign out (no-op) then sign back in as the SAME agent — case-insensitively.
    const r = reconcileAccountOwnership(B.email.toUpperCase());
    expect(r).toEqual({ cleared: false, reason: 'match' });
    // B's local-only work survives a same-email round-trip (the data-loss stop condition).
    expect(ls().getItem('socanim_listing_profile')).not.toBeNull();
    expect(ls().getItem('socanim_clients')).not.toBeNull();
    expect(ls().getItem('listingFlyer:draft')).not.toBeNull();
    assertOnlyMine(B);
  });

  test('rapid churn never accumulates foreign data (every account, every hop)', () => {
    // Hammer the churn: cycle through all accounts twice in a ring. After EACH
    // hop the invariant must hold — no slow build-up of cross-account residue.
    const ring = [...ACCOUNTS, ...ACCOUNTS, ACCOUNTS[0]];
    let prev: Account | null = null;
    for (const acct of ring) {
      const r = reconcileAccountOwnership(acct.email);
      if (prev && prev.email !== acct.email) {
        expect(r.cleared, `${prev.email}→${acct.email} must clear`).toBe(true);
        assertFreshStart();
      }
      doWorkAs(acct);
      assertOnlyMine(acct);
      prev = acct;
    }
  });
});

/**
 * Source-contract: ALL THREE authenticated entry points reconcile. The breach
 * was a single entry (/welcome) that didn't — so the smoke above is only honest
 * if every surface a churn can route through still funnels through reconcile.
 * If any of these stops calling it, this fails and names the reopened hole.
 */
test.describe('account isolation — every entry point reconciles (source contract)', () => {
  function readSrc(rel: string): string {
    return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  }

  const ENTRIES: Array<{ surface: string; file: string }> = [
    { surface: '/welcome', file: 'src/app/welcome/WelcomeAccountReconcile.tsx' },
    { surface: 'dashboard', file: 'src/app/dashboard/DashboardEntry.tsx' },
    { surface: '/login', file: 'src/app/login/page.tsx' },
  ];

  for (const { surface, file } of ENTRIES) {
    test(`${surface} calls reconcileAccountOwnership`, () => {
      const src = readSrc(file);
      expect(src).toContain('reconcileAccountOwnership');
    });
  }
});
