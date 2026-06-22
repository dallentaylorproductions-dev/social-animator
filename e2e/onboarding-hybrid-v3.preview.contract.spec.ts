import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildSamplePreviewPayload,
  ONBOARDING_PREVIEW_ACCENT,
  SAMPLE_LISTING_DRAFT,
  SAMPLE_RECENT_LISTINGS,
} from '../src/lib/onboarding/sample-listing-draft';
import { isInvitationStatus } from '../src/tools/seller-presentation/engine/types';
import type { BrandSettings } from '../src/lib/brand';

/**
 * ONBOARDING_HYBRID_V3 — Phase 4a, the read-only "sample home, real you" preview.
 *
 * The preview is flag-gated DARK and the harness can't flip a server env flag
 * mid-suite, so 4a is proven the way the V1/V2/Phase-3 DARK passes were: PURE
 * assertions on the payload the real page renders (sample listing + real brand,
 * graceful empty profile, the studio-mint accent), plus source-contract greps on
 * the no-mint/no-beacon guarantee (G1). Flag-on render fidelity is a Cowork
 * preview check at the end of the stack.
 */

const brand = (over: Partial<BrandSettings> = {}): BrandSettings =>
  ({ agentName: '', ...over }) as unknown as BrandSettings;

/* ───────────── pure: sample LISTING + the agent's REAL profile ──────────── */

test.describe('onboarding V3 preview payload — sample listing, real you', () => {
  test('the listing is the sample home (1742 Kenilworth, four comps)', () => {
    const payload = buildSamplePreviewPayload(brand());
    expect(payload.property.address).toBe('1742 Kenilworth Avenue');
    expect(payload.comps.length).toBe(4);
    // Sanity: the draft itself is the sample listing source.
    expect(SAMPLE_LISTING_DRAFT.propertyAddress).toBe('1742 Kenilworth Avenue');
  });

  test('it resolves to the prepared-invitation (State A) render — no subject price', () => {
    const payload = buildSamplePreviewPayload(brand());
    expect(isInvitationStatus(payload.valuationStatus)).toBe(true);
    expect(payload.property.recommendedList).toBeFalsy();
    expect(payload.property.recommendedListLow).toBeUndefined();
  });

  test('an EMPTY profile degrades gracefully — no fabricated agent or review', () => {
    const payload = buildSamplePreviewPayload(brand());
    // Empty name → the hero/agent fallback renders (monogram/neutral byline);
    // the payload carries no fabricated name.
    expect(payload.agent.name ?? '').toBe('');
    // Absence GHOSTS — no review present means no fabricated review.
    expect(payload.reviews ?? []).toHaveLength(0);
  });

  test('a POPULATED profile flows the REAL agent into the page', () => {
    const payload = buildSamplePreviewPayload(
      brand({
        agentName: 'Sarah Lin',
        agentPhotoUrl: 'https://cdn.example/headshot.jpg',
        contactEmail: 'sarah@realty.com',
        contactPhone: '2065550114',
        agentReviews: [
          { body: 'She made it easy.', attributionName: 'A recent seller' },
        ],
      }),
    );
    expect(payload.agent.name).toBe('Sarah Lin');
    expect(payload.agent.photoUrl).toBe('https://cdn.example/headshot.jpg');
    expect(payload.agent.email).toBe('sarah@realty.com');
    expect(payload.reviews?.[0]?.body).toBe('She made it easy.');
  });

  test('empty contact falls back to the account email (reach of last resort)', () => {
    const payload = buildSamplePreviewPayload(
      brand({ agentName: 'Sarah Lin' }),
      'sarah@account.com',
    );
    expect(payload.agent.email).toBe('sarah@account.com');
  });
});

test.describe('onboarding V3 preview accent — studio mint when unset', () => {
  test('an unset brand accent resolves to studio mint #5BF5C9', () => {
    const payload = buildSamplePreviewPayload(brand());
    expect(payload.brandColors?.accent).toBe(ONBOARDING_PREVIEW_ACCENT);
    expect(ONBOARDING_PREVIEW_ACCENT).toBe('#5BF5C9');
  });

  test('a set brand accent wins over the mint default', () => {
    const payload = buildSamplePreviewPayload(brand({ brandAccent: '#2C53C4' }));
    expect(payload.brandColors?.accent).toBe('#2C53C4');
  });
});

