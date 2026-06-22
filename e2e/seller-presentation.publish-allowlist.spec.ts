import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — public-payload allowlist proof (v1.47 / A6 + A7a + A7d.1 + A7d.2).
 *
 * The privacy boundary made code. The publish route calls
 * `toPublicPayload(draft, agentContact, brandReviews)` and passes
 * ONLY the result to `publishHandout`. This spec constructs a
 * maximally-populated draft + brand-reviews record with SENTINEL
 * strings in every private slot and asserts none of them survive
 * serialization.
 *
 * A7d.1 subtraction: `editorialPhotoUrl`, `agentNote`, `trackRecord`,
 * and `buyerQuote` were removed from the draft + serializer. This
 * spec now asserts they are NOT emitted (even if an old persisted
 * draft tries to smuggle them through). The drop-on-projection
 * guarantee is exactly the same shape as the existing private-field
 * proofs.
 *
 * A7d.2 relocation: `reviews` + `reviewsOutlink` now come from the
 * publish route's `brandReviews` arg (sourced from BrandSettings).
 * Legacy drafts may still carry `reviews` / `reviewsOutlink` keys —
 * the projector ignores them. This spec verifies both directions:
 * Settings-sourced reviews ROUND-TRIP, draft-borne reviews DROP, and
 * tampered settings records don't leak non-allowlisted keys.
 *
 * Pure-Node test — no browser, no HTTP. Privacy doesn't ride on routing.
 */

