import type { CallableSkill, SkillId, WorkflowState } from './types';
import { LISTING_FLYER_SKILL } from '@/tools/listing-flyer/skill';
import { OPEN_HOUSE_PROMO_SKILL } from '@/tools/open-house-promo/skill';
import { LISTING_PRESENTATION_SKILL } from '@/tools/listing-presentation/skill';
import { SELLER_INTELLIGENCE_REPORT_SKILL } from '@/tools/seller-intelligence-report/skill';
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
  ...SOCIAL_ANIMATOR_SKILLS,
];

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
