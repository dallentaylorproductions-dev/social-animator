import type { CallableSkill } from '@/skills/types';

/**
 * First agent-facing skill in the system.
 *
 * outputs[0].type === 'agent-facing' — closes the dual-output gap that
 * was 0-for-4 across the four pre-SIR tools. Per W-1 Half B audit § 4.3,
 * this was the highest-value single gap in the codebase.
 */
export const SELLER_INTELLIGENCE_REPORT_SKILL: CallableSkill = {
  id: 'seller-intelligence-report',
  name: 'Seller Intelligence Report',
  purpose:
    "Generate the agent's private prep document for a listing appointment — comps, talking points, pricing strategy, and operational notes.",
  category: 'Seller pitch',
  inputs: {
    required: [
      { key: 'propertyAddress', type: 'string', description: 'Property address', source: 'listing-profile' },
      { key: 'recommendedListPrice', type: 'string', description: "Agent's recommended list price", source: 'user-input' },
    ],
    optional: [
      { key: 'propertyCity', type: 'string', description: 'City/state line', source: 'listing-profile' },
      { key: 'ownerName', type: 'string', description: 'Seller name (used in greetings)', source: 'user-input' },
      { key: 'pricingStrategyId', type: 'enum', description: 'Selected pricing strategy framework', source: 'user-input' },
      { key: 'confidence', type: 'enum', description: "Agent's confidence in the comp set (drives price range bracket)", source: 'user-input' },
      { key: 'comps', type: 'objectArray', description: 'Comparable sales (<=4) with address, sold price, DOM, ratio, sqft, distance, notes', source: 'user-input' },
      { key: 'selectedObjectionIds', type: 'stringArray', description: 'IDs of objection talking points selected from the library', source: 'user-input' },
      { key: 'objectionOverrides', type: 'objectArray', description: 'Per-objection custom response overrides', source: 'user-input' },
      { key: 'preAppointmentNotes', type: 'string', description: "Agent's private context notes for this appointment", source: 'user-input' },
      { key: 'commitments', type: 'stringArray', description: 'What the agent promises if the seller signs', source: 'user-input' },
      { key: 'asks', type: 'stringArray', description: 'What the agent needs from the seller', source: 'user-input' },
      { key: 'agentBio', type: 'string', description: 'Agent bio for footer credibility', source: 'agent-profile' },
      { key: 'homesSold', type: 'string', description: 'Career homes sold (track record stat)', source: 'agent-profile' },
      { key: 'averageDaysOnMarket', type: 'string', description: 'Average DOM (track record stat)', source: 'agent-profile' },
      { key: 'saleToListRatio', type: 'string', description: 'Sale-to-list ratio (track record stat)', source: 'agent-profile' },
      { key: 'yearsExperience', type: 'string', description: 'Years in business', source: 'agent-profile' },
      { key: 'primaryColor', type: 'colorHex', description: 'Primary brand color override', source: 'agent-profile' },
      { key: 'accentColor', type: 'colorHex', description: 'Accent brand color override', source: 'agent-profile' },
      { key: 'backgroundColor', type: 'colorHex', description: 'Background color override', source: 'agent-profile' },
    ],
  },
  outputs: [
    {
      type: 'agent-facing',
      format: 'pdf',
      description: '1-2 page private prep document for the listing appointment',
      aspectRatio: 'letter',
    },
  ],
  costProfile: 'free',
  supportedStates: ['pre_listing_state', 'seller_appointment_state', 'seller_conversion_state'],
  recommendedNextSkills: ['listing-presentation'],
};