import {
  toPublicPayload,
  clampPublicPayload,
  clampPublicWhyUs,
  RECENT_LISTINGS_CAP,
  type AgentBranding,
  type BrandReviewsInput,
  type BrandWhyUsInput,
} from '../src/tools/seller-presentation/output/public-payload';
import type { SellerPresentationDraft } from '../src/tools/seller-presentation/engine/types';
import { WHYUS_CAPS } from '../src/lib/whyus';

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
  propertyState: 'WA',
  propertyZip: '98404',
  heroPhotoUrl: 'data:image/png;base64,PUBLIC_SENTINEL_HERO',
  videoPoster: 'https://example.com/PUBLIC_SENTINEL_POSTER.jpg',
  videoUrl: 'https://example.com/PUBLIC_SENTINEL_VIDEO.mp4',
  videoTitle: 'PUBLIC_SENTINEL_VIDEO_TITLE',
  videoRuntime: '2:14',
  videoRecordedOn: '2026-05-12',
  // A7d.2 — Settings-sourced reviews + outlink (the values that
  // SHOULD round-trip). Pass via the publish route's brandReviews arg.
  brandReviewBody: 'PUBLIC_SENTINEL_BRAND_REVIEW_BODY',
  brandReviewName: 'PUBLIC_SENTINEL_BRAND_REVIEW_NAME',
  reviewsOutlinkUrl: 'https://example.com/PUBLIC_SENTINEL_OUTLINK',
  // A7d.2 — draft-borne reviews / outlink (must NOT survive — the
  // projector reads from brandReviews only). Old persisted drafts
  // could still smuggle these through; the spec proves they drop.
  draftReviewBody: 'REMOVED_SENTINEL_DRAFT_REVIEW_BODY',
  draftReviewOutlinkLabel: 'REMOVED_SENTINEL_DRAFT_OUTLINK_LABEL',
  draftReviewOutlinkUrl: 'https://example.com/REMOVED_SENTINEL_DRAFT_OUTLINK',
  // A7d.2 — non-allowlisted brand-settings keys. A tampered Settings
  // record could ride extra fields into the publish body; the
  // projector's field-by-field reads must drop them.
  brandSettingsRogueKey: 'PRIVATE_SENTINEL_BRAND_SETTINGS_ROGUE',
  areaStatsMedianSale: 'PUBLIC_SENTINEL_MEDIAN_SALE',
  areaStatsMonth: 'PUBLIC_SENTINEL_MONTH',
  pitchCardTitle: 'PUBLIC_SENTINEL_CARD_TITLE',
  pitchCardSupport: 'PUBLIC_SENTINEL_CARD_SUPPORT',
  agentAreasServed: 'PUBLIC_SENTINEL_AREAS_SERVED',
  agentPhotoUrl: 'data:image/png;base64,PUBLIC_SENTINEL_AGENT_PHOTO',
  agentBioShort: 'PUBLIC_SENTINEL_AGENT_BIO',
  agentYearsInArea: 'PUBLIC_SENTINEL_YEARS',
  agentCtaReassurance: 'PUBLIC_SENTINEL_CTA_REASSURANCE',

  // ---- A7d.1 removed-field sentinels: editorialPhotoUrl, agentNote,
  //       trackRecord, and buyerQuote were cut. Old persisted drafts
  //       may still carry them; the serializer must DROP them silently.
  //       The sentinels prove the drop holds on round-trip.
  removedAgentNote: 'REMOVED_SENTINEL_AGENT_NOTE_BODY',
  removedEditorialPhotoUrl: 'https://example.com/REMOVED_SENTINEL_EDITORIAL.jpg',
  removedTrackFigureValue: 'REMOVED_SENTINEL_FIG_VALUE',
  removedTrackTestimonialBody: 'REMOVED_SENTINEL_TESTIMONIAL_BODY',
  removedBuyerQuoteBody: 'REMOVED_SENTINEL_BUYER_QUOTE',

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
  // v1.47 Lane A polish — public emit gains yearBuilt for the consumer
  // comp card's "Built [year]" caption. Stays the only new addition;
  // the test below proves no sibling private fields ride in alongside.
  'yearBuilt',
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
  // A7d.1: the keys agentNote / editorialPhotoUrl / trackRecord /
  // buyerQuote are REMOVED from SellerPresentationDraft. The spec
  // still injects them via a cast so we can prove the serializer
  // drops them even if an older persisted draft (or hand-tampered
  // KV record) tries to smuggle them through. The cast-through-
  // `unknown` is the conventional TS escape hatch for "this object
  // is intentionally wider than the declared type."
  const draft = {
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
    // ---- A7d.1 removed fields — must DROP on projection ----
    agentNote: S.removedAgentNote,
    editorialPhotoUrl: S.removedEditorialPhotoUrl,
    trackRecord: {
      figures: [
        {
          label: 'Homes sold',
          value: S.removedTrackFigureValue,
          ctx: 'last 24 months',
        },
        { label: 'Avg days', value: '11' },
      ],
      testimonial: {
        body: S.removedTrackTestimonialBody,
        attributionShort: 'M.S.',
        areaOrYear: 'Tacoma, 2025',
      },
    },
    buyerQuote: { body: S.removedBuyerQuoteBody, source: 'A buyer who toured' },
    video: {
      posterUrl: S.videoPoster,
      videoUrl: S.videoUrl,
      title: S.videoTitle,
      runtime: S.videoRuntime,
      recordedOn: S.videoRecordedOn,
    },
    // A7d.2 — these draft-level reviews/outlink are LEGACY (old drafts
    // pre-relocation). The projector must IGNORE them entirely; the
    // assertions below prove neither value survives serialization.
    reviews: [
      {
        body: S.draftReviewBody,
        attributionName: 'A. Customer',
        attributionYear: '2025',
        attributionStreet: 'NE 17th',
      },
    ],
    reviewsOutlink: {
      label: S.draftReviewOutlinkLabel,
      url: S.draftReviewOutlinkUrl,
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
        yearBuilt: 1998,
        // Rogue sibling on the same comp record. yearBuilt is now in
        // the public allowlist; this sentinel proves the projector
        // didn't widen the gate to anything beyond yearBuilt.
        yearRemodeled: 'PRIVATE_SENTINEL_YEAR_REMODELED',
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
  return draft as unknown as SellerPresentationDraft;
}

const FIXTURE_AGENT_CONTACT: AgentBranding = {
  name: 'Aaron Test',
  brokerage: 'Test Realty',
  phone: '2532028825',
  email: 'aaron@example.com',
  licenseNumber: 'WA-12345',
};

// A7d.2 — Settings-sourced brand reviews payload. Carries the values
// that SHOULD round-trip into payload.reviews + payload.reviewsOutlink.
// Casts include a rogue key so the spec can prove field-by-field
// projection drops anything not on the allowlist.
const FIXTURE_BRAND_REVIEWS: BrandReviewsInput & Record<string, unknown> = {
  reviews: [
    {
      body: S.brandReviewBody,
      attributionName: S.brandReviewName,
      attributionYear: '2025',
      attributionStreet: 'NE 17th',
    },
  ],
  reviewsOutlinkUrl: S.reviewsOutlinkUrl,
  // Rogue settings key — would leak if the projector spread the input.
  rogueSettingsKey: S.brandSettingsRogueKey,
};

test.describe('toPublicPayload — privacy allowlist (R-1 proof)', () => {
  test('public fields survive verbatim (A6 flat + A7a grouped)', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );

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

    expect(payload.video).toBeDefined();
    expect(payload.video?.videoUrl).toBe(S.videoUrl);
    expect(payload.video?.title).toBe(S.videoTitle);
    expect(payload.video?.runtime).toBe(S.videoRuntime);

    expect(payload.whyPrice.publicRationale).toContain('drive multiple offers');
    expect(payload.whyPrice.comps).toHaveLength(2);

    expect(payload.pitchPublicCards).toEqual([
      { title: S.pitchCardTitle, support: S.pitchCardSupport },
    ]);

    // A7d.2 — reviews + outlink come from brandReviews (Settings),
    // not from the draft. The brand-sourced sentinel survives; the
    // draft-borne sentinel is proven absent in the dedicated test
    // below.
    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews?.[0].body).toBe(S.brandReviewBody);
    expect(payload.reviews?.[0].attributionName).toBe(S.brandReviewName);
    expect(payload.reviewsOutlink?.url).toBe(S.reviewsOutlinkUrl);
    // Label is fixed (not editable in Settings) — projector emits the
    // canonical "See all reviews on Zillow" string.
    expect(payload.reviewsOutlink?.label).toBe('See all reviews on Zillow');

    expect(payload.areaStats?.medianSale).toBe(S.areaStatsMedianSale);
    expect(payload.areaStats?.monthlySeries).toHaveLength(2);
    expect(payload.areaStats?.monthlySeries?.[0].month).toBe(S.areaStatsMonth);

    expect(payload.agent.name).toBe('Aaron Test');
  });

  test('A7d.1 — removed fields (agentNote / editorialPhotoUrl / trackRecord / buyerQuote) DROP on serialization', () => {
    // The maxedDraft injects these keys via a cast so the spec can
    // prove the serializer drops them even when present. Both the
    // value sentinels AND the key names must be absent from the JSON.
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    ) as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(payload);

    for (const removedSentinel of [
      S.removedAgentNote,
      S.removedEditorialPhotoUrl,
      S.removedTrackFigureValue,
      S.removedTrackTestimonialBody,
      S.removedBuyerQuoteBody,
    ]) {
      expect(serialized).not.toContain(removedSentinel);
    }

    for (const removedKey of [
      'agentNote',
      'editorialPhotoUrl',
      'trackRecord',
      'buyerQuote',
    ]) {
      expect(serialized).not.toContain(`"${removedKey}":`);
      expect(payload[removedKey]).toBeUndefined();
    }
  });

  test('A7d.2 — reviews + outlink come from brandReviews (Settings), draft-borne values drop', () => {
    // Legacy drafts may still ride `reviews` / `reviewsOutlink` keys
    // even though the wizard's editorial step no longer captures them.
    // The projector must IGNORE the draft copies entirely and emit ONLY
    // the brand-reviews values.
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );
    const serialized = JSON.stringify(payload);

    // Settings-sourced (the brand values) — should round-trip.
    expect(serialized).toContain(S.brandReviewBody);
    expect(serialized).toContain(S.reviewsOutlinkUrl);

    // Draft-borne (legacy) — must drop.
    expect(serialized).not.toContain(S.draftReviewBody);
    expect(serialized).not.toContain(S.draftReviewOutlinkLabel);
    expect(serialized).not.toContain(S.draftReviewOutlinkUrl);

    // Tampered settings record carries an extra key (`rogueSettingsKey`).
    // The projector's field-by-field reads must never let it through.
    expect(serialized).not.toContain(S.brandSettingsRogueKey);
    expect(serialized).not.toContain('"rogueSettingsKey":');

    // Positive: payload.reviews holds the brand-sourced row only.
    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews?.[0].body).toBe(S.brandReviewBody);
    expect(payload.reviewsOutlink?.url).toBe(S.reviewsOutlinkUrl);
  });

  test('A7d.2 — no brandReviews arg → reviews/outlink absent from payload', () => {
    // When the agent hasn't filled in any reviews in Settings yet, the
    // publish route still calls toPublicPayload (with brandReviews
    // omitted or empty). The reviews block must hide cleanly.
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    expect(payload.reviews).toBeUndefined();
    expect(payload.reviewsOutlink).toBeUndefined();
    expect(serialized).not.toContain('"reviews":');
    expect(serialized).not.toContain('"reviewsOutlink":');

    // Legacy draft-level reviews must STILL be dropped even with no
    // brandReviews override (no fallback to draft).
    expect(serialized).not.toContain(S.draftReviewBody);
  });

  test('A7d.2 — empty brandReviews list emits no reviews block', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT, {
      reviews: [],
      reviewsOutlinkUrl: '',
    });

    // No reviews + empty outlink URL → both blocks absent (the
    // renderer hides them based on undefined).
    expect(payload.reviews).toBeUndefined();
    expect(payload.reviewsOutlink).toBeUndefined();
  });

  test('A7d.5 — outlink-only Settings (no typed reviews) carries the outlink through to the payload', () => {
    // Dallen smoke 2026-05-23: agents commonly configure ONLY the
    // Zillow link in Settings (no typed reviews). The projector must
    // still emit `reviewsOutlink` so the renderer can show the
    // standalone CTA — and `reviews` must stay undefined so the
    // renderer doesn't try to map over an empty array.
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT, {
      // reviews intentionally omitted (the brand-Settings shape allows it)
      reviewsOutlinkUrl: 'https://www.zillow.com/profile/aaron-only-outlink',
    });

    expect(payload.reviews).toBeUndefined();
    expect(payload.reviewsOutlink).toBeDefined();
    expect(payload.reviewsOutlink?.url).toBe(
      'https://www.zillow.com/profile/aaron-only-outlink',
    );
    expect(payload.reviewsOutlink?.label).toBe('See all reviews on Zillow');

    // No leak: the outlink-only payload must NOT smuggle private draft
    // fields through (the standalone-outlink path uses the same
    // projection rails, but assert it explicitly so a future refactor
    // can't quietly weaken the boundary).
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(S.pricingStrategyId);
    expect(serialized).not.toContain(S.preAppointmentNotes);
  });

  test('A7d.2 — incomplete review row (missing body or attribution) drops on projection', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT, {
      reviews: [
        // Missing attributionName — drop.
        { body: 'Body only' } as unknown as { body: string; attributionName: string },
        // Missing body — drop.
        { attributionName: 'Name only' } as unknown as { body: string; attributionName: string },
        // Whitespace-only body — drop.
        { body: '   ', attributionName: 'A. Customer' },
        // The one valid row.
        { body: 'Real review.', attributionName: 'A. Customer' },
      ],
      reviewsOutlinkUrl: 'https://example.com/profile',
    });

    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews?.[0].body).toBe('Real review.');
  });

  test('NO private TOP-LEVEL field appears in the JSON-stringified payload', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );
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
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );

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

  test('Phase B2 — set-aside comps (counted === false) are filtered OUT of the public payload', () => {
    // The B2 per-comp "counted vs set-aside" toggle is an AUTHORING
    // concern: a set-aside comp stays on the prep draft for the agent's
    // reference but must NOT reach the seller page. The serializer
    // filters `counted === false` BEFORE projection; default-to-counted
    // means undefined/true comps still project.
    const draft = {
      comps: [
        {
          address: '111 COUNTED Ave NE',
          soldPrice: '$700,000',
          counted: true,
        },
        {
          // Explicit set-aside — must NOT appear in the payload.
          address: 'SETASIDE_SENTINEL 222 Hidden St NE',
          soldPrice: '$999,999',
          counted: false,
        },
        {
          // counted omitted → defaults to counted → must appear.
          address: '333 Default Pl NE',
          soldPrice: '$680,000',
        },
      ],
      pitchPoints: [],
      commitments: [],
      asks: [],
    } as unknown as SellerPresentationDraft;

    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    // The set-aside comp is gone — by address sentinel AND by count.
    expect(serialized).not.toContain('SETASIDE_SENTINEL');
    expect(payload.comps).toHaveLength(2);
    expect(payload.whyPrice.comps).toHaveLength(2);

    // The counted comps survive.
    const addresses = payload.comps.map((c) => c.address);
    expect(addresses).toContain('111 COUNTED Ave NE');
    expect(addresses).toContain('333 Default Pl NE');

    // The `counted` authoring flag itself never leaks into the emit.
    expect(serialized).not.toContain('"counted":');
    for (const comp of payload.comps) {
      expect(
        Object.prototype.hasOwnProperty.call(comp, 'counted'),
        'public comp leaked the counted authoring flag',
      ).toBe(false);
    }
  });

  test('A7a — every emitted comp has keys subset of {address, soldPrice, soldDate, sqft}', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );
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

  test('v1.47 Lane A — yearBuilt round-trips; rogue sibling on the same comp drops', () => {
    // The maxedDraft's comp[0] carries yearBuilt:1998 alongside a rogue
    // yearRemodeled string. yearBuilt is now allowlisted in public
    // emit; the rogue sibling tests that the projector didn't widen
    // the gate beyond yearBuilt.
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );

    // Positive: yearBuilt survives in both top-level comps and whyPrice.comps.
    expect(payload.comps[0].yearBuilt).toBe(1998);
    expect(payload.whyPrice.comps[0].yearBuilt).toBe(1998);
    // Comp[1] never set yearBuilt — absent emit.
    expect(payload.comps[1].yearBuilt).toBeUndefined();

    // Negative: rogue sibling never escapes — neither as a value nor
    // as a key on any emitted comp.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('PRIVATE_SENTINEL_YEAR_REMODELED');
    expect(serialized).not.toContain('"yearRemodeled":');
  });

  test('v1.47 Lane A — non-number yearBuilt on a comp drops (no string smuggle)', () => {
    // A hand-tampered KV record could try to ride a yearBuilt-shaped
    // STRING through publish ("1998" instead of 1998). The projector's
    // typeof === 'number' guard must drop it so the consumer page
    // doesn't render arbitrary text in the "Built …" caption.
    const draft = {
      comps: [
        {
          address: '5678 Elm Ave NE',
          soldPrice: '$695,000',
          yearBuilt: 'PRIVATE_SENTINEL_YEAR_STRING' as unknown as number,
        },
      ],
      pitchPoints: [],
      commitments: [],
      asks: [],
    } as unknown as SellerPresentationDraft;
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    expect(payload.comps[0].yearBuilt).toBeUndefined();
    expect(serialized).not.toContain('PRIVATE_SENTINEL_YEAR_STRING');
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
    const payload = toPublicPayload(
      draft,
      rougeAgentContact,
      FIXTURE_BRAND_REVIEWS,
    );
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

  test('the private pitch point cannot be derived from any payload field', () => {
    // Belt-and-suspenders: the public projection of pitchPoints is
    // `pitchPublicPoints` (a string[] of TITLEs only) plus the
    // `pitchPublicCards` ({title, support}[]). The private point's
    // TEXT must not leak via any other field — e.g., a future bug
    // where someone joined all pitch-point texts into a summary line.
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
    );
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
      'reviews',
      'reviewsOutlink',
      'areaStats',
      'preparedFor',
    ]) {
      expect(serialized).not.toContain(`"${optionalKey}":`);
    }

    // Each TS-typed access returns undefined (no partial object).
    expect(payload.video).toBeUndefined();
    expect(payload.reviews).toBeUndefined();
    expect(payload.reviewsOutlink).toBeUndefined();
    expect(payload.areaStats).toBeUndefined();
    expect(payload.preparedFor).toBeUndefined();

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

/**
 * E.0 — brand colors projection. `toPublicPayload`'s optional 4th arg
 * carries the agent's three brand colors (from BrandSettings). They are
 * validated + projected field-by-field onto `payload.brandColors`, which
 * the consumer /h/<slug> page applies as CSS custom properties. Cohort
 * safety: an unset brand emits NO brandColors key, so the page falls back
 * to the production Editorial palette via the CSS var() cascade.
 */
test.describe('toPublicPayload — brand colors projection (E.0)', () => {
  function baseDraft(): SellerPresentationDraft {
    return {
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
    } as unknown as SellerPresentationDraft;
  }

  test('valid hex brand colors round-trip onto payload.brandColors', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, {
      brandBackground: '#0f1c2e',
      brandText: '#f4e8d0',
      brandAccent: '#c9a341',
    });
    expect(payload.brandColors).toEqual({
      background: '#0f1c2e',
      text: '#f4e8d0',
      accent: '#c9a341',
    });
  });

  test('no brandColors arg → payload.brandColors absent (cohort-safe fallback)', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);
    expect(payload.brandColors).toBeUndefined();
    expect(serialized).not.toContain('"brandColors":');
  });

  test('invalid / partial hex values drop field-by-field', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, {
      brandBackground: '#0f1c2e', // valid
      brandText: 'navy', // not hex — drop
      brandAccent: '#ggg', // not hex — drop
    });
    expect(payload.brandColors).toEqual({ background: '#0f1c2e' });
    expect(payload.brandColors?.text).toBeUndefined();
    expect(payload.brandColors?.accent).toBeUndefined();
  });

  test('all-invalid brand colors → brandColors undefined (no empty object)', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, {
      brandBackground: '#12', // too short
      brandText: 'rgb(0,0,0)', // not hex
      brandAccent: '', // empty
    });
    expect(payload.brandColors).toBeUndefined();
  });

  test('rogue / non-allowlisted keys on the brand-colors input never leak', () => {
    const tampered = {
      brandBackground: '#0f1c2e',
      // Extra keys a tampered BrandSettings record could ride in — the
      // projector reads only the three known fields, so these drop.
      brandLogoUrl: 'https://example.com/PRIVATE_SENTINEL_BRAND_LOGO',
      __proto__rogue: 'PRIVATE_SENTINEL_BRAND_ROGUE',
    } as unknown as Parameters<typeof toPublicPayload>[3];
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, tampered);
    const serialized = JSON.stringify(payload);
    expect(payload.brandColors).toEqual({ background: '#0f1c2e' });
    expect(serialized).not.toContain('PRIVATE_SENTINEL_BRAND_LOGO');
    expect(serialized).not.toContain('PRIVATE_SENTINEL_BRAND_ROGUE');
    expect(serialized).not.toContain('"brandLogoUrl":');
  });

  // ---- E.1 — optional secondary (decorative role) ----
  test('E.1 — valid secondary round-trips onto payload.brandColors.secondary', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, {
      brandAccent: '#1f3a6b',
      brandSecondary: '#b0863a',
    });
    expect(payload.brandColors).toEqual({
      accent: '#1f3a6b',
      secondary: '#b0863a',
    });
  });

  test('E.1 — secondary absent → no secondary key (unset is first-class)', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, {
      brandAccent: '#1f3a6b',
    });
    expect(payload.brandColors).toEqual({ accent: '#1f3a6b' });
    expect(payload.brandColors?.secondary).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"secondary":');
  });

  test('E.1 — non-hex secondary drops, signature survives', () => {
    const payload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT, {}, {
      brandAccent: '#1f3a6b',
      brandSecondary: 'gold', // not hex — drop
    });
    expect(payload.brandColors).toEqual({ accent: '#1f3a6b' });
  });
});

