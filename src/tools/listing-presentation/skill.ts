import type { CallableSkill } from '@/skills/types';

export const LISTING_PRESENTATION_SKILL: CallableSkill = {
  id: 'listing-presentation',
  name: 'Listing Presentation One-Pager',
  purpose: 'Generate the document an agent brings to a seller appointment to win the listing',
  inputs: {
    required: [
      { key: 'propertyAddress', type: 'string', description: 'Property address', source: 'listing-profile' },
    ],
    optional: [
      { key: 'propertyCity', type: 'string', description: 'City line', source: 'listing-profile' },
      { key: 'ownerName', type: 'string', description: 'Seller name', source: 'user-input' },
      { key: 'agentBio', type: 'string', description: 'Agent bio (<=280 chars)', source: 'agent-profile' },
      { key: 'agentHeadshot', type: 'photo', description: 'Agent headshot', source: 'agent-profile' },
      { key: 'homesSold', type: 'string', description: 'Career homes sold (track record stat)', source: 'agent-profile' },
      { key: 'averageDaysOnMarket', type: 'string', description: 'Average DOM (track record stat)', source: 'agent-profile' },
      { key: 'saleToListRatio', type: 'string', description: 'Sale-to-list ratio (track record stat)', source: 'agent-profile' },
      { key: 'yearsExperience', type: 'string', description: 'Years in business', source: 'agent-profile' },
      { key: 'marketingStrategies', type: 'stringArray', description: 'Marketing strategy bullets (<=4)', source: 'user-input' },
      { key: 'comparableSales', type: 'objectArray', description: 'Comparable sales (<=3 with address/soldPrice/DOM/saleToListPct)', source: 'user-input' },
      { key: 'whyChooseMe', type: 'string', description: 'Why-choose-me paragraph (<=280 chars)', source: 'user-input' },
      { key: 'primaryColor', type: 'colorHex', description: 'Primary brand color override', source: 'agent-profile' },
      { key: 'accentColor', type: 'colorHex', description: 'Accent brand color override', source: 'agent-profile' },
      { key: 'backgroundColor', type: 'colorHex', description: 'Background color override', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'pdf', description: '1-page seller pitch document', aspectRatio: 'letter' },
    { type: 'client-facing', format: 'jpeg', description: 'Screen-share-ready page raster' },
  ],
  costProfile: 'free',
  supportedStates: ['seller_appointment_state', 'seller_conversion_state', 'pre_listing_state'],
  recommendedNextSkills: ['listing-flyer'],
  // Dual-output gap noted in audit: future Seller Intelligence Report skill
  // will be the agent-facing companion. Not yet built.
};
