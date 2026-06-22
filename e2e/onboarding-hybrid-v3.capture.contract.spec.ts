import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  firstOpenSlotIndex,
  isSlotDone,
  progressCue,
  SKIPPABLE,
  SLOTS,
} from '../src/lib/onboarding/agent-layer-slots';
import type { BrandSettings } from '../src/lib/brand';

/**
 * ONBOARDING_HYBRID_V3 — Phase 4b, the payoff-gated capture UX.
 *
 * The capture is flag-gated DARK and writes through a React/`useBrandSettings`
 * tree the harness can't drive with a flipped env flag, so 4b is proven the way
 * the rest of the stack was: PURE assertions on the slot rules (which fields are
 * captured, one-active ordering, payoff-gating, completion, qualitative cues)
 * plus source-contract greps on the no-mint / reuse guarantees. Flag-on live
 * field-by-field update is a Cowork preview check at the end of the stack.
 */

const merge = (over: Partial<BrandSettings> = {}): BrandSettings =>
  ({ agentName: '', ...over }) as unknown as BrandSettings;

/** An empty Agent Layer. */
const brand = (): BrandSettings => merge();

/* ───────────── pure: payoff-gated slots, one active, completion ──────────── */

test.describe('onboarding V3 capture slots — payoff-gated', () => {
  test('the captured set is exactly name · headshot · contact · exposure · review', () => {
    expect([...SLOTS]).toEqual([
      'name',
      'headshot',
      'contact',
      'exposure',
      'review',
    ]);
    // No license / bio / years / areas / brokerage — they do not visibly change
    // the preview, so they are Settings-later, never onboarding slots (G2).
    for (const off of ['licenseNumber', 'agentBioShort', 'brokerage']) {
      expect(SLOTS).not.toContain(off);
    }
  });

  test('only enrichment slots are skippable; name + contact are required', () => {
    expect(SKIPPABLE.has('headshot')).toBe(true);
    expect(SKIPPABLE.has('exposure')).toBe(true);
    expect(SKIPPABLE.has('review')).toBe(true);
    expect(SKIPPABLE.has('name')).toBe(false);
    expect(SKIPPABLE.has('contact')).toBe(false);
  });

  test('isSlotDone reads the field that drives each preview section', () => {
    expect(isSlotDone('name', merge({ agentName: 'Sarah' }))).toBe(true);
    expect(isSlotDone('name', brand())).toBe(false);
    expect(isSlotDone('headshot', merge({ agentPhotoUrl: 'x' }))).toBe(true);
    expect(isSlotDone('contact', merge({ contactPhone: '2065550114' }))).toBe(true);
    expect(isSlotDone('contact', merge({ contactEmail: 'a@b.com' }))).toBe(true);
    expect(isSlotDone('contact', brand())).toBe(false);
    expect(isSlotDone('exposure', merge({ leadEmphasis: 'social-reach' }))).toBe(true);
    expect(isSlotDone('review', merge({ reviewsOutlinkUrl: 'https://z' }))).toBe(true);
    expect(
      isSlotDone('review', merge({ agentReviews: [{ body: 'b', attributionName: 'n' }] })),
    ).toBe(true);
  });

  test('a fresh agent lands on the first slot; a fully-set agent is COMPLETED', () => {
    expect(firstOpenSlotIndex(brand())).toBe(0); // name
    // name set → headshot is next active (payoff-gated past what is already real)
    expect(firstOpenSlotIndex(merge({ agentName: 'Sarah' }))).toBe(1);
    const fullyFilled = merge({
      agentName: 'Sarah',
      agentPhotoUrl: 'x',
      contactEmail: 'a@b.com',
      leadEmphasis: 'social-reach',
      reviewsOutlinkUrl: 'https://z',
    });
    expect(firstOpenSlotIndex(fullyFilled)).toBe(SLOTS.length); // → completed
  });

  test('progress is a qualitative cue, never a percentage', () => {
    expect(progressCue(brand())).toBe("Let's make this yours");
    expect(progressCue(merge({ agentName: 'Sarah' }))).toBe('Looks like you');
    expect(progressCue(merge({ contactEmail: 'a@b.com' }))).toBe('Reachable');
    expect(
      progressCue(merge({ agentName: 'Sarah', contactPhone: '2065550114' })),
    ).toBe('Ready for your first address');
    // No "%" anywhere in the cue vocabulary.
    for (const cue of [
      progressCue(brand()),
      progressCue(merge({ agentName: 'Sarah' })),
      progressCue(merge({ agentName: 'Sarah', contactEmail: 'a@b.com' })),
    ]) {
      expect(cue).not.toContain('%');
    }
  });
});

/* ───────── source-contract: G1 no-mint + G7 reuse, not reinvention ───────── */

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

test.describe('onboarding V3 capture — G1 no-mint + G7 reuse (source contract)', () => {
  test('the capture surface mints nothing — only the brand record is written', () => {
    const src = readSrc('src/app/welcome/AgentLayerCapture.tsx');
    for (const sym of MINT_AND_TRACK) {
      expect(src, `must not reference ${sym}`).not.toContain(sym);
    }
    // Every write goes through the brand `update` seam.
    expect(src).toContain('update({ ...settings');
  });

  test('the capture REUSES the existing Settings field + lever + outlink (G7)', () => {
    const src = readSrc('src/app/welcome/AgentLayerCapture.tsx');
    // Headshot = the Settings HeadshotField (not a new uploader).
    expect(src).toContain("from '@/app/settings/HeadshotField'");
    expect(src).toContain('<HeadshotField');
    // Exposure = the existing leadEmphasis lever constants.
    expect(src).toContain("from '@/lib/seller-presentation/lead-emphasis'");
    expect(src).toContain('leadEmphasis');
    // Review link = the existing reviewsOutlinkUrl field.
    expect(src).toContain('reviewsOutlinkUrl');
  });

  test('Path A ends COMPLETED and routes to the dashboard (G6)', () => {
    const setup = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    expect(setup).toContain("router.replace('/dashboard')");
    const capture = readSrc('src/app/welcome/AgentLayerCapture.tsx');
    expect(capture).toContain('onbv3-completed');
    expect(capture).toContain('Create your first seller page');
  });
});