/**
 * F4 — white-label wordmark flag (`suppressWordmark`). The publish path passes
 * the resolver's `whiteLabel` capability as `toPublicPayload`'s 5th arg; the
 * field is projected ONLY when that arg is literally `true`, and the read clamp
 * lets ONLY a literal boolean `true` survive a tampered KV record. The top-level
 * allowlist proves no OTHER new key leaked alongside it.
 */
test.describe('toPublicPayload — white-label wordmark flag (F4)', () => {
  function baseDraft(): SellerPresentationDraft {
    return {
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
    } as unknown as SellerPresentationDraft;
  }

  // The complete set of keys the serializer is allowed to emit at the top
  // level of the public payload (PublicPayload). Mirrors the comp/agent
  // allowlists above — any NEW top-level key must be added here deliberately,
  // which is what proves "no other new field leaks" alongside suppressWordmark.
  const ALLOWED_TOP_LEVEL_KEYS = new Set([
    'templateVersion',
    'suppressWordmark',
    'propertyAddress',
    'propertyCity',
    'recommendedPrice',
    'priceRationale',
    'comps',
    'agentBranding',
    'pitchPublicPoints',
    'property',
    'preparedFor',
    'video',
    'whyPrice',
    'pitchPublicCards',
    'reviews',
    'reviewsOutlink',
    'areaStats',
    'agent',
    'brandColors',
    // B0b — agent-constant "Why us" marketing layer + tagline + reviews headline.
    'whyUs',
    'agentTagline',
    'reviewsHeadline',
    // Seller State A — the agent's quiet signature line (same brand-snapshot
    // provenance as the tagline; rendered only by the State A page).
    'signatureLine',
    // Seller State A · Pass 2b — the set-once lead emphasis (onboarding BEAT 5;
    // emitted ONLY in a State A invitation publish, absent on this revealed
    // maxedDraft). Drives the CampaignSpread launch-story headline.
    'leadEmphasis',
    // Seller State A · Zone 5 — the recent-listings coverflow (gated behind the
    // coverflow flag AND an invitation status; absent on this revealed maxedDraft).
    'recentListings',
  ]);

  test('whiteLabel=true → suppressWordmark:true projects onto the payload', () => {
    const payload = toPublicPayload(
      baseDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      true,
    );
    expect(payload.suppressWordmark).toBe(true);
    expect(JSON.stringify(payload)).toContain('"suppressWordmark":true');
  });

  test('whiteLabel false / omitted → suppressWordmark absent (today\'s publishes)', () => {
    const falsePayload = toPublicPayload(
      baseDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
    );
    const omittedPayload = toPublicPayload(baseDraft(), FIXTURE_AGENT_CONTACT);
    for (const payload of [falsePayload, omittedPayload]) {
      expect(payload.suppressWordmark).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain('"suppressWordmark":');
    }
  });

  test('read clamp: ONLY a literal boolean true passes; tampered values drop to absent', () => {
    // A hand-edited KV record could carry any shape. The clamp coerces every
    // non-boolean-true to absent (→ wordmark shows), never a truthy string.
    for (const tampered of ['true', 1, 'yes', {}, [], 0, null]) {
      const clamped = clampPublicPayload({
        templateVersion: 2,
        suppressWordmark: tampered,
      });
      expect(clamped.suppressWordmark, JSON.stringify(tampered)).toBeUndefined();
    }
    // The one value that passes.
    expect(
      clampPublicPayload({ templateVersion: 2, suppressWordmark: true })
        .suppressWordmark,
    ).toBe(true);
  });

  test('top-level allowlist: no key outside the known set leaks (incl. with whiteLabel on)', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      { brandAccent: '#037290' },
      true, // whiteLabel on → suppressWordmark present, the only new top-level key
    );
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    for (const key of Object.keys(json)) {
      expect(
        ALLOWED_TOP_LEVEL_KEYS.has(key),
        `unexpected top-level key "${key}" outside allowlist`,
      ).toBe(true);
    }
    // The new field IS present in this whiteLabel-on case.
    expect(json.suppressWordmark).toBe(true);
  });
});

