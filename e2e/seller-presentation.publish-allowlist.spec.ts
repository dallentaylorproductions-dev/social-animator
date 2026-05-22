import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — public-payload allowlist proof (v1.47 / A6 + A7a).
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
 * A7a extension: the locked-design surface area added new public-safe
 * fields (preparedFor, agentNote, video, trackRecord, reviews,
 * reviewsOutlink, areaStats, buyerQuote, pitchPublicCards, grouped
 * property/whyPrice/agent), trimmed comps to a 4-key set, and changed
 * pitch points to {title, support}. The privacy invariants stay
 * identical; what changed are the MINIMIZATION assertions:
 *   - every emitted comp's keys are a subset of {address, soldPrice,
 *     soldDate, sqft};
 *   - the agent block contains no key outside the public agent
 *     allowlist;
 *   - each optional block (video / trackRecord / reviews /
 *     reviewsOutlink / areaStats / buyerQuote / preparedFor /
 *     agentNote) is OMITTED from the JSON when unset, not partially
 *     emitted.
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
  // ---- A6 sentinels (existing private fields) ----
  pricingStrategyId: 'PRIVATE_SENTINEL_STRATEGY_ID',
  confidence: 'high' as const,
  preAppointmentNotes: 'PRIVATE_SENTINEL_PREAPPT_NOTES',
  commitment: 'PRIVATE_SENTINEL_COMMITMENT_TEXT',
  ask: 'PRIVATE_SENTINEL_ASK_TEXT',
  compNotes: 'PRIVATE_SENTINEL_COMP_NOTES',
  compSource: 'screenshot-ai' as const,
  compFieldConfidenceLevel: 'low' as const,
  privatePitchPoint: 'PRIVATE_SENTINEL_PITCH_PRIVATE',
  publicPitchPoint: 'PUBLIC_SENTINEL_PITCH_PUBLIC',
  themeId: 'PRIVATE_SENTINEL_THEME_ID',
  clientId: 'PRIVATE_SENTINEL_CLIENT_ID',

  // ---- A7a public-safe sentinels (positive round-trip checks) ----
  preparedFor: 'the PUBLIC_SENTINEL_FAMILY family',
  agentNote: 'PUBLIC_SENTINEL_AGENT_NOTE_BODY',
  editorialPhotoUrl: 'https://example.com/PUBLIC_SENTINEL_EDITORIAL.jpg',
  propertyState: 'WA',
  propertyZip: '98404',
  heroPhotoUrl: 'data:image/png;base64,PUBLIC_SENTINEL_HERO',
  videoPoster: 'https://example.com/PUBLIC_SENTINEL_POSTER.jpg',
  videoUrl: 'https://example.com/PUBLIC_SENTINEL_VIDEO.mp4',
  videoTitle: 'PUBLIC_SENTINEL_VIDEO_TITLE',
  videoRuntime: '2:14',
  videoRecordedOn: '2026-05-12',
  trackFigureValue: 'PUBLIC_SENTINEL_FIG_VALUE',
  trackTestimonialBody: 'PUBLIC_SENTINEL_TESTIMONIAL_BODY',
  reviewBody: 'PUBLIC_SENTINEL_REVIEW_BODY',
  reviewsOutlinkUrl: 'https://example.com/PUBLIC_SENTINEL_OUTLINK',
  areaStatsMedianSale: 'PUBLIC_SENTINEL_MEDIAN_SALE',
  areaStatsMonth: 'PUBLIC_SENTINEL_MONTH',
  buyerQuoteBody: 'PUBLIC_SENTINEL_BUYER_QUOTE',
  pitchCardTitle: 'PUBLIC_SENTINEL_CARD_TITLE',
  pitchCardSupport: 'PUBLIC_SENTINEL_CARD_SUPPORT',
  agentAreasServed: 'PUBLIC_SENTINEL_AREAS_SERVED',
  agentPhotoUrl: 'data:image/png;base64,PUBLIC_SENTINEL_AGENT_PHOTO',
  agentBioShort: 'PUBLIC_SENTINEL_AGENT_BIO',
  agentYearsInArea: 'PUBLIC_SENTINEL_YEARS',
  agentCtaReassurance: 'PUBLIC_SENTINEL_CTA_REASSURANCE',

  // ---- A7a forbidden-key sentinels (private fields that don't yet
  // exist on the draft type but MUST never appear in payload if
  // someone adds them in the future) ----
  negotiationNotes: 'PRIVATE_SENTINEL_NEGOTIATION_NOTES',
  teamOnlyStat: 'PRIVATE_SENTINEL_TEAM_ONLY_STAT',
};

