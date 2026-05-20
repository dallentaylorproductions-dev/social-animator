import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — public-payload allowlist proof (v1.47 / A6).
 *
 * The privacy boundary made code. The publish route at
 * src/app/api/seller-presentation/publish/route.ts calls
 * `toPublicPayload(draft, agentContact)` and passes ONLY the result
 * to `publishHandout`. This spec asserts that no private field —
 * named explicitly in the audit §6 table — survives that
 * serialization, by constructing a maximally-populated draft with
 * SENTINEL strings in every private slot and checking that
 * `JSON.stringify(toPublicPayload(...))` contains none of them.
 *
 * Why sentinel strings: stringifying the payload and `expect.not.toContain`
 * against a literal value is the loudest possible assertion. If a
 * future serializer edit accidentally allowed a private key through,
 * the sentinel makes the leak unmissable.
 *
 * Pure-Node test — no browser, no HTTP, no localStorage shim needed.
 * Follows the static-import convention from
 * e2e/lib-data-primitives.spec.ts (Playwright transpiles static
 * .ts imports; dynamic `await import('.ts')` falls through to Node's
 * raw loader and fails).
 *
 * This spec is INTENTIONALLY independent of the wire format (no fetch,
 * no /h/[slug] render). The privacy proof must NOT depend on a route
 * being deployed; it tests the function that closes R-1 directly.
 */

import {
  toPublicPayload,
  type AgentBranding,
} from '../src/tools/seller-presentation/output/public-payload';
import type { SellerPresentationDraft } from '../src/tools/seller-presentation/engine/types';

// Sentinel values — guaranteed unique substrings that should NEVER
// appear in the JSON-stringified public payload.
const S = {
  pricingStrategyId: 'PRIVATE_SENTINEL_STRATEGY_ID',
  confidence: 'high' as const, // (the enum value; tested separately)
  preAppointmentNotes: 'PRIVATE_SENTINEL_PREAPPT_NOTES',
  commitment: 'PRIVATE_SENTINEL_COMMITMENT_TEXT',
  ask: 'PRIVATE_SENTINEL_ASK_TEXT',
  compNotes: 'PRIVATE_SENTINEL_COMP_NOTES',
  compSource: 'screenshot-ai' as const, // (the enum value; tested separately)
  compFieldConfidenceLevel: 'low' as const,
  privatePitchPoint: 'PRIVATE_SENTINEL_PITCH_PRIVATE',
  publicPitchPoint: 'PUBLIC_SENTINEL_PITCH_PUBLIC',
  themeId: 'PRIVATE_SENTINEL_THEME_ID',
  clientId: 'PRIVATE_SENTINEL_CLIENT_ID',
};

function maxedDraft(): SellerPresentationDraft {
  return {
    // ---- Public-safe fields (these SHOULD survive) ----
    propertyId: 'property_test_id',
    propertyAddress: '1234 Test Drive NE',
    propertyCity: 'Tacoma, WA',
    recommendedPrice: '$685,000',
    priceRationale:
      'Priced 2% under market median to drive multiple offers in the first 10 days.',

    // ---- Private fields (these MUST NOT appear) ----
    pricingStrategyId: S.pricingStrategyId,
    confidence: S.confidence,
    preAppointmentNotes: S.preAppointmentNotes,
    commitments: [S.commitment, `${S.commitment}-second`],
    asks: [S.ask],
    themeId: S.themeId,
    clientId: S.clientId,

    // ---- Comps: public per-comp fields SHOULD survive; per-comp
    //       notes/source/fieldConfidence MUST NOT ----
    comps: [
      {
        address: '5678 Elm Ave NE',
        soldPrice: '$695,000',
        daysOnMarket: '11',
        saleToListPercent: '98%',
        squareFeet: '2,840',
        distanceMiles: '0.4',
        soldDate: '2026-04-15',
        notes: S.compNotes,
        source: S.compSource,
        fieldConfidence: {
          address: S.compFieldConfidenceLevel,
          soldPrice: S.compFieldConfidenceLevel,
        },
      },
      {
        address: '9012 Oak Pl NE',
        soldPrice: '$680,000',
        notes: `${S.compNotes}-second`,
        source: 'manual',
      },
    ],

    // ---- Pitch points: 'public' SHOULD survive, 'private' MUST NOT ----
    pitchPoints: [
      {
        id: 'pp_1',
        text: S.publicPitchPoint,
        visibility: 'public',
      },
      {
        id: 'pp_2',
        text: S.privatePitchPoint,
        visibility: 'private',
      },
    ],
  };
}

