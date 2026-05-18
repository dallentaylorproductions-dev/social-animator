import type { CallableSkill } from '@/skills/types';

/**
 * Open House Prep skill (OH Prep Commit 4 / Audit 1C §7).
 *
 * Dual-output: produces an agent-facing private prep PDF AND a
 * client-facing visitor handout web URL. First skill in the system
 * with two outputs at different audience types — the dual-output
 * pattern from Aaron's 2026-05-14 framing made concrete.
 *
 * Uses the existing `'url'` SkillOutputFormat (added in W-1 Half B
 * impl 1) — no enum extension required. Audit 1C §7.2 corrected the
 * 'web-url' naming the audit prompt anticipated.
 */
export const OPEN_HOUSE_PREP_SKILL: CallableSkill = {
  id: 'open-house-prep',
  name: 'Open House Prep',
  category: 'Open house',
  purpose:
    "Prepare for and convert your next open house — generate the agent's private prep doc plus a shareable visitor handout URL.",
  inputs: {
    required: [
      {
        key: 'propertyAddress',
        type: 'string',
        description: 'Property address',
        source: 'listing-profile',
      },
      {
        key: 'listPrice',
        type: 'string',
        description: 'List price',
        source: 'user-input',
      },
      {
        key: 'eventDate',
        type: 'date',
        description: 'Open house date (ISO YYYY-MM-DD)',
        source: 'user-input',
      },
    ],
    optional: [
      {
        key: 'propertyCity',
        type: 'string',
        description: 'City line',
        source: 'listing-profile',
      },
      {
        key: 'propertyPhotoUrl',
        type: 'photo',
        description: 'Hero photo URL or data URL',
        source: 'user-input',
      },
      {
        key: 'beds',
        type: 'string',
        description: 'Bedroom count',
        source: 'listing-profile',
      },
      {
        key: 'baths',
        type: 'string',
        description: 'Bathroom count',
        source: 'listing-profile',
      },
      {
        key: 'squareFeet',
        type: 'string',
        description: 'Square footage',
        source: 'listing-profile',
      },
      {
        key: 'eventStartTime',
        type: 'time',
        description: 'Event start time',
        source: 'user-input',
      },
      {
        key: 'eventEndTime',
        type: 'time',
        description: 'Event end time',
        source: 'user-input',
      },
      {
        key: 'positioningNarrative',
        type: 'string',
        description: "Agent's 'why this home' paragraph",
        source: 'user-input',
      },
      {
        key: 'comps',
        type: 'objectArray',
        description: 'Comparable recent sales (<=4)',
        source: 'user-input',
      },
      {
        key: 'neighborhoodFacts',
        type: 'objectArray',
        description: 'Neighborhood quick-facts (4-6)',
        source: 'user-input',
      },
      {
        key: 'marketContext',
        type: 'string',
        description: 'Market trend statement',
        source: 'user-input',
      },
      {
        key: 'selectedTalkingPointIds',
        type: 'stringArray',
        description: 'Library entry IDs of selected talking points',
        source: 'user-input',
      },
      {
        key: 'selectedCommonQuestionIds',
        type: 'stringArray',
        description: 'Library entry IDs of selected common questions',
        source: 'user-input',
      },
      {
        key: 'selectedConversionPromptIds',
        type: 'stringArray',
        description: 'Library entry IDs of selected conversion prompts',
        source: 'user-input',
      },
      {
        key: 'preEventNotes',
        type: 'string',
        description: "Agent's private prep notes (never on visitor handout)",
        source: 'user-input',
      },
      {
        key: 'followUpCommitments',
        type: 'stringArray',
        description: 'Post-event follow-up commitments',
        source: 'user-input',
      },
      {
        key: 'primaryColor',
        type: 'colorHex',
        description: 'Primary brand color override',
        source: 'agent-profile',
      },
      {
        key: 'accentColor',
        type: 'colorHex',
        description: 'Accent brand color override',
        source: 'agent-profile',
      },
      {
        key: 'backgroundColor',
        type: 'colorHex',
        description: 'Background color override',
        source: 'agent-profile',
      },
    ],
  },
  outputs: [
    {
      type: 'agent-facing',
      format: 'pdf',
      description:
        "Private prep document for the agent — talking points, comps, common questions, conversion prompts.",
      aspectRatio: 'letter',
    },
    {
      type: 'client-facing',
      format: 'url',
      description:
        'Mobile-first web handout URL the agent texts to visitors before, during, or after the event.',
    },
  ],
  costProfile: 'free',
  supportedStates: ['open_house_prep_state', 'open_house_active_state'],
  recommendedNextSkills: ['open-house-promo'],
};