const ALLOWED_COMP_KEYS = new Set([
  'address',
  'soldPrice',
  'soldDate',
  'sqft',
]);

const ALLOWED_AGENT_KEYS = new Set([
  'name',
  'brokerage',
  'phone',
  'email',
  'licenseNumber',
  'areasServed',
  'photoUrl',
  'bioShort',
  'yearsInArea',
  'ctaReassurance',
]);

function maxedDraft(): SellerPresentationDraft {
  return {
    // ---- Public-safe fields (these SHOULD survive) ----
    propertyId: 'property_test_id',
    propertyAddress: '1234 Test Drive NE',
    propertyCity: 'Tacoma',
    propertyState: S.propertyState,
    propertyZip: S.propertyZip,
    heroPhotoUrl: S.heroPhotoUrl,
    recommendedPrice: '$685,000',
    priceRationale:
      'Priced 2% under market median to drive multiple offers in the first 10 days.',

    preparedFor: S.preparedFor,
    agentNote: S.agentNote,
    editorialPhotoUrl: S.editorialPhotoUrl,
    video: {
      posterUrl: S.videoPoster,
      videoUrl: S.videoUrl,
      title: S.videoTitle,
      runtime: S.videoRuntime,
      recordedOn: S.videoRecordedOn,
    },
    trackRecord: {
      figures: [
        { label: 'Homes sold', value: S.trackFigureValue, ctx: 'last 24 months' },
        { label: 'Avg days', value: '11' },
      ],
      testimonial: {
        body: S.trackTestimonialBody,
        attributionShort: 'M.S.',
        areaOrYear: 'Tacoma, 2025',
      },
    },
    reviews: [
      {
        body: S.reviewBody,
        attributionName: 'A. Customer',
        attributionYear: '2025',
        attributionStreet: 'NE 17th',
      },
    ],
    reviewsOutlink: {
      label: 'See all reviews on Zillow →',
      url: S.reviewsOutlinkUrl,
    },
    areaStats: {
      medianSale: S.areaStatsMedianSale,
      medianSaleDeltaYoy: '+4.2%',
      daysOnMarket: '11',
      daysOnMarketZipAvg: '14',
      closings90d: '37',
      listToSaleRatio: '98%',
      monthlySeries: [
        { month: S.areaStatsMonth, medianPrice: '$682,000' },
        { month: 'Apr', medianPrice: '$675,000' },
      ],
    },
    buyerQuote: { body: S.buyerQuoteBody, source: 'A buyer who toured' },
    agentAreasServed: S.agentAreasServed,
    agentPhotoUrl: S.agentPhotoUrl,
    agentBioShort: S.agentBioShort,
    agentYearsInArea: S.agentYearsInArea,
    agentCtaReassurance: S.agentCtaReassurance,

    // ---- Private fields (these MUST NOT appear) ----
    pricingStrategyId: S.pricingStrategyId,
    confidence: S.confidence,
    preAppointmentNotes: S.preAppointmentNotes,
    commitments: [S.commitment, `${S.commitment}-second`],
    asks: [S.ask],
    themeId: S.themeId,
    clientId: S.clientId,

    // ---- Comps: public per-comp fields SHOULD survive; per-comp
    //       notes/source/fieldConfidence MUST NOT. A7a's emit set is
    //       {address, soldPrice, soldDate, sqft} only — the other
    //       previously-public per-comp keys (daysOnMarket /
    //       saleToListPercent / distanceMiles) are NO LONGER emitted.
    comps: [
      {
        address: '5678 Elm Ave NE',
        soldPrice: '$695,000',
        daysOnMarket: '11',
        saleToListPercent: '98%',
        squareFeet: '2,840', // draft uses `squareFeet`; emitted as `sqft`
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

    // ---- Pitch points: 'public' SHOULD survive (as {title, support}
    //       cards AND as title-only strings in pitchPublicPoints);
    //       'private' MUST NOT appear in either projection. ----
    pitchPoints: [
      {
        id: 'pp_1',
        title: S.pitchCardTitle,
        support: S.pitchCardSupport,
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
  test('public fields survive verbatim (A6 flat + A7a grouped)', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);

    // ---- A6 flat fields (unchanged) ----
    expect(payload.propertyAddress).toBe('1234 Test Drive NE');
    expect(payload.propertyCity).toBe('Tacoma');
    expect(payload.recommendedPrice).toBe('$685,000');
    expect(payload.priceRationale).toContain('drive multiple offers');

    expect(payload.agentBranding.name).toBe('Aaron Test');
    expect(payload.agentBranding.brokerage).toBe('Test Realty');
    expect(payload.agentBranding.phone).toBe('2532028825');
    expect(payload.agentBranding.email).toBe('aaron@example.com');
    expect(payload.agentBranding.licenseNumber).toBe('WA-12345');

    expect(payload.comps).toHaveLength(2);
    expect(payload.comps[0].address).toBe('5678 Elm Ave NE');
    expect(payload.comps[0].soldPrice).toBe('$695,000');

    // Public pitch points (title-only string array — A6 renderer shape).
    expect(payload.pitchPublicPoints).toEqual([S.pitchCardTitle]);

    // ---- A7a grouped fields (locked design) ----
    expect(payload.property.address).toBe('1234 Test Drive NE');
    expect(payload.property.city).toBe('Tacoma');
    expect(payload.property.state).toBe(S.propertyState);
    expect(payload.property.zip).toBe(S.propertyZip);
    expect(payload.property.heroPhotoUrl).toBe(S.heroPhotoUrl);
    expect(payload.property.recommendedList).toBe('$685,000');
    expect(payload.property.rationaleShort).toContain('drive multiple offers');

    expect(payload.preparedFor).toBe(S.preparedFor);
    expect(payload.agentNote).toBe(S.agentNote);
    expect(payload.editorialPhotoUrl).toBe(S.editorialPhotoUrl);

    expect(payload.video).toBeDefined();
    expect(payload.video?.videoUrl).toBe(S.videoUrl);
    expect(payload.video?.title).toBe(S.videoTitle);
    expect(payload.video?.runtime).toBe(S.videoRuntime);

    expect(payload.whyPrice.publicRationale).toContain('drive multiple offers');
    expect(payload.whyPrice.comps).toHaveLength(2);

    expect(payload.pitchPublicCards).toEqual([
      { title: S.pitchCardTitle, support: S.pitchCardSupport },
    ]);

    expect(payload.trackRecord?.figures).toHaveLength(2);
    expect(payload.trackRecord?.figures?.[0].value).toBe(S.trackFigureValue);
    expect(payload.trackRecord?.testimonial?.body).toBe(S.trackTestimonialBody);

    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews?.[0].body).toBe(S.reviewBody);
    expect(payload.reviewsOutlink?.url).toBe(S.reviewsOutlinkUrl);

    expect(payload.areaStats?.medianSale).toBe(S.areaStatsMedianSale);
    expect(payload.areaStats?.monthlySeries).toHaveLength(2);
    expect(payload.areaStats?.monthlySeries?.[0].month).toBe(S.areaStatsMonth);

    expect(payload.buyerQuote?.body).toBe(S.buyerQuoteBody);

    expect(payload.agent.name).toBe('Aaron Test');
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
      // A7a additions — keys that don't exist on the draft today but
      // would leak silently if a future commit added them without
      // updating the serializer. The sentinel makes the regression
      // immediate.
      S.negotiationNotes,
      S.teamOnlyStat,
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
      'pitchPoints', // raw pitch-points array — public projections are pitchPublicPoints + pitchPublicCards
      // A7a — these keys don't exist on the draft yet but would be
      // private if added; assertion is the early-warning system.
      'negotiationNotes',
      'teamOnlyStats',
    ]) {
      expect(serialized).not.toContain(`"${forbiddenKey}":`);
    }
  });

  test('NO private PER-COMP field appears in any comp', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);

    // Sentinel comp-notes content (both comps in the fixture) — full
    // payload string match is fine here because compNotes / compSource
    // are unique sentinels.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(S.compNotes);
    expect(serialized).not.toContain(S.compSource);

    // Per-comp KEY check — scoped to the comps subtrees only.
    // A whole-payload substring match on `"source":` would incorrectly
    // trip on BuyerQuote.source (a legitimate public field). Walking
    // the comp arrays directly is precise.
    const json = JSON.parse(serialized) as {
      comps: Record<string, unknown>[];
      whyPrice: { comps: Record<string, unknown>[] };
    };
    for (const compSet of [json.comps, json.whyPrice.comps]) {
      for (const comp of compSet) {
        for (const forbiddenKey of [
          'notes',
          'source',
          'fieldConfidence',
        ]) {
          expect(
            Object.prototype.hasOwnProperty.call(comp, forbiddenKey),
            `comp leaked forbidden key "${forbiddenKey}"`,
          ).toBe(false);
        }
      }
    }
  });

  test('A7a — every emitted comp has keys subset of {address, soldPrice, soldDate, sqft}', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    // JSON round-trip so Object.keys reflects ONLY the keys that
    // actually serialize (undefined values are dropped).
    const json = JSON.parse(JSON.stringify(payload)) as {
      comps: Record<string, unknown>[];
      whyPrice: { comps: Record<string, unknown>[] };
    };

    // Flat top-level comps[] AND nested whyPrice.comps[] — same shape.
    for (const compSet of [json.comps, json.whyPrice.comps]) {
      for (const comp of compSet) {
        for (const key of Object.keys(comp)) {
          expect(
            ALLOWED_COMP_KEYS.has(key),
            `unexpected comp key "${key}" outside allowlist`,
          ).toBe(true);
        }
        // Must always have at least the two required keys.
        expect(comp.address).toBeDefined();
        expect(comp.soldPrice).toBeDefined();
      }
    }

    // Sqft is the renamed projection of draft.squareFeet — comp[0] had
    // squareFeet:'2,840', should emit as sqft:'2,840'.
    expect(payload.comps[0].sqft).toBe('2,840');
    // soldDate from comp[0] survives.
    expect(payload.comps[0].soldDate).toBe('2026-04-15');
  });

  test('A7a — agent block emits no key outside the public agent allowlist', () => {
    const draft = maxedDraft();
    // Pass an agentContact with a rogue key — the serializer's explicit
    // field-by-field projection must drop it.
    const rougeAgentContact = {
      ...FIXTURE_AGENT_CONTACT,
      areasServed: S.agentAreasServed,
      photoUrl: S.agentPhotoUrl,
      bioShort: S.agentBioShort,
      yearsInArea: S.agentYearsInArea,
      ctaReassurance: S.agentCtaReassurance,
      // Rogue private fields that should NOT round-trip.
      negotiationNotes: S.negotiationNotes,
      teamOnlyStat: S.teamOnlyStat,
    } as AgentBranding & Record<string, unknown>;
    const payload = toPublicPayload(draft, rougeAgentContact);
    const json = JSON.parse(JSON.stringify(payload)) as {
      agent: Record<string, unknown>;
      agentBranding: Record<string, unknown>;
    };

    for (const agentObj of [json.agent, json.agentBranding]) {
      for (const key of Object.keys(agentObj)) {
        expect(
          ALLOWED_AGENT_KEYS.has(key),
          `unexpected agent key "${key}" outside allowlist`,
        ).toBe(true);
      }
    }

    // Positive: each public agent extension round-trips.
    expect(payload.agent.areasServed).toBe(S.agentAreasServed);
    expect(payload.agent.photoUrl).toBe(S.agentPhotoUrl);
    expect(payload.agent.bioShort).toBe(S.agentBioShort);
    expect(payload.agent.yearsInArea).toBe(S.agentYearsInArea);
    expect(payload.agent.ctaReassurance).toBe(S.agentCtaReassurance);
  });

  test('A7a — trackRecord carries no teamOnlyStats / negotiation fields', () => {
    // Try to smuggle a private-named field through trackRecord by
    // passing a rogue figure with an unexpected key. The serializer's
    // explicit `{label, value, ctx}` projection drops it.
    const draft = maxedDraft();
    const tampered = {
      ...draft,
      trackRecord: {
        figures: [
          {
            label: 'Homes sold',
            value: S.trackFigureValue,
            ctx: 'last 24 months',
            // @ts-expect-error — deliberately rogue to verify projection drops it.
            negotiationNotes: S.negotiationNotes,
            // @ts-expect-error — deliberately rogue.
            teamOnlyStat: S.teamOnlyStat,
          },
        ],
        testimonial: {
          body: S.trackTestimonialBody,
          attributionShort: 'M.S.',
        },
      },
    } as SellerPresentationDraft;

    const payload = toPublicPayload(tampered, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(S.negotiationNotes);
    expect(serialized).not.toContain(S.teamOnlyStat);
    expect(serialized).not.toContain('"negotiationNotes":');
    expect(serialized).not.toContain('"teamOnlyStat":');
  });

  test('the private pitch point cannot be derived from any payload field', () => {
    // Belt-and-suspenders: the public projection of pitchPoints is
    // `pitchPublicPoints` (a string[] of TITLEs only) plus the
    // `pitchPublicCards` ({title, support}[]). The private point's
    // TEXT must not leak via any other field — e.g., a future bug
    // where someone joined all pitch-point texts into a summary line.
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(S.privatePitchPoint);
    expect(payload.pitchPublicPoints).not.toContain(S.privatePitchPoint);
    for (const card of payload.pitchPublicCards) {
      expect(card.title).not.toContain(S.privatePitchPoint);
      expect(card.support).not.toContain(S.privatePitchPoint);
    }
  });

  test('A7a — optional blocks OMIT cleanly when unset (no half-populated object)', () => {
    // Minimal draft — none of the A7a optional blocks set. Serializer
    // must emit `undefined` (which JSON.stringify drops) for each
    // optional block, never a `{}` or partial.
    const minimal: SellerPresentationDraft = {
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
    };
    const payload = toPublicPayload(minimal, {});
    const serialized = JSON.stringify(payload);

    // Top-level optional blocks: each must be absent from the JSON.
    for (const optionalKey of [
      'video',
      'trackRecord',
      'reviews',
      'reviewsOutlink',
      'areaStats',
      'buyerQuote',
      'preparedFor',
      'agentNote',
      'editorialPhotoUrl',
    ]) {
      expect(serialized).not.toContain(`"${optionalKey}":`);
    }

    // Each TS-typed access returns undefined (no partial object).
    expect(payload.video).toBeUndefined();
    expect(payload.trackRecord).toBeUndefined();
    expect(payload.reviews).toBeUndefined();
    expect(payload.reviewsOutlink).toBeUndefined();
    expect(payload.areaStats).toBeUndefined();
    expect(payload.buyerQuote).toBeUndefined();
    expect(payload.preparedFor).toBeUndefined();
    expect(payload.agentNote).toBeUndefined();
    expect(payload.editorialPhotoUrl).toBeUndefined();

    // Required grouped blocks still emit with sane defaults.
    expect(payload.property.address).toBe('');
    expect(payload.property.recommendedList).toBe('');
    expect(payload.whyPrice.publicRationale).toBe('');
    expect(payload.whyPrice.comps).toEqual([]);
    expect(payload.pitchPublicCards).toEqual([]);
  });

  test('A7c.6 — empty public pitch points are filtered OUT of the published payload', () => {
    // A7c.6 flipped the wizard default from private to public so first-
    // time agents see their points on the buyer page. The complementary
    // safeguard is `projectPitchCard`: an empty public row has no
    // rendering content and is dropped on the way to the payload.
    //
    // This test proves the filter holds: a draft with public-but-empty
    // rows emits zero pitch cards. Without this filter, defaulting
    // public would surface blank cards on /h/[slug].
    const draftWithEmptyPublicPoints: SellerPresentationDraft = {
      comps: [],
      pitchPoints: [
        // Empty title + empty support, public-by-default per A7c.6.
        { id: 'pp_empty_1', title: '', support: '', visibility: 'public' },
        // Whitespace-only title still counts as empty.
        { id: 'pp_empty_2', title: '   ', visibility: 'public' },
        // Legacy `text` (pre-A7c rename) variant — also empty.
        { id: 'pp_empty_3', text: '', visibility: 'public' },
        // One real filled point so we can assert it's the ONLY card.
        {
          id: 'pp_filled',
          title: 'Chef-grade kitchen',
          support: 'Wolf range, two ovens.',
          visibility: 'public',
        },
      ],
      commitments: [],
      asks: [],
    };
    const payload = toPublicPayload(draftWithEmptyPublicPoints, {});

    // Only the filled point survives — empty public rows are dropped.
    expect(payload.pitchPublicCards).toEqual([
      { title: 'Chef-grade kitchen', support: 'Wolf range, two ovens.' },
    ]);
    expect(payload.pitchPublicPoints).toEqual(['Chef-grade kitchen']);
  });

  test('A7a — pitch-point legacy `text` (pre-A7a drafts) still serializes via the title fallback', () => {
    // A5b drafts only populated `text`. A7a's projector falls back to
    // `text` when `title` is unset so resumed older drafts don't
    // silently drop their public pitch points.
    const legacyDraft: SellerPresentationDraft = {
      comps: [],
      pitchPoints: [
        {
          id: 'pp_legacy',
          text: 'Legacy A5b pitch text',
          visibility: 'public',
        },
      ],
      commitments: [],
      asks: [],
    };
    const payload = toPublicPayload(legacyDraft, {});

    expect(payload.pitchPublicPoints).toEqual(['Legacy A5b pitch text']);
    expect(payload.pitchPublicCards).toEqual([
      { title: 'Legacy A5b pitch text', support: '' },
    ]);
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
    // agentBranding === agent (same projection). Both have every key
    // present as `undefined` (the projector enumerates explicitly).
    expect(payload.agentBranding).toEqual({
      name: undefined,
      brokerage: undefined,
      phone: undefined,
      email: undefined,
      licenseNumber: undefined,
      areasServed: undefined,
      photoUrl: undefined,
      bioShort: undefined,
      yearsInArea: undefined,
      ctaReassurance: undefined,
    });
  });
});
