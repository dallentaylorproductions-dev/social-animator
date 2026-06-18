/**
 * Onboarding first-run V2 (ONBOARDING_FIRST_RUN_V2) - the ambient spotlight
 * lines, one per beat. Each is a single ignorable sentence that teaches the
 * PRODUCT belief of its beat ("why this matters to you"), never a backend system
 * and never scaffolding (no internal terms, no "this is a beat", no component
 * names). The real State A slice does the teaching; this is just the quiet
 * caption beneath it.
 *
 * Kept as a tested constant (mirroring V1's `ONBOARDING_SPOTLIGHTS`) so the
 * honest-copy guard can assert: no em-dash, no hyphen-as-dash, no backend noun,
 * one short line each.
 */
export const ONBOARDING_V2_SPOTLIGHTS = {
  name: 'No long profile to fill out. The page builds itself as you go.',
  address: 'The street address is enough. Watch what one address does.',
  hero: 'Sellers open to your name and your face, before a word is read.',
  brief: 'Real homework on this home, done before you ever meet.',
  valuation: 'No guessing. You review the number before the seller sees it.',
  campaign: "Pick how you win. It becomes this page's launch story.",
  trust: 'One real review does more than a wall of badges. Skip it if you like.',
  contact: 'A page they can act on. You can add anything else later.',
  sample: 'Built around one demo address. Yours starts blank and becomes real.',
} as const;

export type OnboardingV2SpotlightKey = keyof typeof ONBOARDING_V2_SPOTLIGHTS;
