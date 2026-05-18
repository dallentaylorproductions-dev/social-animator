/**
 * CallableSkill records for the 10 Social Animator templates.
 *
 * Each template is a distinct skill in the OS registry: they share an
 * implementation (TemplateEditor + ExportButton + the shared MP4 pipeline)
 * but are recommended independently by the dashboard based on the workflow
 * state. ID convention: `social-animator-<template-id>`.
 *
 * State mappings come from the W-1 Half B audit § 4.4 table.
 */

import type { CallableSkill } from '@/skills/types';

// ---------- Listing-facing templates ----------

export const SOCIAL_ANIMATOR_LISTING_CARD_SKILL: CallableSkill = {
  id: 'social-animator-listing-card',
  name: 'Listing Card',
  purpose: 'Compact single-listing card — quick social post for a new or sold listing',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'heroPhoto', type: 'photo', description: 'Listing photo', source: 'listing-profile' },
      { key: 'address', type: 'string', description: 'Street address', source: 'listing-profile' },
      { key: 'price', type: 'string', description: 'List price', source: 'listing-profile' },
    ],
    optional: [
      { key: 'status', type: 'string', description: 'Status badge (Just Listed, etc.)', source: 'listing-profile' },
      { key: 'cityState', type: 'string', description: 'City/state line', source: 'listing-profile' },
      { key: 'beds', type: 'number', description: 'Bedrooms', source: 'listing-profile' },
      { key: 'baths', type: 'number', description: 'Bathrooms', source: 'listing-profile' },
      { key: 'sqft', type: 'number', description: 'Square footage', source: 'listing-profile' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '8s listing card reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['listing_launch_state', 'just_sold_state'],
  recommendedNextSkills: ['social-animator-listing-showcase', 'social-animator-listing-carousel', 'listing-flyer'],
};

export const SOCIAL_ANIMATOR_LISTING_SHOWCASE_SKILL: CallableSkill = {
  id: 'social-animator-listing-showcase',
  name: 'Listing Showcase Reel',
  purpose: '8-second animated reveal of a single listing — hero zoom + price + features + agent card',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'heroPhoto', type: 'photo', description: 'Hero photo', source: 'listing-profile' },
      { key: 'address', type: 'string', description: 'Property address', source: 'listing-profile' },
      { key: 'price', type: 'string', description: 'List price', source: 'listing-profile' },
      { key: 'status', type: 'string', description: 'Listing status', source: 'listing-profile' },
    ],
    optional: [
      { key: 'cityState', type: 'string', description: 'City/state line', source: 'listing-profile' },
      { key: 'beds', type: 'number', description: 'Bedrooms', source: 'listing-profile' },
      { key: 'baths', type: 'number', description: 'Bathrooms', source: 'listing-profile' },
      { key: 'sqft', type: 'number', description: 'Square footage', source: 'listing-profile' },
      { key: 'features', type: 'stringArray', description: 'Feature bullets (<=5)', source: 'user-input' },
      { key: 'primaryColor', type: 'colorHex', description: 'Status badge color', source: 'agent-profile' },
      { key: 'accentColor', type: 'colorHex', description: 'Price color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', aspectRatio: '1080x1350', description: '8s vertical listing reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['listing_launch_state', 'just_sold_state'],
  recommendedNextSkills: ['social-animator-listing-carousel', 'listing-flyer'],
};

export const SOCIAL_ANIMATOR_LISTING_CAROUSEL_SKILL: CallableSkill = {
  id: 'social-animator-listing-carousel',
  name: 'Listing Carousel',
  purpose: 'Multi-photo carousel showcasing a listing’s hero + interior shots',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'images', type: 'objectArray', description: 'Carousel photos with optional captions', source: 'user-input' },
    ],
    optional: [
      { key: 'title', type: 'string', description: 'Title overlay (e.g. address)', source: 'listing-profile' },
      { key: 'subtitle', type: 'string', description: 'Subtitle overlay (e.g. Open House Sat 1-4pm)', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '10s carousel reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['listing_launch_state'],
  recommendedNextSkills: ['social-animator-listing-showcase', 'listing-flyer'],
};

// ---------- Conversion + transformation templates ----------

export const SOCIAL_ANIMATOR_BEFORE_AFTER_SKILL: CallableSkill = {
  id: 'social-animator-before-after',
  name: 'Before / After',
  purpose: 'Before/after reveal for staging, renovation, or seasonal transformations',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'beforePhoto', type: 'photo', description: 'Before photo', source: 'user-input' },
      { key: 'afterPhoto', type: 'photo', description: 'After photo', source: 'user-input' },
    ],
    optional: [
      { key: 'title', type: 'string', description: 'Headline (e.g. Staging Magic)', source: 'user-input' },
      { key: 'beforeLabel', type: 'string', description: 'Before label', source: 'user-input' },
      { key: 'afterLabel', type: 'string', description: 'After label', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '8s before/after transformation' },
  ],
  costProfile: 'free',
  supportedStates: ['just_sold_state'],
  recommendedNextSkills: ['social-animator-testimonial-card'],
};

