import type { CallableSkill } from '@/skills/types';

export const OPEN_HOUSE_PROMO_SKILL: CallableSkill = {
  id: 'open-house-promo',
  name: 'Open House Promo Generator',
  purpose: 'Generate event-day marketing assets (PDF + JPEG + MP4 + QR) for an open house',
  category: 'Marketing assets',
  inputs: {
    required: [
      { key: 'eventDate', type: 'date', description: 'Open house date (YYYY-MM-DD)', source: 'user-input' },
      { key: 'eventStartTime', type: 'time', description: 'Start time (HH:mm)', source: 'user-input' },
      { key: 'propertyAddress', type: 'string', description: 'Property address', source: 'listing-profile' },
    ],
    optional: [
      { key: 'eventEndTime', type: 'time', description: 'End time', source: 'user-input' },
      { key: 'propertyCity', type: 'string', description: 'City line', source: 'listing-profile' },
      { key: 'listingPrice', type: 'string', description: 'List price', source: 'listing-profile' },
      { key: 'description', type: 'string', description: 'Event description', source: 'user-input' },
      { key: 'propertyHighlights', type: 'stringArray', description: 'Highlight bullets (<=5)', source: 'user-input' },
      { key: 'photos', type: 'photoArray', description: 'Property photos (<=5)', source: 'user-input' },
      { key: 'qrTargetUrl', type: 'url', description: 'QR code target URL (required for QR output)', source: 'user-input' },
      { key: 'eventNotes', type: 'string', description: 'Notes for visitors', source: 'user-input' },
      { key: 'primaryColor', type: 'colorHex', description: 'Primary brand color override', source: 'agent-profile' },
      { key: 'accentColor', type: 'colorHex', description: 'Accent brand color override', source: 'agent-profile' },
      { key: 'backgroundColor', type: 'colorHex', description: 'Background color override', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'pdf', description: 'Open-house event flyer', aspectRatio: 'letter' },
    { type: 'client-facing', format: 'jpeg', description: 'Social-shareable open-house promo' },
    { type: 'client-facing', format: 'mp4', description: 'Vertical reel announcing the open house', aspectRatio: '9:16' },
    { type: 'client-facing', format: 'mp4', description: 'Square for Instagram', aspectRatio: '1:1' },
    { type: 'client-facing', format: 'png', description: 'Standalone QR code targeting qrTargetUrl' },
  ],
  costProfile: 'free',
  supportedStates: ['open_house_state', 'pre_event_state'],
  // recommendedNextSkills intentionally empty — future Showing Tour Page and
  // Open House Walking Guide skills don't exist yet; updating once they ship.
};
