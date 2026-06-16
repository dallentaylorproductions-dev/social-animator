import { test, expect } from '@playwright/test';

/**
 * Open House Prep — public-payload allowlist proof (data-minimization fix).
 *
 * The privacy boundary made code. The publish route calls
 * `toPublicHandoutData(draft, agentContact)` and passes ONLY the result to
 * `publishHandout`; the raw `OpenHousePrepDraft` NEVER enters the public KV
 * record. Before this fix the route spread `{ ...draft, agentContact }`,
 * leaving agent-only fields (notably `preEventNotes`) sitting in the public
 * record at rest even though the visitor HTML never rendered them
 * (memory `sep-ohprep-publish-data-minimization-gap`).
 *
 * This spec constructs a maximally-populated draft with SENTINEL strings in
 * every private slot and asserts none survive serialization, that the public
 * fields round-trip, that the read-time clamp drops the same private fields
 * from an over-broad record, and that the agent's own draft is left intact.
 *
 * Pure-Node test — no browser, no HTTP. Privacy doesn't ride on routing.
 */

import {
  toPublicHandoutData,
  clampPublicHandoutData,
  type PublicAgentContact,
} from '../src/tools/open-house-prep/output/public-payload';
import type { OpenHousePrepDraft } from '../src/tools/open-house-prep/engine/types';

// Sentinel values — guaranteed-unique substrings that must NEVER appear in
// the JSON-stringified public payload.
const S = {
  // ---- Private / agent-only field sentinels (must DROP) ----
  preEventNotes: 'PRIVATE_SENTINEL_PRE_EVENT_NOTES',
  talkingPointId: 'PRIVATE_SENTINEL_TALKING_POINT_ID',
  talkingPointOverride: 'PRIVATE_SENTINEL_TALKING_OVERRIDE',
  commonQuestionId: 'PRIVATE_SENTINEL_QUESTION_ID',
  commonQuestionOverride: 'PRIVATE_SENTINEL_QUESTION_OVERRIDE',
  conversionPromptId: 'PRIVATE_SENTINEL_PROMPT_ID',
  followUpCommitment: 'PRIVATE_SENTINEL_FOLLOWUP_COMMITMENT',
  primaryColor: '#abc123',
  // Per-comp private sentinels (must DROP; comp.notes is PUBLIC in OH).
  compSource: 'screenshot-ai' as const,
  compYearRemodeled: 'PRIVATE_SENTINEL_YEAR_REMODELED',
  // A field that doesn't exist on the draft today but would be private if
  // someone added it — the allowlist must drop it (early-warning).
  negotiationNotes: 'PRIVATE_SENTINEL_NEGOTIATION_NOTES',
  // Rogue field smuggled onto the agent-contact object.
  agentRogue: 'PRIVATE_SENTINEL_AGENT_ROGUE',

  // ---- Public-safe sentinels (must round-trip verbatim) ----
  positioningNarrative: 'PUBLIC_SENTINEL_POSITIONING',
  marketContext: 'PUBLIC_SENTINEL_MARKET_CONTEXT',
  compNotes: 'PUBLIC_SENTINEL_COMP_NOTES',
  neighborhoodValue: 'PUBLIC_SENTINEL_NEIGHBORHOOD_VALUE',
  propertyPhotoUrl: 'data:image/png;base64,PUBLIC_SENTINEL_PHOTO',
};

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'propertyAddress',
  'propertyCity',
  'propertyPhotoUrl',
  'listPrice',
  'beds',
  'baths',
  'squareFeet',
  'eventDate',
  'eventStartTime',
  'eventEndTime',
  'positioningNarrative',
  'comps',
  'neighborhoodFacts',
  'marketContext',
  'agentContact',
]);

const ALLOWED_COMP_KEYS = new Set([
  'address',
  'soldPrice',
  'daysOnMarket',
  'saleToListPercent',
  'squareFeet',
  'distanceMiles',
  'soldDate',
  'notes',
]);

const ALLOWED_AGENT_KEYS = new Set([
  'name',
  'brokerage',
  'phone',
  'email',
  'licenseNumber',
]);

