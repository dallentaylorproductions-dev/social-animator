import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Seller Presentation — publish required-field validation parity.
 *
 * The bug (Dallen, 2026-06-10): a FULLY filled presentation whose
 * recommended price was entered as a low-high RANGE (Aaron's "haven't
 * seen the house, put your range down" case, UX-2a / #43) failed
 * Publish with the opaque "Required fields missing on draft". The
 * client Publish gate (`getMissingRequiredInputs`) accepts a range,
 * but the publish ROUTE hand-rolled its own check that still required
 * the single `recommendedPrice` field — a server/client divergence
 * the range feature introduced and never closed.
 *
 * The fix: the route delegates to the SAME shared validator the client
 * uses (`describeMissingRequiredInputs` → `getMissingRequiredInputs`),
 * and names the missing field instead of an opaque message.
 *
 * This spec proves, in pure Node (no browser, no HTTP):
 *   1. A fully-filled RANGE-ONLY draft (reconstructing Dallen's bug)
 *      has NO missing required inputs — i.e. it publishes.
 *   2. A genuinely-missing required field still blocks AND is NAMED.
 *   3. The publish route source delegates to the shared validator and
 *      does NOT re-introduce a divergent `recommendedPrice`-only check.
 */

import {
  clampDraft,
  getMissingRequiredInputs,
  describeMissingRequiredInputs,
  REQUIRED_INPUT_LABELS,
  type SellerPresentationDraft,
} from '../src/tools/seller-presentation/engine/types';

const EM_DASH = '—';

// Dallen's bug draft: everything present, price as a RANGE (single
// recommendedPrice intentionally empty), five comps. The shape the
// publish route receives after a full wizard fill.
function fullyFilledRangeDraft(): SellerPresentationDraft {
  return clampDraft({
    propertyId: 'property_smoke_test',
    propertyAddress: '1234 Phase B2 Smoke Test Drive',
    propertyCity: 'Tacoma',
    propertyState: 'WA',
    propertyZip: '98404',
    // Price entered as a RANGE only — no single recommendedPrice.
    recommendedPrice: '',
    recommendedPriceLow: '$724,753',
    recommendedPriceHigh: '$740,320',
    priceRationale: 'Priced to the live comp set and current demand.',
    pricingStrategyId: 'market-aligned',
    confidence: 'medium',
    comps: [
      { address: '11 Alder Ct NE', soldPrice: '$728,000', source: 'manual' },
      { address: '22 Birch Ln NE', soldPrice: '$735,500', source: 'manual' },
      { address: '33 Cedar Way NE', soldPrice: '$719,900', source: 'manual' },
      { address: '44 Dogwood Dr NE', soldPrice: '$742,000', source: 'manual' },
      { address: '55 Elm Pl NE', soldPrice: '$731,250', source: 'manual' },
    ],
    pitchPoints: [
      { id: 'pp1', title: 'Walk to the waterfront', visibility: 'public' },
      { id: 'pp2', title: 'Updated kitchen', visibility: 'public' },
      { id: 'pp3', title: 'Quiet cul-de-sac', visibility: 'public' },
    ],
    preparedFor: 'the Taylor family',
  } as Parameters<typeof clampDraft>[0]);
}

test.describe('Seller Presentation — publish required-field parity', () => {
  test('a fully-filled RANGE-ONLY draft has no missing required inputs (publishes)', () => {
    const draft = fullyFilledRangeDraft();
    // The range satisfies the price requirement even though the single
    // recommendedPrice field is empty — this is exactly the draft that
    // used to fail publish.
    expect(getMissingRequiredInputs(draft)).toEqual([]);
    expect(describeMissingRequiredInputs(draft)).toEqual([]);
  });

  test('a genuinely-missing required field still blocks AND is named', () => {
    const noAddress = clampDraft({
      ...fullyFilledRangeDraft(),
      propertyAddress: '',
    } as Parameters<typeof clampDraft>[0]);
    expect(getMissingRequiredInputs(noAddress)).toContain('propertyAddress');
    const described = describeMissingRequiredInputs(noAddress);
    expect(described).toContain(REQUIRED_INPUT_LABELS.propertyAddress);
    // The named field flows into the publish route's client-visible error.
    expect(`Missing required: ${described.join(', ')}`).toContain(
      'property address',
    );

    const noComps = clampDraft({
      ...fullyFilledRangeDraft(),
      comps: [],
    } as Parameters<typeof clampDraft>[0]);
    expect(describeMissingRequiredInputs(noComps)).toContain(
      REQUIRED_INPUT_LABELS.comps,
    );

    // No em-dash leaks into the named labels (LS-1 truthful-copy gate).
    for (const label of Object.values(REQUIRED_INPUT_LABELS)) {
      expect(label).not.toContain(EM_DASH);
    }
  });

  test('the publish route delegates to the shared validator (no divergent check)', async () => {
    const src = await readFile(
      path.join(
        process.cwd(),
        'src/app/api/seller-presentation/publish/route.ts',
      ),
      'utf8',
    );
    // It must call the shared validator...
    expect(src).toContain('describeMissingRequiredInputs');
    // ...and must NOT hand-roll a single-price-only check that would
    // reject a range draft again.
    expect(src).not.toContain('!draft.recommendedPrice?.trim()');
    // ...and the opaque message is gone in favor of a named one.
    expect(src).not.toContain('Required fields missing on draft');
    expect(src).toContain('Missing required:');
  });
});
