import { test, expect } from '@playwright/test';
import React from 'react';

/**
 * Seller Presentation — UX-2a optional recommended-price RANGE.
 *
 * Aaron, live: "there'll be times where I use this when I haven't seen the
 * house — you can put your range down." The range is purely ADDITIVE: a
 * single-price draft (every pre-UX-2a draft) must render byte-identical to
 * today. This spec proves, in pure Node (no browser, no HTTP):
 *
 *   1. The shared helpers (active / valid / midpoint / display) behave.
 *   2. The range round-trips through clampDraft → toPublicPayload and the
 *      raw clampPublicPayload, strictly PAIRED (both sides or neither).
 *   3. REGRESSION: a single-price draft projects with NO range keys — its
 *      serialized payload is byte-identical to the pre-feature shape.
 *   4. The publish gate is satisfied by a single price OR a complete range
 *      (Aaron's "haven't seen the house" case) but not by a half-range.
 *   5. The seller-page hero renders "$low – $high" STATICALLY (no count-up
 *      attrs) for a range, and keeps the count-up path for a single price.
 *   6. The area-chart reflects the range via its MIDPOINT chip (no geometry
 *      change — the line is the frozen fixed reference banner).
 *   7. The prep PDF renders the range; the live-preview sparse-check treats
 *      a range-only draft as "has price" so the preview swaps to the draft.
 *
 * Copy rule: the range separator is an EN-dash (U+2013), never an em-dash.
 */

import {
  priceToInt,
  isPriceRangeActive,
  isPriceRangeValid,
  formatPriceRangeDisplay,
  priceRangeMidpoint,
} from '../src/tools/seller-presentation/engine/price-range';
import {
  clampDraft,
  getMissingRequiredInputs,
  type SellerPresentationDraft,
} from '../src/tools/seller-presentation/engine/types';
import {
  toPublicPayload,
  clampPublicPayload,
  type AgentBranding,
} from '../src/tools/seller-presentation/output/public-payload';
import { Price } from '../src/tools/seller-presentation/output/flagship/Price';
import { AreaChart } from '../src/tools/seller-presentation/output/presentation-page';
import { SellerPresentationPrepPdf } from '../src/tools/seller-presentation/output/prep-pdf';
import { isDraftSparse } from '../src/tools/seller-presentation/components/preview/preview-payload';

const AGENT: AgentBranding = {
  name: 'Aaron Test',
  brokerage: 'Test Realty',
  phone: '2532028825',
  email: 'aaron@example.com',
  licenseNumber: 'WA-12345',
};

const LOW = '$720,000';
const HIGH = '$780,000';
const EM_DASH = '—';
const EN_DASH = '–';

function baseDraft(
  overrides: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft {
  return clampDraft({
    propertyId: 'property_test_id',
    propertyAddress: '1234 Test Drive NE',
    propertyCity: 'Tacoma',
    propertyState: 'WA',
    propertyZip: '98404',
    recommendedPrice: '$685,000',
    comps: [
      {
        address: '5678 Elm Ave NE',
        soldPrice: '$695,000',
        soldDate: '2026-04-15',
        squareFeet: '2,840',
        source: 'manual',
        fieldConfidence: {},
      },
    ],
    ...overrides,
  });
}

// ---- Recursive React tree → text (mirrors the prep-pdf spec helper). ----
function reactTreeToText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactTreeToText).join(' ');
  if (typeof node === 'object' && 'props' in (node as object)) {
    const el = node as React.ReactElement<{ children?: unknown }>;
    if (typeof el.type === 'function') {
      return reactTreeToText((el.type as (p: unknown) => unknown)(el.props));
    }
    return reactTreeToText(el.props?.children);
  }
  return '';
}

// ---- Does any element in the tree carry the given prop/attr key? ----
function treeHasAttr(node: unknown, attr: string): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((n) => treeHasAttr(n, attr));
  if ('props' in (node as object)) {
    const el = node as React.ReactElement<Record<string, unknown>>;
    if (el.props && attr in el.props) return true;
    if (typeof el.type === 'function') {
      return treeHasAttr((el.type as (p: unknown) => unknown)(el.props), attr);
    }
    return treeHasAttr(
      (el.props as { children?: unknown })?.children,
      attr,
    );
  }
  return false;
}

