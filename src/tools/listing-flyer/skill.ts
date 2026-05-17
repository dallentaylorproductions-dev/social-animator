import type { CallableSkill } from '@/skills/types';

export const LISTING_FLYER_SKILL: CallableSkill = {
  id: 'listing-flyer',
  name: 'Listing Flyer Generator',
  purpose: 'Generate branded marketing assets (PDF + JPEG + MP4) for a single listing',
  inputs: {
    required: [
      { key: 'propertyAddress', type: 'string', description: 'Property address', source: 'listing-profile' },
      { key: 'price', type: 'string', description: 'List price', source: 'listing-profile' },
      { key: 'photos', type: 'photoArray', description: 'Listing photos (>=1)', source: 'user-input' },
    ],
    optional: [
      { key: 'status', type: 'enum', description: 'Listing status (Just Listed / Coming Soon / etc.)', source: 'listing-profile' },
      { key: 'addressLine2', type: 'string', description: 'City/state line', source: 'listing-profile' },
      { key: 'beds', type: 'number', description: 'Bedrooms', source: 'listing-profile' },
      { key: 'baths', type: 'number', description: 'Bathrooms', source: 'listing-profile' },
      { key: 'sqft', type: 'number', description: 'Square footage', source: 'listing-profile' },
      { key: 'features', type: 'stringArray', description: 'Feature bullets (<=5)', source: 'user-input' },
      { key: 'primaryColor', type: 'colorHex', description: 'Primary brand color override', source: 'agent-profile' },
      { key: 'accentColor', type: 'colorHex', description: 'Accent brand color override', source: 'agent-profile' },
      { key: 'backgroundColor', type: 'colorHex', description: 'Background color override', source: 'agent-profile' },
      { key: 'duration', type: 'number', description: 'MP4 duration in seconds (5-15)', source: 'user-input' },
      { key: 'exportFormats', type: 'enum', description: 'Reel and/or square MP4 formats', source: 'user-input' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'pdf', description: 'Print-ready 1-page flyer', aspectRatio: 'letter' },
    { type: 'client-facing', format: 'jpeg', description: 'Camera-roll-friendly social image', aspectRatio: '1080x1350' },
    { type: 'client-facing', format: 'mp4', description: 'Vertical reel for Stories/Reels/TikTok', aspectRatio: '9:16' },
    { type: 'client-facing', format: 'mp4', description: 'Square for Instagram feed', aspectRatio: '1:1' },
  ],
  costProfile: 'free',
  supportedStates: ['listing_launch_state', 'just_sold_state', 'price_reduction_state', 'listing_live_state'],
  recommendedNextSkills: ['social-animator-listing-carousel', 'social-animator-listing-card'],
};