// ===========================================================================
// B0b — "Why us" projection + clamp allowlist (data-OUT boundary).
// ===========================================================================

const W = {
  diff: 'PUBLIC_SENTINEL_DIFFERENTIATOR',
  mktTitle: 'PUBLIC_SENTINEL_MKT_TITLE',
  mktDetail: 'PUBLIC_SENTINEL_MKT_DETAIL',
  statLabel: 'PUBLIC_SENTINEL_STAT_LABEL',
  statYour: '99.4%',
  statMarket: '97.1%',
  bigStatLabel: 'PUBLIC_SENTINEL_BIGSTAT_LABEL',
  bigStatYour: '1,240',
  stepHeading: 'PUBLIC_SENTINEL_STEP_HEADING',
  stepDetail: 'PUBLIC_SENTINEL_STEP_DETAIL',
  guarantee: 'PUBLIC_SENTINEL_GUARANTEE',
  tagline: 'PUBLIC_SENTINEL_TAGLINE',
  reviewsHeadline: 'PUBLIC_SENTINEL_REVIEWS_HEADLINE',
  // Skeleton row the agent never filled (pre-labeled, blank value) — must DROP.
  skeletonLabel: 'REMOVED_SENTINEL_SKELETON_STAT',
  // Tampered / non-allowlisted content — must NEVER survive.
  rogueTop: 'PRIVATE_SENTINEL_WHYUS_ROGUE_TOP',
  rogueNested: 'PRIVATE_SENTINEL_WHYUS_ROGUE_NESTED',
  rogueProto: 'PRIVATE_SENTINEL_WHYUS_ROGUE_PROTO',
};