const FIXTURE_AGENT_CONTACT: PublicAgentContact = {
  name: 'Aaron Test',
  brokerage: 'Test Realty',
  phone: '2532028825',
  email: 'aaron@example.com',
  licenseNumber: 'WA-12345',
};

function maxedDraft(): OpenHousePrepDraft {
  // The cast-through-`unknown` injects keys wider than the declared type
  // (e.g. a per-comp `yearRemodeled`, a top-level `negotiationNotes`) so the
  // spec proves the serializer drops them even if an older persisted draft —
  // or a hand-tampered record — tries to smuggle them through.
  const draft = {
    // ---- Public-safe fields (these SHOULD survive) ----
    propertyAddress: '1234 Test Drive NE',
    propertyCity: 'Tacoma',
    propertyPhotoUrl: S.propertyPhotoUrl,
    listPrice: '$685,000',
    beds: '4',
    baths: '2.5',
    squareFeet: '2,840',
    eventDate: '2099-01-01',
    eventStartTime: '1:00 PM',
    eventEndTime: '3:00 PM',
    positioningNarrative: S.positioningNarrative,
    marketContext: S.marketContext,
    comps: [
      {
        address: '5678 Elm Ave NE',
        soldPrice: '$695,000',
        daysOnMarket: '11',
        saleToListPercent: '98%',
        squareFeet: '2,900',
        distanceMiles: '0.4',
        soldDate: '2026-04-15',
        // comp.notes is PUBLIC in OH (rendered in the handout) — should survive.
        notes: S.compNotes,
        // Per-comp PRIVATE / non-rendered fields — must DROP.
        source: S.compSource,
        fieldConfidence: { address: 'low' },
        counted: true,
        yearBuilt: 1998,
        photoUrl: 'data:image/png;base64,PRIVATE_SENTINEL_COMP_PHOTO',
        houseLat: 47.25,
        // Rogue sibling that doesn't exist on the Comp type.
        yearRemodeled: S.compYearRemodeled,
      },
    ],
    neighborhoodFacts: [{ label: 'Walk score', value: S.neighborhoodValue }],

    // ---- Private / agent-only fields (these MUST NOT appear) ----
    preEventNotes: S.preEventNotes,
    selectedTalkingPointIds: [S.talkingPointId],
    talkingPointOverrides: { [S.talkingPointId]: S.talkingPointOverride },
    selectedCommonQuestionIds: [S.commonQuestionId],
    commonQuestionOverrides: { [S.commonQuestionId]: S.commonQuestionOverride },
    selectedConversionPromptIds: [S.conversionPromptId],
    followUpCommitments: [S.followUpCommitment],
    dataSource: 'manual',
    primaryColor: S.primaryColor,
    accentColor: S.primaryColor,
    backgroundColor: S.primaryColor,
    // A future private field — would leak silently through a spread.
    negotiationNotes: S.negotiationNotes,
  };
  return draft as unknown as OpenHousePrepDraft;
}