const FIXTURE_AGENT_CONTACT: AgentBranding = {
  name: 'Aaron Test',
  brokerage: 'Test Realty',
  phone: '2532028825',
  email: 'aaron@example.com',
  licenseNumber: 'WA-12345',
};

test.describe('toPublicPayload — privacy allowlist (R-1 proof)', () => {
  test('public fields survive verbatim', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);

    expect(payload.propertyAddress).toBe('1234 Test Drive NE');
    expect(payload.propertyCity).toBe('Tacoma, WA');
    expect(payload.recommendedPrice).toBe('$685,000');
    expect(payload.priceRationale).toContain('drive multiple offers');

    // agentBranding is the projected subset.
    expect(payload.agentBranding.name).toBe('Aaron Test');
    expect(payload.agentBranding.brokerage).toBe('Test Realty');
    expect(payload.agentBranding.phone).toBe('2532028825');
    expect(payload.agentBranding.email).toBe('aaron@example.com');
    expect(payload.agentBranding.licenseNumber).toBe('WA-12345');

    // Comps: public per-comp fields preserved.
    expect(payload.comps).toHaveLength(2);
    expect(payload.comps[0].address).toBe('5678 Elm Ave NE');
    expect(payload.comps[0].soldPrice).toBe('$695,000');
    expect(payload.comps[0].daysOnMarket).toBe('11');
    expect(payload.comps[0].saleToListPercent).toBe('98%');

    // Public pitch points preserved verbatim.
    expect(payload.pitchPublicPoints).toEqual([S.publicPitchPoint]);
  });

  test('NO private TOP-LEVEL field appears in the JSON-stringified payload', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    // Sentinel value strings — these are the unambiguous leak signals.
    for (const forbiddenSentinel of [
      S.pricingStrategyId,
      S.preAppointmentNotes,
      S.commitment,
      S.ask,
      S.themeId,
      S.clientId,
      S.privatePitchPoint,
    ]) {
      expect(serialized).not.toContain(forbiddenSentinel);
    }

    // Key names — defense against a future regression that allowed a
    // private FIELD NAME through with a different value. JSON.stringify
    // emits keys as `"keyName":`, so we search for that pattern.
    for (const forbiddenKey of [
      'pricingStrategyId',
      'confidence',
      'preAppointmentNotes',
      'commitments',
      'asks',
      'themeId',
      'clientId',
      'pitchPoints', // the RAW pitch-points array — the public projection is `pitchPublicPoints`
    ]) {
      expect(serialized).not.toContain(`"${forbiddenKey}":`);
    }
  });

  test('NO private PER-COMP field appears in any comp', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    // Sentinel comp-notes content (both comps in the fixture).
    expect(serialized).not.toContain(S.compNotes);
    // Sentinel source enum value — present on comp[0] only.
    expect(serialized).not.toContain(S.compSource);
    // Sentinel fieldConfidence level — present in comp[0].fieldConfidence.
    // ('low' is short + common, so we check for the field-name key instead.)
    for (const forbiddenKey of ['notes', 'source', 'fieldConfidence']) {
      expect(serialized).not.toContain(`"${forbiddenKey}":`);
    }
  });

  test('the private pitch point cannot be derived from any payload field', () => {
    // Belt-and-suspenders: the public projection of pitchPoints is
    // `pitchPublicPoints` (a string[] of TEXT only). The private
    // point's TEXT also must not leak via any other field — e.g., a
    // future bug where someone joined all pitch-point texts into a
    // summary line. The sentinel makes any such leak unmissable.
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(S.privatePitchPoint);
    expect(payload.pitchPublicPoints).not.toContain(S.privatePitchPoint);
  });

  test('an empty / minimal draft serializes to safe defaults', () => {
    const minimal: SellerPresentationDraft = {
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
    };
    const payload = toPublicPayload(minimal, {});

    expect(payload.propertyAddress).toBe('');
    expect(payload.recommendedPrice).toBe('');
    expect(payload.comps).toEqual([]);
    expect(payload.pitchPublicPoints).toEqual([]);
    expect(payload.agentBranding).toEqual({
      name: undefined,
      brokerage: undefined,
      phone: undefined,
      email: undefined,
      licenseNumber: undefined,
    });
  });
});