// A maximally-populated, partly-tampered brandWhyUs record — sentinels in
// every renderable slot, plus rogue keys at the top level, inside a row, and
// a __proto__rogue. The projector reads field-by-field, so only the
// allowlisted fields may survive.
const FIXTURE_BRAND_WHYUS: BrandWhyUsInput = {
  whyUs: {
    differentiators: [W.diff, '   ', ''], // blank/whitespace rows drop
    marketingApproach: [
      { title: W.mktTitle, detail: W.mktDetail, rogue: W.rogueNested },
      { detail: 'detail-only, no title' }, // no title → drops (un-renderable)
    ],
    performanceStats: [
      // Comparison bar (market value present).
      { label: W.statLabel, yourValue: W.statYour, marketValue: W.statMarket, unit: '%' },
      // Single big stat (no market value).
      { label: W.bigStatLabel, yourValue: W.bigStatYour, unit: 'views' },
      // Arrives-done skeleton row, never filled → drops at the data-out boundary.
      { label: W.skeletonLabel, yourValue: '' },
    ],
    howWeWork: [{ step: W.stepHeading, detail: W.stepDetail }],
    guarantee: W.guarantee,
    rogueGroup: W.rogueTop, // non-allowlisted top-level whyUs key → drops
    ['__proto__rogue']: W.rogueProto,
  } as unknown as BrandWhyUsInput['whyUs'],
  agentTagline: W.tagline,
  reviewsHeadline: W.reviewsHeadline,
};