// ---------- Authority + visibility templates ----------

export const SOCIAL_ANIMATOR_QA_CARD_SKILL: CallableSkill = {
  id: 'social-animator-qa-card',
  name: 'Q&A Card',
  purpose: 'Pose a question, reveal the answer — great for market tips and buyer FAQs',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'questionText', type: 'string', description: 'The question', source: 'user-input' },
      { key: 'answerText', type: 'string', description: 'The answer', source: 'user-input' },
    ],
    optional: [
      { key: 'titleText', type: 'string', description: 'Header label (default "Q&A")', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '10s question-and-answer reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['authority_building_state', 'visibility_gap_state'],
  recommendedNextSkills: ['social-animator-testimonial-card', 'social-animator-stat-highlight'],
};

export const SOCIAL_ANIMATOR_TESTIMONIAL_CARD_SKILL: CallableSkill = {
  id: 'social-animator-testimonial-card',
  name: 'Testimonial Card',
  purpose: 'Animated client testimonial card — social proof for the authority feed',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'quoteText', type: 'string', description: 'The testimonial quote', source: 'user-input' },
      { key: 'attribution', type: 'string', description: 'Attribution (e.g. "Sarah M., 2025 buyer")', source: 'user-input' },
    ],
    optional: [
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '8s testimonial reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['authority_building_state'],
  recommendedNextSkills: ['social-animator-qa-card', 'social-animator-stat-highlight'],
};

export const SOCIAL_ANIMATOR_NUMBERED_PROCESS_SKILL: CallableSkill = {
  id: 'social-animator-numbered-process',
  name: 'Numbered Process',
  purpose: '"5 steps to X" animated explainer — agent expertise content',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'title', type: 'string', description: 'Process title (e.g. "Buying Your First Home")', source: 'user-input' },
      { key: 'step1Title', type: 'string', description: 'Step 1 title', source: 'user-input' },
      { key: 'step1Body', type: 'string', description: 'Step 1 body', source: 'user-input' },
    ],
    optional: [
      { key: 'step2Title', type: 'string', description: 'Step 2 title', source: 'user-input' },
      { key: 'step2Body', type: 'string', description: 'Step 2 body', source: 'user-input' },
      { key: 'step3Title', type: 'string', description: 'Step 3 title', source: 'user-input' },
      { key: 'step3Body', type: 'string', description: 'Step 3 body', source: 'user-input' },
      { key: 'step4Title', type: 'string', description: 'Step 4 title', source: 'user-input' },
      { key: 'step4Body', type: 'string', description: 'Step 4 body', source: 'user-input' },
      { key: 'step5Title', type: 'string', description: 'Step 5 title', source: 'user-input' },
      { key: 'step5Body', type: 'string', description: 'Step 5 body', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '12s numbered-step explainer' },
  ],
  costProfile: 'free',
  supportedStates: ['authority_building_state', 'visibility_gap_state'],
  recommendedNextSkills: ['social-animator-qa-card', 'social-animator-grid-comparison'],
};

