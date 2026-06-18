import { test, expect } from '@playwright/test';
import { buildOnboardingStateAPayload } from '../src/lib/onboarding/state-a-payload';
import {
  toPublicPayload,
  clampPublicPayload,
} from '../src/tools/seller-presentation/output/public-payload';
import {
  clampDraft,
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from '../src/tools/seller-presentation/engine/types';
import {
  LEAD_EMPHASIS_KEYS,
  LEAD_EMPHASIS_LABELS,
  LEAD_EMPHASIS_MORE,
  LEAD_EMPHASIS_PRIMARY,
  clampLeadEmphasis,
  isLeadEmphasisKey,
} from '../src/lib/seller-presentation/lead-emphasis';
import {
  CAMPAIGN_HEADLINE_BY_EMPHASIS,
  CAMPAIGN_HEADLINE_DEFAULT,
} from '../src/tools/seller-presentation/output/flagship/state-a-copy';
import type { BrandSettings } from '../src/lib/brand';

/**
 * ONBOARDING_FIRST_RUN_V2 · phase 3b - BrandSettings.leadEmphasis (locked Q7b)
 * + the CampaignSpread headline wiring. Pure-Node: proves the set-once value
 * round-trips through the boundary clamp, drives the launch-story headline, and
 * is byte-identical (the key is OMITTED) when unset or on a revealed / flag-off
 * publish. The flag-on render is a Cowork preview check.
 */

const draft = (
  over: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft => ({
  ...EMPTY_DRAFT,
  valuationStatus: 'preparing_for_walkthrough',
  propertyAddress: '123 Oak St',
  ...over,
});

const brand = (over: Partial<BrandSettings> = {}): BrandSettings =>
  ({ agentName: 'Sarah', ...over }) as unknown as BrandSettings;

test.describe('lead-emphasis vocabulary', () => {
  test('the clamp accepts known keys and rejects everything else', () => {
    for (const k of LEAD_EMPHASIS_KEYS) {
      expect(isLeadEmphasisKey(k)).toBe(true);
      expect(clampLeadEmphasis(k)).toBe(k);
    }
    expect(clampLeadEmphasis('bogus')).toBeUndefined();
    expect(clampLeadEmphasis('')).toBeUndefined();
    expect(clampLeadEmphasis(undefined)).toBeUndefined();
    expect(clampLeadEmphasis(42)).toBeUndefined();
  });

  test('every key has a label, and primary+more partition the keys exactly once', () => {
    for (const k of LEAD_EMPHASIS_KEYS) {
      expect(LEAD_EMPHASIS_LABELS[k]?.length).toBeGreaterThan(0);
    }
    const split = [...LEAD_EMPHASIS_PRIMARY, ...LEAD_EMPHASIS_MORE];
    expect(new Set(split).size).toBe(split.length); // no overlap
    expect([...split].sort()).toEqual([...LEAD_EMPHASIS_KEYS].sort()); // full cover
    expect(LEAD_EMPHASIS_PRIMARY.length).toBe(4); // locked Gate-3 "four first"
  });
});

test.describe('campaign headline copy', () => {
  test('the default reproduces the shipped headline byte-for-byte', () => {
    // Guards the byte-identical render for every agent who never picked a lever.
    expect(CAMPAIGN_HEADLINE_DEFAULT.lead).toBe('Produced beautifully.');
    expect(CAMPAIGN_HEADLINE_DEFAULT.em).toBe('Put in front of buyers');
  });

  test('every lever maps to a headline, none with an em-dash', () => {
    for (const k of LEAD_EMPHASIS_KEYS) {
      const h = CAMPAIGN_HEADLINE_BY_EMPHASIS[k];
      expect(h?.lead?.length).toBeGreaterThan(0);
      expect(h?.em?.length).toBeGreaterThan(0);
      expect(`${h.lead} ${h.em}`.includes('—')).toBe(false);
    }
  });
});

test.describe('leadEmphasis flows into a State A invitation payload', () => {
  test('a set lever projects onto the payload (drives the headline)', () => {
    const payload = buildOnboardingStateAPayload(
      draft(),
      brand({ leadEmphasis: 'open-house' }),
    );
    expect(payload.leadEmphasis).toBe('open-house');
    // And the headline the renderer would pick is the lever's, not the default.
    expect(isLeadEmphasisKey(payload.leadEmphasis)).toBe(true);
    expect(CAMPAIGN_HEADLINE_BY_EMPHASIS[payload.leadEmphasis!]).toEqual(
      CAMPAIGN_HEADLINE_BY_EMPHASIS['open-house'],
    );
  });

  test('unset OR a tampered value leaves no leadEmphasis (default headline)', () => {
    const unset = buildOnboardingStateAPayload(draft(), brand());
    expect(unset.leadEmphasis).toBeUndefined();

    // A tampered wire value is clamped away at the projection boundary.
    const tampered = toPublicPayload(
      clampDraft(draft()),
      {},
      {},
      {},
      false,
      { leadEmphasis: 'bogus-lever' },
      false,
      true,
    );
    expect(tampered.leadEmphasis).toBeUndefined();
  });
});

test.describe('byte-identical when not a State A invitation publish', () => {
  test('a revealed publish OMITS the leadEmphasis key entirely', () => {
    const revealed = toPublicPayload(
      clampDraft(draft({ valuationStatus: 'revealed' })),
      {},
      {},
      {},
      false,
      { leadEmphasis: 'open-house' },
      false,
      true, // sellerStateA on, but the draft is revealed -> not an invitation
    );
    expect(
      Object.prototype.hasOwnProperty.call(revealed, 'leadEmphasis'),
    ).toBe(false);
  });

  test('a State-A-flag-off publish OMITS the leadEmphasis key entirely', () => {
    const flagOff = toPublicPayload(
      clampDraft(draft()),
      {},
      {},
      {},
      false,
      { leadEmphasis: 'open-house' },
      false,
      false, // sellerStateA off
    );
    expect(
      Object.prototype.hasOwnProperty.call(flagOff, 'leadEmphasis'),
    ).toBe(false);
  });

  test('the read clamp keeps it on an invitation record, drops it on a revealed one', () => {
    const onInvite = clampPublicPayload({
      valuationStatus: 'preparing_for_walkthrough',
      leadEmphasis: 'video-story',
    });
    expect(onInvite.leadEmphasis).toBe('video-story');

    const onRevealed = clampPublicPayload({
      valuationStatus: 'revealed',
      leadEmphasis: 'video-story',
    });
    expect(onRevealed.leadEmphasis).toBeUndefined();

    const tampered = clampPublicPayload({
      valuationStatus: 'preparing_for_walkthrough',
      leadEmphasis: 'bogus',
    });
    expect(tampered.leadEmphasis).toBeUndefined();
  });
});