test.describe('toPublicHandoutData — privacy allowlist', () => {
  test('public fields survive verbatim', () => {
    const payload = toPublicHandoutData(maxedDraft(), FIXTURE_AGENT_CONTACT);

    expect(payload.propertyAddress).toBe('1234 Test Drive NE');
    expect(payload.propertyCity).toBe('Tacoma');
    expect(payload.propertyPhotoUrl).toBe(S.propertyPhotoUrl);
    expect(payload.listPrice).toBe('$685,000');
    expect(payload.beds).toBe('4');
    expect(payload.baths).toBe('2.5');
    expect(payload.squareFeet).toBe('2,840');
    expect(payload.eventDate).toBe('2099-01-01');
    expect(payload.eventStartTime).toBe('1:00 PM');
    expect(payload.eventEndTime).toBe('3:00 PM');
    expect(payload.positioningNarrative).toBe(S.positioningNarrative);
    expect(payload.marketContext).toBe(S.marketContext);

    expect(payload.comps).toHaveLength(1);
    expect(payload.comps[0].address).toBe('5678 Elm Ave NE');
    expect(payload.comps[0].soldPrice).toBe('$695,000');
    expect(payload.comps[0].daysOnMarket).toBe('11');
    expect(payload.comps[0].saleToListPercent).toBe('98%');
    expect(payload.comps[0].squareFeet).toBe('2,900');
    expect(payload.comps[0].distanceMiles).toBe('0.4');
    expect(payload.comps[0].soldDate).toBe('2026-04-15');
    // comp.notes is PUBLIC in the OH design (rendered in Section 3 + PDF).
    expect(payload.comps[0].notes).toBe(S.compNotes);

    expect(payload.neighborhoodFacts).toEqual([
      { label: 'Walk score', value: S.neighborhoodValue },
    ]);

    expect(payload.agentContact).toEqual(FIXTURE_AGENT_CONTACT);
  });

  test('preEventNotes (and every other private field) is ABSENT from the public payload', () => {
    const payload = toPublicHandoutData(maxedDraft(), FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    // Value sentinels — the unambiguous leak signals.
    for (const forbidden of [
      S.preEventNotes,
      S.talkingPointId,
      S.talkingPointOverride,
      S.commonQuestionId,
      S.commonQuestionOverride,
      S.conversionPromptId,
      S.followUpCommitment,
      S.negotiationNotes,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // Key-name sentinels — guards a future regression that lets a private
    // FIELD NAME through with a different value.
    for (const forbiddenKey of [
      'preEventNotes',
      'selectedTalkingPointIds',
      'talkingPointOverrides',
      'selectedCommonQuestionIds',
      'commonQuestionOverrides',
      'selectedConversionPromptIds',
      'followUpCommitments',
      'dataSource',
      'primaryColor',
      'accentColor',
      'backgroundColor',
      'negotiationNotes',
    ]) {
      expect(serialized).not.toContain(`"${forbiddenKey}":`);
    }
  });

  test('tamper test — an injected extra private field does NOT appear (allowlist, not spread)', () => {
    // A draft carrying a private field the projector knows nothing about
    // (negotiationNotes) must not ride through. If the route spread the
    // draft instead of projecting field-by-field, this sentinel would leak.
    const payload = toPublicHandoutData(maxedDraft(), FIXTURE_AGENT_CONTACT);
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    for (const key of Object.keys(json)) {
      expect(
        ALLOWED_TOP_LEVEL_KEYS.has(key),
        `unexpected top-level key "${key}" outside allowlist`,
      ).toBe(true);
    }
    expect(JSON.stringify(payload)).not.toContain(S.negotiationNotes);
  });

  test('per-comp private fields drop; comp emits only allowlisted keys', () => {
    const payload = toPublicHandoutData(maxedDraft(), FIXTURE_AGENT_CONTACT);
    const serialized = JSON.stringify(payload);

    // Private per-comp sentinels gone.
    expect(serialized).not.toContain(S.compSource);
    expect(serialized).not.toContain(S.compYearRemodeled);
    expect(serialized).not.toContain('PRIVATE_SENTINEL_COMP_PHOTO');

    const json = JSON.parse(serialized) as { comps: Record<string, unknown>[] };
    for (const comp of json.comps) {
      for (const key of Object.keys(comp)) {
        expect(
          ALLOWED_COMP_KEYS.has(key),
          `unexpected comp key "${key}" outside allowlist`,
        ).toBe(true);
      }
      for (const forbiddenKey of [
        'source',
        'fieldConfidence',
        'counted',
        'yearBuilt',
        'photoUrl',
        'houseLat',
        'yearRemodeled',
      ]) {
        expect(
          Object.prototype.hasOwnProperty.call(comp, forbiddenKey),
          `comp leaked forbidden key "${forbiddenKey}"`,
        ).toBe(false);
      }
    }
  });

  test('agent-contact block emits no key outside the public agent allowlist', () => {
    const rogueAgent = {
      ...FIXTURE_AGENT_CONTACT,
      negotiationNotes: S.agentRogue,
    } as PublicAgentContact & Record<string, unknown>;
    const payload = toPublicHandoutData(maxedDraft(), rogueAgent);
    const json = JSON.parse(JSON.stringify(payload)) as {
      agentContact: Record<string, unknown>;
    };
    for (const key of Object.keys(json.agentContact)) {
      expect(
        ALLOWED_AGENT_KEYS.has(key),
        `unexpected agent key "${key}" outside allowlist`,
      ).toBe(true);
    }
    expect(JSON.stringify(payload)).not.toContain(S.agentRogue);
  });

  test('the agent draft is NOT mutated — private notes remain on the agent side', () => {
    // The agent-facing prep PDF reads the agent's OWN draft, not the public
    // record. Projecting for publish must not strip the live draft.
    const draft = maxedDraft();
    toPublicHandoutData(draft, FIXTURE_AGENT_CONTACT);
    expect(draft.preEventNotes).toBe(S.preEventNotes);
    expect(draft.followUpCommitments).toEqual([S.followUpCommitment]);
    expect(draft.selectedTalkingPointIds).toEqual([S.talkingPointId]);
  });

  test('an empty / minimal draft serializes to safe defaults', () => {
    const minimal = {
      propertyAddress: '',
      listPrice: '',
      eventDate: '',
      comps: [],
      neighborhoodFacts: [],
      selectedTalkingPointIds: [],
      selectedCommonQuestionIds: [],
      selectedConversionPromptIds: [],
      followUpCommitments: [],
      dataSource: 'manual',
    } as unknown as OpenHousePrepDraft;
    const payload = toPublicHandoutData(minimal, {});

    expect(payload.propertyAddress).toBe('');
    expect(payload.listPrice).toBe('');
    expect(payload.eventDate).toBe('');
    expect(payload.comps).toEqual([]);
    expect(payload.neighborhoodFacts).toEqual([]);
    // agentContact is present (an empty object) when a contact arg was passed.
    expect(payload.agentContact).toEqual({
      name: undefined,
      brokerage: undefined,
      phone: undefined,
      email: undefined,
      licenseNumber: undefined,
    });
  });
});

test.describe('clampPublicHandoutData — read-time data minimization', () => {
  test('drops private fields from an over-broad / pre-fix KV record', () => {
    // Simulate a record written by the OLD route (full draft spread into
    // data). The read clamp must strip the private fields so they never
    // reach the renderer OR get serialized to the client.
    const overBroad = {
      ...(maxedDraft() as unknown as Record<string, unknown>),
      agentContact: { ...FIXTURE_AGENT_CONTACT, rogue: S.agentRogue },
    };
    const clamped = clampPublicHandoutData(overBroad);
    const serialized = JSON.stringify(clamped);

    // Private fields gone.
    for (const forbidden of [
      S.preEventNotes,
      S.talkingPointId,
      S.followUpCommitment,
      S.compSource,
      S.agentRogue,
      S.negotiationNotes,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // Public fields preserved (rendered output stays byte-identical).
    expect(clamped.propertyAddress).toBe('1234 Test Drive NE');
    expect(clamped.comps[0].notes).toBe(S.compNotes);
    expect(clamped.agentContact?.name).toBe('Aaron Test');

    // Top-level + comp keys are within the allowlist.
    const json = JSON.parse(serialized) as {
      comps: Record<string, unknown>[];
      [k: string]: unknown;
    };
    for (const key of Object.keys(json)) {
      expect(ALLOWED_TOP_LEVEL_KEYS.has(key)).toBe(true);
    }
    for (const comp of json.comps) {
      for (const key of Object.keys(comp)) {
        expect(ALLOWED_COMP_KEYS.has(key)).toBe(true);
      }
    }
  });

  test('a garbage / non-object record clamps to safe empty defaults', () => {
    for (const garbage of [null, undefined, 'string', 42, []]) {
      const clamped = clampPublicHandoutData(garbage);
      expect(clamped.propertyAddress).toBe('');
      expect(clamped.comps).toEqual([]);
      expect(clamped.neighborhoodFacts).toEqual([]);
      expect(clamped.agentContact).toBeUndefined();
    }
  });

  test('round-trip: clamp of a freshly-projected payload is identical', () => {
    const payload = toPublicHandoutData(maxedDraft(), FIXTURE_AGENT_CONTACT);
    const reclamped = clampPublicHandoutData(
      JSON.parse(JSON.stringify(payload)),
    );
    expect(reclamped).toEqual(payload);
  });
});