export const SOCIAL_ANIMATOR_GRID_COMPARISON_SKILL: CallableSkill = {
  id: 'social-animator-grid-comparison',
  name: 'Grid Comparison',
  purpose: '4-cell comparison grid (e.g. neighborhoods, pricing tiers, agent vs FSBO)',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'title', type: 'string', description: 'Grid title', source: 'user-input' },
      { key: 'card1Title', type: 'string', description: 'Card 1 title', source: 'user-input' },
      { key: 'card2Title', type: 'string', description: 'Card 2 title', source: 'user-input' },
      { key: 'card3Title', type: 'string', description: 'Card 3 title', source: 'user-input' },
      { key: 'card4Title', type: 'string', description: 'Card 4 title', source: 'user-input' },
    ],
    optional: [
      { key: 'card1Icon', type: 'string', description: 'Card 1 emoji icon', source: 'user-input' },
      { key: 'card1Body', type: 'string', description: 'Card 1 body', source: 'user-input' },
      { key: 'card2Icon', type: 'string', description: 'Card 2 emoji icon', source: 'user-input' },
      { key: 'card2Body', type: 'string', description: 'Card 2 body', source: 'user-input' },
      { key: 'card3Icon', type: 'string', description: 'Card 3 emoji icon', source: 'user-input' },
      { key: 'card3Body', type: 'string', description: 'Card 3 body', source: 'user-input' },
      { key: 'card4Icon', type: 'string', description: 'Card 4 emoji icon', source: 'user-input' },
      { key: 'card4Body', type: 'string', description: 'Card 4 body', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '10s 4-cell comparison reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['authority_building_state', 'visibility_gap_state'],
  recommendedNextSkills: ['social-animator-numbered-process', 'social-animator-stat-highlight'],
};

export const SOCIAL_ANIMATOR_STAT_HIGHLIGHT_SKILL: CallableSkill = {
  id: 'social-animator-stat-highlight',
  name: 'Stat Highlight',
  purpose: 'Big-number stat card with context + supporting line — authority cadence content',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'stat', type: 'string', description: 'The headline stat (e.g. "$2.4M", "47%", "3 Homes")', source: 'user-input' },
      { key: 'context', type: 'string', description: 'Context line above the stat', source: 'user-input' },
    ],
    optional: [
      { key: 'supporting', type: 'string', description: 'Supporting line below the stat', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '8s stat highlight reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['authority_building_state', 'visibility_gap_state'],
  recommendedNextSkills: ['social-animator-market-update', 'social-animator-testimonial-card'],
};

export const SOCIAL_ANIMATOR_MARKET_UPDATE_SKILL: CallableSkill = {
  id: 'social-animator-market-update',
  name: 'Market Update',
  purpose: 'Periodic market update with 4 stats + brief — the visibility-cadence workhorse',
  category: 'Social content',
  inputs: {
    required: [
      { key: 'title', type: 'string', description: 'Update title', source: 'user-input' },
      { key: 'stat1Label', type: 'string', description: 'Stat 1 label', source: 'user-input' },
      { key: 'stat1Value', type: 'string', description: 'Stat 1 value', source: 'user-input' },
      { key: 'stat2Label', type: 'string', description: 'Stat 2 label', source: 'user-input' },
      { key: 'stat2Value', type: 'string', description: 'Stat 2 value', source: 'user-input' },
      { key: 'stat3Label', type: 'string', description: 'Stat 3 label', source: 'user-input' },
      { key: 'stat3Value', type: 'string', description: 'Stat 3 value', source: 'user-input' },
      { key: 'stat4Label', type: 'string', description: 'Stat 4 label', source: 'user-input' },
      { key: 'stat4Value', type: 'string', description: 'Stat 4 value', source: 'user-input' },
    ],
    optional: [
      { key: 'subtitle', type: 'string', description: 'Subtitle line', source: 'user-input' },
      { key: 'primary', type: 'colorHex', description: 'Primary color', source: 'agent-profile' },
      { key: 'accent', type: 'colorHex', description: 'Accent color', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'client-facing', format: 'mp4', description: '8s market-update reveal' },
  ],
  costProfile: 'free',
  supportedStates: ['visibility_gap_state'],
  recommendedNextSkills: ['social-animator-stat-highlight', 'social-animator-grid-comparison'],
};

/**
 * Convenience array of all 10 Social Animator template skills.
 * Order matches src/templates/index.ts ALL_TEMPLATES for consistency.
 */
export const SOCIAL_ANIMATOR_SKILLS: CallableSkill[] = [
  SOCIAL_ANIMATOR_QA_CARD_SKILL,
  SOCIAL_ANIMATOR_LISTING_CARD_SKILL,
  SOCIAL_ANIMATOR_LISTING_SHOWCASE_SKILL,
  SOCIAL_ANIMATOR_LISTING_CAROUSEL_SKILL,
  SOCIAL_ANIMATOR_BEFORE_AFTER_SKILL,
  SOCIAL_ANIMATOR_TESTIMONIAL_CARD_SKILL,
  SOCIAL_ANIMATOR_NUMBERED_PROCESS_SKILL,
  SOCIAL_ANIMATOR_GRID_COMPARISON_SKILL,
  SOCIAL_ANIMATOR_STAT_HIGHLIGHT_SKILL,
  SOCIAL_ANIMATOR_MARKET_UPDATE_SKILL,
];