test.describe('UX-2a — recommended-price range helpers', () => {
  test('priceToInt strips a CurrencyInput-formatted string', () => {
    expect(priceToInt('$720,000')).toBe(720000);
    expect(priceToInt('720000')).toBe(720000);
    expect(priceToInt('')).toBeNull();
    expect(priceToInt(undefined)).toBeNull();
    expect(priceToInt('$')).toBeNull();
  });

  test('isPriceRangeActive requires BOTH sides', () => {
    expect(isPriceRangeActive(LOW, HIGH)).toBe(true);
    expect(isPriceRangeActive(LOW, '')).toBe(false);
    expect(isPriceRangeActive('', HIGH)).toBe(false);
    expect(isPriceRangeActive(undefined, undefined)).toBe(false);
    expect(isPriceRangeActive('   ', HIGH)).toBe(false);
  });

  test('isPriceRangeValid: low ≤ high; incomplete is not yet invalid', () => {
    expect(isPriceRangeValid(LOW, HIGH)).toBe(true);
    expect(isPriceRangeValid(HIGH, LOW)).toBe(false); // low > high
    expect(isPriceRangeValid(LOW, LOW)).toBe(true); // equal is fine
    expect(isPriceRangeValid(LOW, '')).toBe(true); // incomplete → not invalid
    expect(isPriceRangeValid('', '')).toBe(true);
  });

  test('formatPriceRangeDisplay joins with an EN-dash, never an em-dash', () => {
    const out = formatPriceRangeDisplay(LOW, HIGH);
    expect(out).toBe(`${LOW} ${EN_DASH} ${HIGH}`);
    expect(out).not.toContain(EM_DASH);
  });

  test('priceRangeMidpoint returns the rounded midpoint as a plain int string', () => {
    expect(priceRangeMidpoint(LOW, HIGH)).toBe('750000');
    expect(priceRangeMidpoint('$700,000', '$705,001')).toBe('702501'); // round
    expect(priceRangeMidpoint(LOW, '')).toBeNull();
  });
});

test.describe('UX-2a — projection + clamp', () => {
  test('a range projects PAIRED into property.recommendedListLow/High', () => {
    const draft = baseDraft({
      recommendedPriceLow: LOW,
      recommendedPriceHigh: HIGH,
    });
    const payload = toPublicPayload(draft, AGENT);
    expect(payload.property.recommendedListLow).toBe(LOW);
    expect(payload.property.recommendedListHigh).toBe(HIGH);
  });

  test('a half-present range does NOT project (no lopsided range)', () => {
    const draft = baseDraft({ recommendedPriceLow: LOW }); // high missing
    const payload = toPublicPayload(draft, AGENT);
    expect(payload.property.recommendedListLow).toBeUndefined();
    expect(payload.property.recommendedListHigh).toBeUndefined();
  });

  test('REGRESSION: single-price payload is byte-identical to the pre-feature shape', () => {
    // A single-price draft must emit NO range keys at all — the serialized
    // property block is exactly what it was before UX-2a.
    const draft = baseDraft();
    const payload = toPublicPayload(draft, AGENT);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('recommendedListLow');
    expect(serialized).not.toContain('recommendedListHigh');
    expect(payload.recommendedPrice).toBe('$685,000');
    expect(payload.property.recommendedList).toBe('$685,000');
    expect('recommendedListLow' in payload.property).toBe(false);
    expect('recommendedListHigh' in payload.property).toBe(false);
  });

  test('clampPublicPayload round-trips a paired range and drops a half-present one', () => {
    const withRange = clampPublicPayload({
      property: {
        address: '1234 Test Drive NE',
        recommendedList: '',
        recommendedListLow: LOW,
        recommendedListHigh: HIGH,
      },
    });
    expect(withRange.property.recommendedListLow).toBe(LOW);
    expect(withRange.property.recommendedListHigh).toBe(HIGH);

    const halfRange = clampPublicPayload({
      property: {
        address: '1234 Test Drive NE',
        recommendedList: '$685,000',
        recommendedListLow: LOW, // high missing → drop both
      },
    });
    expect(halfRange.property.recommendedListLow).toBeUndefined();
    expect(halfRange.property.recommendedListHigh).toBeUndefined();
  });
});