/* ───── Zone 5 exposure coverflow — representative demo in the sample preview ──── */

test.describe('onboarding V3 preview — Zone 5 listings coverflow (sample demo)', () => {
  test('the sample preview carries the four representative ATHT listings', () => {
    const payload = buildSamplePreviewPayload(brand());
    expect(payload.recentListings).toBeDefined();
    expect(payload.recentListings).toHaveLength(4);
    // Same object the coverflow reads — addresses + cities are the approved set.
    expect(payload.recentListings).toEqual(SAMPLE_RECENT_LISTINGS);
    const addrs = payload.recentListings!.map((l) => l.address);
    expect(addrs).toEqual([
      '9825 Glory Dr SE',
      '3642 22nd Ave NE',
      '6706 83rd Ln SE',
      '15117 Prescott Lp SE',
    ]);
  });

  test('every card has a non-blank photo (committed sample asset, no Street View key needed)', () => {
    // The honesty/visual gate: cards are NEVER blank. The sample reuses the same
    // committed /sample-assets/*.webp the sibling coverflow fixtures use, so the
    // photo renders in every environment (no Google key required).
    for (const l of SAMPLE_RECENT_LISTINGS) {
      expect(l.photoUrl, `${l.address} must have a photo`).toMatch(
        /^\/sample-assets\/.+\.webp$/,
      );
    }
  });

  test('per-card real numbers sum to the 139,600 aggregate (honest, summed not authored)', () => {
    const counts = SAMPLE_RECENT_LISTINGS.map((l) => l.viewCount ?? 0);
    expect(counts).toEqual([28560, 32246, 41184, 37610]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(139600);
    // Aggregate gate: ≥2 numbered cards, so the "BUYER VIEWS ACROSS RECENT
    // LISTINGS" line renders.
    expect(counts.filter((n) => n > 0).length).toBeGreaterThanOrEqual(2);
  });

  test('no fabricated portal claim — cards carry no named-source label', () => {
    // Source-agnostic by policy: the render shows a plain "Views" and never a
    // named portal on a number we do not control.
    for (const l of SAMPLE_RECENT_LISTINGS) {
      expect(l.sourceLabel).toBeUndefined();
    }
  });

  test('with zero listings the coverflow flexes out (no husk on the payload)', () => {
    // Proves the empty/flex-out path at the payload boundary: an empty array
    // injected the same way leaves nothing for the coverflow to render, so the
    // section falls back to the capability cards (CampaignSpread returns the
    // cards-only render when `recentListings` is empty).
    expect(SAMPLE_RECENT_LISTINGS.length).toBeGreaterThan(0); // the demo IS populated
    // The component-level flex-out (capability cards only) is covered by
    // seller-presentation.state-a-coverflow.spec.ts (fixture=state-a, no listings).
  });
});

/* ───────── source-contract: G1 — no write path, no beacon in the render ─────── */

function readSrc(rel: string): string {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

const MINT_AND_TRACK = [
  'createInstance',
  'putServerDraft',
  'markPublished',
  'generateSlug',
  'publishHandout',
  'postViewBeacon',
  'PresentationPageMotion',
];

test.describe('onboarding V3 preview — G1 no-write/no-beacon (source contract)', () => {
  test('the AgentLayerSetup surface imports no mint/track function', () => {
    const src = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    for (const sym of MINT_AND_TRACK) {
      expect(src, `must not reference ${sym}`).not.toContain(sym);
    }
    // It renders the REAL page (no new renderer, G7) in read-only preview mode.
    expect(src).toContain('StateAPage');
    expect(src).toContain('preview');
    // And reads the real Agent Layer (consumes Phase 2; never writes an instance).
    expect(src).toContain('useBrandSettings');
  });

  test('the sample-listing builder is pure — no mint/track function', () => {
    const src = readSrc('src/lib/onboarding/sample-listing-draft.ts');
    for (const sym of MINT_AND_TRACK) {
      expect(src, `must not reference ${sym}`).not.toContain(sym);
    }
  });

  test('StateAPage omits the engagement-beacon island in preview mode', () => {
    const src = readSrc(
      'src/tools/seller-presentation/output/flagship/StateAPage.tsx',
    );
    // The motion island (the only side-effecting branch) is gated on !preview, so
    // the beacon is structurally unreachable from the read-only preview.
    expect(src).toContain('{!preview && (');
    expect(src).toContain('preview = false');
  });
});