test.describe('toPublicPayload — whyUs projection (B0b data-out allowlist)', () => {
  test('renderable whyUs + tagline + headline round-trip through the projector', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      FIXTURE_BRAND_WHYUS,
    );

    const whyUs = payload.whyUs;
    expect(whyUs).toBeDefined();

    // Differentiators: blank/whitespace rows dropped, the real one survives.
    expect(whyUs?.differentiators).toEqual([W.diff]);

    // Marketing: titled row survives (title + detail); the detail-only row drops.
    expect(whyUs?.marketingApproach).toHaveLength(1);
    expect(whyUs?.marketingApproach[0]).toEqual({
      title: W.mktTitle,
      detail: W.mktDetail,
    });

    // Performance: the comparison bar + the single big stat survive; the
    // blank-value skeleton row drops.
    expect(whyUs?.performanceStats).toHaveLength(2);
    expect(whyUs?.performanceStats[0]).toEqual({
      label: W.statLabel,
      yourValue: W.statYour,
      marketValue: W.statMarket,
      unit: '%',
    });
    expect(whyUs?.performanceStats[1]).toEqual({
      label: W.bigStatLabel,
      yourValue: W.bigStatYour,
      unit: 'views',
    });

    expect(whyUs?.howWeWork).toEqual([
      { step: W.stepHeading, detail: W.stepDetail },
    ]);
    expect(whyUs?.guarantee).toBe(W.guarantee);

    expect(payload.agentTagline).toBe(W.tagline);
    expect(payload.reviewsHeadline).toBe(W.reviewsHeadline);
  });

  test('tampered whyUs: rogue top-level / nested / __proto__ keys + skeleton stat DROP', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      FIXTURE_BRAND_WHYUS,
    );
    const serialized = JSON.stringify(payload);

    // Non-allowlisted content — value sentinels absent.
    for (const rogue of [W.rogueTop, W.rogueNested, W.rogueProto, W.skeletonLabel]) {
      expect(serialized).not.toContain(rogue);
    }
    // Non-allowlisted key NAMES absent (field-by-field projection, no spread).
    for (const key of ['rogueGroup', 'rogue', '__proto__rogue']) {
      expect(serialized).not.toContain(`"${key}":`);
    }

    // Positive control: the allowlisted sentinels DID survive, proving the
    // absence above is real projection, not a wholesale drop.
    expect(serialized).toContain(W.diff);
    expect(serialized).toContain(W.statLabel);
  });

  test('soft caps re-applied: over-cap lists are hard-clamped', () => {
    const over = (n: number, make: (i: number) => unknown) =>
      Array.from({ length: n }, (_, i) => make(i));
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      {
        whyUs: {
          differentiators: over(20, (i) => `diff ${i}`),
          marketingApproach: over(20, (i) => ({ title: `m ${i}` })),
          performanceStats: over(20, (i) => ({ label: `s ${i}`, yourValue: '1' })),
          howWeWork: over(20, (i) => ({ step: `step ${i}` })),
        },
      } as unknown as BrandWhyUsInput,
    );

    expect(payload.whyUs?.differentiators.length).toBe(WHYUS_CAPS.differentiators);
    expect(payload.whyUs?.marketingApproach.length).toBe(WHYUS_CAPS.marketingApproach);
    expect(payload.whyUs?.performanceStats.length).toBe(WHYUS_CAPS.performanceStats);
    expect(payload.whyUs?.howWeWork.length).toBe(WHYUS_CAPS.howWeWork);
  });

  test('no brandWhyUs arg → whyUs/tagline/headline absent (section flexes out)', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT_CONTACT, FIXTURE_BRAND_REVIEWS);
    const serialized = JSON.stringify(payload);

    expect(payload.whyUs).toBeUndefined();
    expect(payload.agentTagline).toBeUndefined();
    expect(payload.reviewsHeadline).toBeUndefined();
    expect(serialized).not.toContain('"whyUs":');
    expect(serialized).not.toContain('"agentTagline":');
    expect(serialized).not.toContain('"reviewsHeadline":');
  });

  test('whyUs with only empty rows collapses to undefined', () => {
    const draft = maxedDraft();
    const payload = toPublicPayload(
      draft,
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      {
        whyUs: {
          differentiators: ['', '   '],
          marketingApproach: [{ detail: 'no title' }],
          performanceStats: [{ label: 'skeleton', yourValue: '' }],
          howWeWork: [{ detail: 'no step' }],
          guarantee: '   ',
        },
        agentTagline: '   ',
        reviewsHeadline: '',
      } as unknown as BrandWhyUsInput,
    );

    expect(payload.whyUs).toBeUndefined();
    expect(payload.agentTagline).toBeUndefined();
    expect(payload.reviewsHeadline).toBeUndefined();
  });

  test('clampPublicWhyUs (read boundary) re-runs the same allowlist on a KV record', () => {
    // A hand-edited KV record glues a private key onto a stored whyUs. The
    // read-time clamp must drop it exactly as the write-time projector does.
    const clamped = clampPublicWhyUs({
      differentiators: [W.diff, ''],
      marketingApproach: [{ title: W.mktTitle, secretFee: 'PRIVATE_KV_ROGUE' }],
      performanceStats: [
        { label: W.statLabel, yourValue: W.statYour, marketValue: W.statMarket },
        { label: 'unfilled', yourValue: '' }, // drops
      ],
      howWeWork: [{ step: W.stepHeading }],
      guarantee: W.guarantee,
      tamperedTopKey: 'PRIVATE_KV_TOP_ROGUE',
    });

    expect(clamped).toBeDefined();
    const serialized = JSON.stringify(clamped);
    expect(serialized).not.toContain('PRIVATE_KV_ROGUE');
    expect(serialized).not.toContain('PRIVATE_KV_TOP_ROGUE');
    expect(serialized).not.toContain('"secretFee":');
    expect(serialized).not.toContain('"tamperedTopKey":');
    expect(clamped?.differentiators).toEqual([W.diff]);
    expect(clamped?.performanceStats).toHaveLength(1);
    expect(clamped?.marketingApproach[0]).toEqual({ title: W.mktTitle });

    // A non-object / empty record clamps to undefined (single "no whyUs" state).
    expect(clampPublicWhyUs(undefined)).toBeUndefined();
    expect(clampPublicWhyUs('nope')).toBeUndefined();
    expect(clampPublicWhyUs({})).toBeUndefined();
  });
});