test.describe('UX-2a — publish gate', () => {
  test('a single price satisfies the price requirement (unchanged)', () => {
    const draft = baseDraft({ recommendedPrice: '$685,000' });
    expect(getMissingRequiredInputs(draft)).not.toContain('recommendedPrice');
  });

  test('a complete range satisfies it even with the single field empty', () => {
    const draft = baseDraft({
      recommendedPrice: '',
      recommendedPriceLow: LOW,
      recommendedPriceHigh: HIGH,
    });
    expect(getMissingRequiredInputs(draft)).not.toContain('recommendedPrice');
  });

  test('neither single nor a complete range → price is missing', () => {
    const noPrice = baseDraft({ recommendedPrice: '' });
    expect(getMissingRequiredInputs(noPrice)).toContain('recommendedPrice');

    const halfRange = baseDraft({
      recommendedPrice: '',
      recommendedPriceLow: LOW, // high missing
    });
    expect(getMissingRequiredInputs(halfRange)).toContain('recommendedPrice');
  });
});

test.describe('UX-2a — seller-page hero', () => {
  test('a range renders "$low – $high" STATICALLY (no count-up attrs)', () => {
    const payload = toPublicPayload(
      baseDraft({ recommendedPriceLow: LOW, recommendedPriceHigh: HIGH }),
      AGENT,
    );
    const tree = React.createElement(Price, { payload });
    const text = reactTreeToText(tree);
    expect(text).toContain(LOW);
    expect(text).toContain(HIGH);
    expect(text).toContain(EN_DASH);
    expect(text).not.toContain(EM_DASH);
    // The frozen count-up driver animates a single integer — a range opts out.
    expect(treeHasAttr(tree, 'data-price-countup')).toBe(false);
    expect(treeHasAttr(tree, 'data-price-final')).toBe(false);
  });

  test('a single clean price KEEPS the count-up path (byte-identical behavior)', () => {
    const payload = toPublicPayload(
      baseDraft({ recommendedPrice: '$685,000' }),
      AGENT,
    );
    const tree = React.createElement(Price, { payload });
    expect(treeHasAttr(tree, 'data-price-countup')).toBe(true);
    expect(treeHasAttr(tree, 'data-price-final')).toBe(true);
  });
});

test.describe('UX-2a — area chart + prep PDF + preview', () => {
  test('the chart reflects the range via its midpoint chip (no geometry change)', () => {
    // Midpoint of $720k–$780k is $750k → the chip reads "$750k". The fixed
    // reference line is untouched; only the chip NUMBER carries the value.
    const series = [
      { month: 'Jan', medianPrice: '$700,000' },
      { month: 'Feb', medianPrice: '$710,000' },
      { month: 'Mar', medianPrice: '$720,000' },
    ];
    const midpoint = priceRangeMidpoint(LOW, HIGH)!;
    const tree = React.createElement(AreaChart, { series, recommended: midpoint });
    const text = reactTreeToText(tree);
    expect(text).toContain('$750k');
    expect(text).toContain('Recommended');
  });

  test('the prep PDF renders the range when set, the single price otherwise', () => {
    const rangeTree = React.createElement(SellerPresentationPrepPdf, {
      draft: baseDraft({
        recommendedPrice: '',
        recommendedPriceLow: LOW,
        recommendedPriceHigh: HIGH,
      }),
      agentContact: AGENT,
    });
    // The range copy itself uses an EN-dash. (The PDF contains pre-existing
    // em-dashes elsewhere — the `dash()` empty-field placeholder + the
    // "Private — agent only" header — which are not this feature's copy and
    // live on the private prep doc, not the seller-facing page.)
    const rangeText = reactTreeToText(rangeTree);
    expect(rangeText).toContain(`${LOW} ${EN_DASH} ${HIGH}`);

    const singleTree = React.createElement(SellerPresentationPrepPdf, {
      draft: baseDraft({ recommendedPrice: '$685,000' }),
      agentContact: AGENT,
    });
    expect(reactTreeToText(singleTree)).toContain('$685,000');
  });

  test('the live-preview sparse-check treats a range-only draft as "has price"', () => {
    // A range alone (no address, no comps, no single price) is worth
    // previewing — the panel swaps from the sample to the real draft.
    const rangeOnly = clampDraft({
      comps: [],
      recommendedPriceLow: LOW,
      recommendedPriceHigh: HIGH,
    });
    expect(isDraftSparse(rangeOnly)).toBe(false);
    expect(isDraftSparse(clampDraft({ comps: [] }))).toBe(true);
  });
});
