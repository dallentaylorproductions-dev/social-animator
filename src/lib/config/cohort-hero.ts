/**
 * When set, the dashboard hero "Up next" block is pinned to this skill id
 * and the smart activity-based recommendation engine is suppressed. Same
 * swappable shape as COHORT_LIVE_SKILLS / COHORT_EXAMPLE_URL — set during
 * a cohort/beta phase, set to null to restore the normal activity-based
 * hero. The activity engine itself is untouched; this only overrides
 * which skill the hero recommends.
 *
 * Cohort rationale (v1.47, 2026-06-01 cohort): "no choices" is the
 * product philosophy. For the cohort window the entire purpose is real
 * usage data on the flagship Seller Presentation, so the hero pins to
 * that one action rather than letting the activity engine fall through
 * to other live tools (Market Update, Stat Highlight, etc.).
 *
 * Post-cohort: set to null. The dashboard then falls through to the
 * existing activity-based hero (filtered by isLiveSkillForCohort from
 * the prior commit on this branch), byte-for-byte the v1.47 hero shape.
 */
export const COHORT_HERO_PINNED_SKILL: string | null = "seller-presentation";
