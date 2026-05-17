import type { CallableSkill, WorkflowState } from '@/skills/types';
import { getSkillById } from '@/skills/registry';

/**
 * A workflow is a user-facing grouping of skills bound together by a shared
 * operational context (e.g. "I just got a new listing"). The dashboard
 * surfaces workflows as primary "next best action" cards; each card resolves
 * to the workflow's first skill and chains via recommendedNextSkills.
 *
 * Phase 1 wires 5 of the 7 named workflows per W-1 Half B audit section 5:
 *   1. Listing Launch OS
 *   2. Open House OS
 *   4. Momentum Engine (partial — full needs Phase 2 behavior tracking)
 *   5. Seller Win System (agent half — wired when SIR shipped)
 *   6. Content Engine
 *
 * Workflows 3 (Buyer Tour) and 7 (Authority foundation) require new skills
 * that don't exist yet per the gap analysis.
 */

export interface Workflow {
  id: string;
  name: string;
  emotionalDriver: string;
  triggerStates: WorkflowState[];
  primarySkillId: string;
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'listing-launch',
    name: 'Launch your listing',
    emotionalDriver: 'Make your launch feel polished and organized.',
    triggerStates: ['listing_launch_state'],
    primarySkillId: 'listing-flyer',
  },
  {
    id: 'open-house',
    name: 'Promote your open house',
    emotionalDriver: "Make your open house feel cohesive and high-end.",
    triggerStates: ['open_house_state', 'pre_event_state', 'event_today_state'],
    primarySkillId: 'open-house-promo',
  },
  {
    id: 'momentum',
    name: 'Keep your momentum',
    emotionalDriver: "Don't let leads slip through the cracks.",
    triggerStates: ['post_event_state', 'lead_decay_state', 'follow_up_state'],
    // Phase 1 partial: the dedicated Follow-Up Template Skill doesn't exist
    // yet (audit section 6 critical gap). Falling back to the closest existing
    // fit until that skill ships.
    primarySkillId: 'social-animator-testimonial-card',
  },
  {
    id: 'content',
    name: 'Stay visible',
    emotionalDriver: 'Stay top-of-mind without it consuming your life.',
    triggerStates: ['visibility_gap_state'],
    primarySkillId: 'social-animator-market-update',
  },
  {
    id: 'seller-win',
    name: 'Seller Win System',
    emotionalDriver: 'Prep for and convert your next listing appointment.',
    triggerStates: [
      'pre_listing_state',
      'seller_appointment_state',
      'seller_conversion_state',
    ],
    primarySkillId: 'seller-intelligence-report',
  },
];

// 'seller-win' slots between listing-launch and momentum: winning the listing
// is a launch-precursor, so when it surfaces it ranks above general momentum
// and content cadences but below an active launch in progress.
const PRIORITY_ORDER = ['listing-launch', 'seller-win', 'momentum', 'content', 'open-house'];

/**
 * Find workflows whose trigger states overlap with the agent's active states.
 * Returns workflows in team-hypothesis priority order (audit TL;DR).
 */
export function getActiveWorkflows(activeStates: WorkflowState[]): Workflow[] {
  const matched = WORKFLOWS.filter((w) =>
    w.triggerStates.some((state) => activeStates.includes(state))
  );

  return matched.sort((a, b) => {
    const aIdx = PRIORITY_ORDER.indexOf(a.id);
    const bIdx = PRIORITY_ORDER.indexOf(b.id);
    return aIdx - bIdx;
  });
}

export function getWorkflowPrimarySkill(workflow: Workflow): CallableSkill | null {
  return getSkillById(workflow.primarySkillId);
}
