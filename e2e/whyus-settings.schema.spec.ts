import { test, expect } from '@playwright/test';

/**
 * B0a — "Why us" agent-constant schema proof.
 *
 * `clampWhyUs` IS the persistence boundary: `loadBrandSettings` folds it over
 * the parsed localStorage record. This spec exercises the clamp directly
 * (pure Node — no browser, no localStorage needed) to prove the round-trip
 * contract: shape coercion, reorder preservation, soft-cap hard-clamp, the
 * arrives-done defaults, and the "fully-empty rows drop / pre-labeled blank
 * rows survive" rule the form depends on.
 */

import {
  clampWhyUs,
  defaultWhyUs,
  WHYUS_CAPS,
  type WhyUs,
} from '../src/lib/whyus';

// Serialize → parse → clamp, exactly as loadBrandSettings does.
function roundTrip(w: WhyUs): WhyUs | undefined {
  return clampWhyUs(JSON.parse(JSON.stringify(w)));
}

test.describe('whyUs — arrives-done defaults', () => {
  test('ships example prose and pre-labeled, blank-numbered stat rows', () => {
    const d = defaultWhyUs();
    expect(d.differentiators.length).toBeGreaterThanOrEqual(2);
    expect(d.marketingApproach.length).toBeGreaterThanOrEqual(3);
    expect(d.howWeWork.length).toBe(5);

    // Five canonical stat rows, pre-labeled, with BLANK numbers (agent fills).
    const labels = d.performanceStats.map((s) => s.label);
    expect(labels).toEqual([
      'Average sale-to-list',
      'Average days on market',
      'Average listing views',
      'Homes sold (last 12 months)',
      'Total reviews',
    ]);
    for (const stat of d.performanceStats) {
      expect(stat.yourValue).toBe('');
    }
    // The "%" row carries the unit that drives PercentInput selection.
    expect(d.performanceStats[0].unit).toBe('%');
  });

  test('defaults round-trip through clampWhyUs unchanged', () => {
    const d = defaultWhyUs();
    expect(roundTrip(d)).toEqual(d);
  });
});

test.describe('whyUs — clamp + round-trip', () => {
  test('preserves order on reorder', () => {
    const w: WhyUs = {
      differentiators: ['first', 'second', 'third'],
      marketingApproach: [],
      performanceStats: [],
      howWeWork: [],
    };
    // Simulate a user moving "third" to the front.
    const reordered: WhyUs = { ...w, differentiators: ['third', 'first', 'second'] };
    expect(roundTrip(reordered)?.differentiators).toEqual([
      'third',
      'first',
      'second',
    ]);
  });

  test('hard-clamps every list to its soft cap', () => {
    const big = (n: number) => Array.from({ length: n }, (_, i) => `row ${i}`);
    const w: WhyUs = {
      differentiators: big(20),
      marketingApproach: big(20).map((t) => ({ title: t })),
      performanceStats: big(20).map((l) => ({ label: l, yourValue: '1' })),
      howWeWork: big(20).map((s) => ({ step: s })),
    };
    const out = roundTrip(w)!;
    expect(out.differentiators).toHaveLength(WHYUS_CAPS.differentiators);
    expect(out.marketingApproach).toHaveLength(WHYUS_CAPS.marketingApproach);
    expect(out.performanceStats).toHaveLength(WHYUS_CAPS.performanceStats);
    expect(out.howWeWork).toHaveLength(WHYUS_CAPS.howWeWork);
  });

  test('drops fully-empty rows but keeps pre-labeled blank-number stat rows', () => {
    const w: WhyUs = {
      differentiators: ['kept', '', '   '],
      marketingApproach: [{ title: '', detail: '' }, { title: 'kept point' }],
      // A pre-labeled row the agent never filled: label present, value blank.
      performanceStats: [
        { label: 'Average days on market', yourValue: '' },
        { label: '', yourValue: '' },
      ],
      howWeWork: [{ step: '', detail: '' }],
    };
    const out = roundTrip(w)!;
    expect(out.differentiators).toEqual(['kept']);
    expect(out.marketingApproach).toEqual([{ title: 'kept point' }]);
    // The blank-numbered but labeled row SURVIVES (arrives-done skeleton);
    // the label-less row is dropped.
    expect(out.performanceStats).toEqual([
      { label: 'Average days on market', yourValue: '' },
    ]);
    expect(out.howWeWork).toEqual([]);
  });

  test('coerces optional sub-fields and preserves unit + marketValue', () => {
    const w = {
      differentiators: [],
      marketingApproach: [],
      performanceStats: [
        { label: 'Average sale-to-list', yourValue: '98.2%', marketValue: '96%', unit: '%' },
      ],
      howWeWork: [],
      guarantee: 'cancel anytime',
    } as WhyUs;
    const out = roundTrip(w)!;
    expect(out.performanceStats[0]).toEqual({
      label: 'Average sale-to-list',
      yourValue: '98.2%',
      marketValue: '96%',
      unit: '%',
    });
    expect(out.guarantee).toBe('cancel anytime');
  });

  test('garbage / empty records collapse to undefined', () => {
    expect(clampWhyUs(undefined)).toBeUndefined();
    expect(clampWhyUs(null)).toBeUndefined();
    expect(clampWhyUs('nope')).toBeUndefined();
    expect(clampWhyUs(42)).toBeUndefined();
    expect(
      clampWhyUs({
        differentiators: [],
        marketingApproach: [],
        performanceStats: [],
        howWeWork: [],
      }),
    ).toBeUndefined();
  });
});
