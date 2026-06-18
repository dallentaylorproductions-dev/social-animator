/**
 * Onboarding ambient spotlights (Onboarding redesign, Pass 2) - PURE copy.
 *
 * Five product-belief one-liners, each keyed to the moment it rides on. They
 * teach VALUE, never the backend: no property-data source, no Street View, no
 * beacon, no "AI". Kept in a pure module (no React) so a spec can assert there
 * are at most five and that none names a backend system or over-claims.
 *
 * Each line is ONE short sentence, shown inline and dismissable - never a
 * blocking modal (see Spotlight.tsx for the presentation).
 */
export const ONBOARDING_SPOTLIGHTS = {
  address: 'Type an address, and your page is prepared around it.',
  preview: 'Walk into the appointment with the page already prepared.',
  identity: 'Set your details once. Every page you make reuses them.',
  trust: 'Add your wins once, and they make every future page stronger.',
  cockpit: 'Your pages quietly show you who has been looking.',
} as const;

export type OnboardingSpotlightKey = keyof typeof ONBOARDING_SPOTLIGHTS;