// ===========================================================================
// Seller State A · Zone 5 — recent-listings coverflow projection + clamp.
//
// The exposure proof rides the same allowlist rails as every other State A
// field: field-by-field projection (no spread), gated behind BOTH the
// SELLER_LISTINGS_COVERFLOW flag AND an invitation status, view counts clamped
// to non-negative integers, the array hard-capped, and re-clamped on read. This
// block proves a tampered settings record can't smuggle a private key, an
// unbounded list, or a fabricated/fractional/negative count into the page.
// ===========================================================================

const L = {
  addr: 'PUBLIC_SENTINEL_LISTING_ADDR',
  city: 'PUBLIC_SENTINEL_LISTING_CITY',
  pano: 'PUBLIC_SENTINEL_LISTING_PANO',
  rogueNested: 'PRIVATE_SENTINEL_LISTING_ROGUE_NESTED',
  rogueTop: 'PRIVATE_SENTINEL_LISTING_ROGUE_TOP',
};

// An invitation-status draft so the State A gate opens (a revealed draft would
// drop every State A field, recentListings included).
function invitationDraft(): SellerPresentationDraft {
  return {
    ...maxedDraft(),
    valuationStatus: 'preparing_for_walkthrough',
  } as SellerPresentationDraft;
}

// A maximally-populated, partly-tampered recentListings record. The projector
// reads field-by-field, so only the allowlisted fields on renderable rows survive.
const FIXTURE_RECENT_LISTINGS = [
  // Renderable row with a clean integer count + a rogue nested key (must drop).
  {
    address: L.addr,
    city: L.city,
    viewCount: 41184,
    photoUrl: 'https://example.com/listing.webp',
    secretLeadEmail: L.rogueNested,
  },
  // Fractional + negative counts must clamp away (no bogus number reaches the band).
  { address: '2 Frac Ave', viewCount: 1234.9 },
  { address: '3 Neg Ave', viewCount: -50 },
  // Street View fallback row (pano persisted, no image bytes).
  { address: '4 Pano Pl', hasStreetView: true, streetViewPanoId: L.pano },
  // No address → un-renderable, drops.
  { city: 'Nowhere', viewCount: 9 },
];

