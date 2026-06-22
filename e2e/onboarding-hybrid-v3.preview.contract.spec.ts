import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildSamplePreviewPayload,
  ONBOARDING_PREVIEW_ACCENT,
  SAMPLE_LISTING_DRAFT,
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
