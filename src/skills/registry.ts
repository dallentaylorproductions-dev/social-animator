import type {
  CallableSkill,
  SkillCategory,
  SkillId,
  WorkflowState,
} from './types';
import { LISTING_FLYER_SKILL } from '@/tools/listing-flyer/skill';
import { OPEN_HOUSE_PROMO_SKILL } from '@/tools/open-house-promo/skill';
import { LISTING_PRESENTATION_SKILL } from '@/tools/listing-presentation/skill';
import { SELLER_INTELLIGENCE_REPORT_SKILL } from '@/tools/seller-intelligence-report/skill';
import { OPEN_HOUSE_PREP_SKILL } from '@/tools/open-house-prep/skill';
import { SOCIAL_ANIMATOR_SKILLS } from '@/templates/skills';

/**
 * The complete registry of all callable skills in Studio SEP.
 *
 * The dashboard reads from this array to render "next best action" recommendations
 * and to look up skills by ID for invocation routing.
 *
 * Order is not semantically meaningful — sort at the call site if needed.
 */
export const ALL_SKILLS: CallableSkill[] = [
  LISTING_FLYER_SKILL,
  OPEN_HOUSE_PROMO_SKILL,
  LISTING_PRESENTATION_SKILL,
  SELLER_INTELLIGENCE_REPORT_SKILL,
  OPEN_HOUSE_PREP_SKILL,
  ...SOCIAL_ANIMATOR_SKILLS,
];

/**
 * Render order for /dashboard's "All skills" section. Preserves the
 * Marketing → Seller → Social sequence from before Commit 3's refactor.
 * Future categories append here as their skills land (e.g. 'Open house'
 * for the OH Prep tool in Commit 4).
 */
export const SKILL_CATEGORY_ORDER: readonly SkillCategory[] = [
  'Marketing assets',
  'Seller pitch',
  'Social content',
] as const;

/**
 * Return every skill assigned to a given category. The skill's `category`
 * field is required (TypeScript-enforced), so uncategorized skills are
 * impossible — the v1.44 dashboard-dropout bug class can no longer occur.
 */
export function getSkillsByCategory(category: SkillCategory): CallableSkill[] {
  return ALL_SKILLS.filter((skill) => skill.category === category);
}

/**
 * Bucket the registry by category in canonical render order, dropping
 * empty categories. The dashboard's `AllSkillsSection` consumes this
 * directly — no hardcoded ID-match filters remain after Commit 3.
 */
export function getCategorizedSkills(): Array<{
  category: SkillCategory;
  skills: CallableSkill[];
}> {
  return SKILL_CATEGORY_ORDER.map((category) => ({
    category,
    skills: getSkillsByCategory(category),
  })).filter((bucket) => bucket.skills.length > 0);
}

/**
 * Look up a skill by its ID. Returns null if not found (e.g. stale link).
 */
export function getSkillById(id: SkillId): CallableSkill | null {
  return ALL_SKILLS.find((skill) => skill.id === id) ?? null;
}

/**
 * Get all skills that support a given workflow state.
 * Used by the dashboard to render state-aware "next best action" cards.
 */
export function getSkillsForState(state: WorkflowState): CallableSkill[] {
  return ALL_SKILLS.filter((skill) => skill.supportedStates.includes(state));
}

/**
 * Look up the recommended next skills after a given skill completes.
 * Used by the dashboard to render "do this next" chaining suggestions.
 * Returns the resolved skill records (skipping any unresolved IDs, which
 * may point to skills not yet built per the audit's gap analysis).
 */
export function getRecommendedNextSkills(skillId: SkillId): CallableSkill[] {
  const skill = getSkillById(skillId);
  if (!skill?.recommendedNextSkills) return [];
  return skill.recommendedNextSkills
    .map((id) => getSkillById(id))
    .filter((s): s is CallableSkill => s !== null);
}
