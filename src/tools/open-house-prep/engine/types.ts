/**
 * Open House Prep — engine types
 *
 * Dual-output tool (per Audit 1C §7): produces an agent-facing private
 * prep PDF AND a client-facing visitor handout web URL (published via
 * Audit 1B's share URL infrastructure in Commit 5).
 *
 * Mirrors SIR's defense-at-boundary pattern: types are strict here,
 * the renderer coalesces missing fields at the output boundary.
 *
 * v2 IDX/Emolus prep: the `dataSource` field is set to 'manual' in v1.
 * v2 swaps to 'idx-feed' for fields auto-populated by Emolus. The Comp
 * type imported from SIR already carries per-field source + confidence.
 */

import type { Comp } from '@/tools/seller-intelligence-report/engine/types';

export type { Comp };

/** Whole-draft data provenance — 'manual' in v1 across the board. */
export type DataSource = 'manual' | 'idx-feed' | 'imported' | 'mixed';

export interface NeighborhoodFact {
  /** Short eyebrow label (e.g., "Walk score", "Median price", "Schools"). */
  label: string;
  /** Free-form value as the agent typed it (e.g., "82 / 100", "$680,000"). */
  value: string;
}

export interface OpenHousePrepDraft {
  // Event + property
  propertyAddress: string;
  propertyCity?: string;
  /** Optional image URL or data URL (browser-side prep flow). */
  propertyPhotoUrl?: string;
  /** Formatted list price as it should render (e.g., "$685,000"). */
  listPrice: string;
  beds?: string;
  baths?: string;
  squareFeet?: string;

  /** ISO YYYY-MM-DD. */
  eventDate: string;
  /** Free-form display string (e.g., "1:00 PM"). */
  eventStartTime?: string;
  eventEndTime?: string;

  /** Agent-written "why this home" paragraph. */
  positioningNarrative?: string;

  /** Comparable recent sales (≤4). Same shape as SIR's Comp. */
  comps: Comp[];

  /** Neighborhood quick-facts (4–6 typical). */
  neighborhoodFacts: NeighborhoodFact[];

  /** Agent-written 2-3 sentence market positioning. v2 IDX may auto-derive. */
  marketContext?: string;

  /** Library entry IDs the agent will lead with at the door. */
  selectedTalkingPointIds: string[];
  /** Per-entry text overrides — empty string falls through to library default. */
  talkingPointOverrides?: Record<string, string>;

  /** Library entry IDs printed on the prep doc for reference during the event. */
  selectedCommonQuestionIds: string[];
  commonQuestionOverrides?: Record<string, string>;

  /** Library entry IDs of conversion prompts agent plans to use. */
  selectedConversionPromptIds: string[];

  /** Agent's private pre-event prep notes — never appears on visitor handout. */
  preEventNotes?: string;

  /** Free-text commitments for post-event follow-up (≤10). */
  followUpCommitments: string[];

  /** v2 IDX prep — 'manual' in v1. */
  dataSource: DataSource;

  /** Color overrides (mirror SIR pattern). Empty falls through to BrandSettings. */
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

export const EMPTY_DRAFT: OpenHousePrepDraft = {
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
};

const VALID_DATA_SOURCES: readonly DataSource[] = [
  'manual',
  'idx-feed',
  'imported',
  'mixed',
] as const;

/**
 * Normalize a draft from any historical shape. Defense-at-boundary:
 * the type system is strict but this helper coalesces missing arrays /
 * strings to safe defaults so partial drafts (loaded from older
 * localStorage states) don't crash downstream.
 */
export function clampDraft(
  raw: Partial<OpenHousePrepDraft> | null | undefined,
): OpenHousePrepDraft {
  if (!raw) return { ...EMPTY_DRAFT };
  return {
    propertyAddress:
      typeof raw.propertyAddress === 'string' ? raw.propertyAddress : '',
    propertyCity:
      typeof raw.propertyCity === 'string' ? raw.propertyCity : undefined,
    propertyPhotoUrl:
      typeof raw.propertyPhotoUrl === 'string' ? raw.propertyPhotoUrl : undefined,
    listPrice: typeof raw.listPrice === 'string' ? raw.listPrice : '',
    beds: typeof raw.beds === 'string' ? raw.beds : undefined,
    baths: typeof raw.baths === 'string' ? raw.baths : undefined,
    squareFeet: typeof raw.squareFeet === 'string' ? raw.squareFeet : undefined,
    eventDate: typeof raw.eventDate === 'string' ? raw.eventDate : '',
    eventStartTime:
      typeof raw.eventStartTime === 'string' ? raw.eventStartTime : undefined,
    eventEndTime:
      typeof raw.eventEndTime === 'string' ? raw.eventEndTime : undefined,
    positioningNarrative:
      typeof raw.positioningNarrative === 'string'
        ? raw.positioningNarrative
        : undefined,
    comps: Array.isArray(raw.comps) ? raw.comps.slice(0, 4) : [],
    neighborhoodFacts: Array.isArray(raw.neighborhoodFacts)
      ? raw.neighborhoodFacts
          .filter(
            (f): f is NeighborhoodFact =>
              !!f &&
              typeof f === 'object' &&
              typeof (f as NeighborhoodFact).label === 'string' &&
              typeof (f as NeighborhoodFact).value === 'string',
          )
          .slice(0, 6)
      : [],
    marketContext:
      typeof raw.marketContext === 'string' ? raw.marketContext : undefined,
    selectedTalkingPointIds: Array.isArray(raw.selectedTalkingPointIds)
      ? raw.selectedTalkingPointIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
    talkingPointOverrides:
      raw.talkingPointOverrides && typeof raw.talkingPointOverrides === 'object'
        ? (raw.talkingPointOverrides as Record<string, string>)
        : undefined,
    selectedCommonQuestionIds: Array.isArray(raw.selectedCommonQuestionIds)
      ? raw.selectedCommonQuestionIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
    commonQuestionOverrides:
      raw.commonQuestionOverrides && typeof raw.commonQuestionOverrides === 'object'
        ? (raw.commonQuestionOverrides as Record<string, string>)
        : undefined,
    selectedConversionPromptIds: Array.isArray(raw.selectedConversionPromptIds)
      ? raw.selectedConversionPromptIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
    preEventNotes:
      typeof raw.preEventNotes === 'string' ? raw.preEventNotes : undefined,
    followUpCommitments: Array.isArray(raw.followUpCommitments)
      ? raw.followUpCommitments
          .filter((s): s is string => typeof s === 'string')
          .slice(0, 10)
      : [],
    dataSource: VALID_DATA_SOURCES.includes(raw.dataSource as DataSource)
      ? (raw.dataSource as DataSource)
      : 'manual',
    primaryColor:
      typeof raw.primaryColor === 'string' ? raw.primaryColor : undefined,
    accentColor:
      typeof raw.accentColor === 'string' ? raw.accentColor : undefined,
    backgroundColor:
      typeof raw.backgroundColor === 'string' ? raw.backgroundColor : undefined,
  };
}

/**
 * Validate a draft for export. Minimum requirements: propertyAddress,
 * listPrice, eventDate. Returns null on success, or the field name of
 * the first missing requirement.
 */
export function validateForExport(draft: OpenHousePrepDraft): string | null {
  if (!draft.propertyAddress.trim()) return 'propertyAddress';
  if (!draft.listPrice.trim()) return 'listPrice';
  if (!draft.eventDate.trim()) return 'eventDate';
  return null;
}

/** Lowercase URL-safe slug for the property address. Mirrors SIR. */
export function addressSlug(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