test.describe('toPublicPayload — recentListings coverflow (Zone 5 allowlist)', () => {
  test('renderable listings project field-by-field; counts clamp to integers', () => {
    const payload = toPublicPayload(
      invitationDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      { recentListings: FIXTURE_RECENT_LISTINGS } as unknown as BrandWhyUsInput,
      false, // compPhotos
      true, // sellerStateA
      true, // listingsCoverflow
    );

    const listings = payload.recentListings;
    expect(listings).toBeDefined();
    // The address-less row drops; four renderable rows survive.
    expect(listings).toHaveLength(4);

    // Row 0: allowlisted fields verbatim, integer count, NO rogue nested key.
    expect(listings?.[0]).toEqual({
      address: L.addr,
      city: L.city,
      viewCount: 41184,
      photoUrl: 'https://example.com/listing.webp',
    });

    // Fractional count floors to an integer; negative count drops entirely.
    expect(listings?.[1]).toEqual({ address: '2 Frac Ave', viewCount: 1234 });
    expect(listings?.[2]).toEqual({ address: '3 Neg Ave' });
    expect(listings?.[2]?.viewCount).toBeUndefined();

    // Street View fallback: pano + coverage flag survive (no image bytes).
    expect(listings?.[3]).toEqual({
      address: '4 Pano Pl',
      hasStreetView: true,
      streetViewPanoId: L.pano,
    });

    // Every count is an integer.
    for (const l of listings ?? []) {
      if (typeof l.viewCount === 'number') {
        expect(Number.isInteger(l.viewCount)).toBe(true);
      }
    }
  });

  test('tampered listings: rogue nested / top-level keys DROP (no spread)', () => {
    const payload = toPublicPayload(
      invitationDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      {
        recentListings: [
          { address: L.addr, viewCount: 100, rogueGroup: L.rogueTop },
          ...FIXTURE_RECENT_LISTINGS,
        ],
      } as unknown as BrandWhyUsInput,
      false,
      true,
      true,
    );
    const serialized = JSON.stringify(payload);

    // Non-allowlisted value sentinels absent.
    expect(serialized).not.toContain(L.rogueNested);
    expect(serialized).not.toContain(L.rogueTop);
    // Non-allowlisted key NAMES absent (field-by-field projection, no spread).
    expect(serialized).not.toContain('"secretLeadEmail":');
    expect(serialized).not.toContain('"rogueGroup":');
    // Positive control: the allowlisted sentinels DID survive.
    expect(serialized).toContain(L.addr);
    expect(serialized).toContain(L.pano);
  });

  test('array is hard-capped at RECENT_LISTINGS_CAP', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      address: `${i} Cap St`,
      viewCount: i,
    }));
    const payload = toPublicPayload(
      invitationDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      { recentListings: many } as unknown as BrandWhyUsInput,
      false,
      true,
      true,
    );
    expect(payload.recentListings?.length).toBe(RECENT_LISTINGS_CAP);
  });

  test('gated: flag OFF → no recentListings key (byte-identical)', () => {
    const payload = toPublicPayload(
      invitationDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      { recentListings: FIXTURE_RECENT_LISTINGS } as unknown as BrandWhyUsInput,
      false,
      true, // sellerStateA on
      false, // listingsCoverflow OFF
    );
    expect(payload.recentListings).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"recentListings":');
    expect(JSON.stringify(payload)).not.toContain(L.addr);
  });

  test('State B (revealed) + flag on → recentListings PRESENT (coverflow shows post-meeting too)', () => {
    // The exposure coverflow is now a TOP-LEVEL field (no longer State-A-gated),
    // so a revealed/full publish carries it too — "here's the reach your home
    // will get" is at least as persuasive at the close as in the invitation.
    // maxedDraft() is revealed (no invitation status); the flag is the only gate.
    const payload = toPublicPayload(
      maxedDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      { recentListings: FIXTURE_RECENT_LISTINGS } as unknown as BrandWhyUsInput,
      false,
      true,
      true, // listingsCoverflow ON
    );
    expect(payload.recentListings?.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).toContain(L.addr);
  });

  test('gated: revealed status + flag OFF → no recentListings (byte-identical State B)', () => {
    const payload = toPublicPayload(
      maxedDraft(),
      FIXTURE_AGENT_CONTACT,
      FIXTURE_BRAND_REVIEWS,
      {},
      false,
      { recentListings: FIXTURE_RECENT_LISTINGS } as unknown as BrandWhyUsInput,
      false,
      true,
      false, // listingsCoverflow OFF
    );
    expect(payload.recentListings).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"recentListings":');
  });

  test('read clamp: a hand-edited KV record re-runs the same allowlist', () => {
    // A tampered stored record glues a private key onto a listing and rides a
    // fractional count + an over-cap list. The read clamp must drop them exactly
    // as the write projector does — for ANY status now (top-level, not State-A-gated).
    const clamped = clampPublicPayload({
      templateVersion: 2,
      propertyAddress: '1 Main',
      valuationStatus: 'preparing_for_walkthrough',
      recentListings: [
        { address: L.addr, viewCount: 7.7, secretLeadEmail: L.rogueNested },
        ...Array.from({ length: 20 }, (_, i) => ({ address: `${i} KV`, viewCount: i })),
      ],
    });
    const serialized = JSON.stringify(clamped);
    expect(serialized).not.toContain(L.rogueNested);
    expect(serialized).not.toContain('"secretLeadEmail":');
    expect(clamped.recentListings?.length).toBe(RECENT_LISTINGS_CAP);
    expect(clamped.recentListings?.[0]).toEqual({ address: L.addr, viewCount: 7 });

    // A recentListings array on a REVEALED (State-B) record now SURVIVES the read
    // clamp (so the full presentation can show the coverflow), still re-run
    // through the SAME field-by-field projection (cap, integer counts, key drop).
    const revealed = clampPublicPayload({
      templateVersion: 2,
      propertyAddress: '1 Main',
      recentListings: [
        { address: L.addr, viewCount: 5, secretLeadEmail: L.rogueNested },
      ],
    });
    expect(revealed.recentListings).toEqual([{ address: L.addr, viewCount: 5 }]);
    expect(JSON.stringify(revealed)).not.toContain(L.rogueNested);
  });
});
