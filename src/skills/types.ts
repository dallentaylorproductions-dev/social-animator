/**
 * Studio SEP — Callable Skill Type Definitions
 *
 * The OS framing: every tool in Studio SEP exposes a CallableSkill record.
 * The dashboard reads this metadata to render "next best action" recommendations
 * and route invocations. Skill metadata is pure declaration — no runtime behavior.
 *
 * Defined here in `src/skills/` (cross-cutting) rather than co-located with
 * a single tool, because multiple tools share these types.
 *
 * Per W-1 Half B architecture audit (2026-05-14):
 * - tierGate intentionally NOT in this interface; pricing is a dashboard concern
 * - Phase 1 contract is intentionally narrow; extensions deferred to later phases
 */

export type SkillId = string; // kebab-case, e.g. 'listing-flyer', 'social-animator-listing-showcase'

/**
 * Display-string union for dashboard "All skills" bucketing.
 *
 * The string IS the display label rendered on /dashboard's SkillGroup
 * headings — keep capitalization matching the current UI (Sentence case
 * — first word capitalized, second word lowercase). Adding a new
 * category here is the one place new skill surfaces declare their home.
 *
 * Order is fixed by `SKILL_CATEGORY_ORDER` in src/skills/registry.ts.
 *
 * Future categories (added as their tools land):
 *   - 'Open house' for the OH Prep tool (Commit 4)
 *   - 'Showing flow' for Buyer Tour Page + Buyer Consultation Guide
 *   - 'Authority' for the Authority Page surface
 */
export type SkillCategory =
  | 'Marketing assets'
  | 'Seller pitch'
  | 'Social content';

export type SkillInputType =
  | 'string'
  | 'number'
  | 'date'           // ISO YYYY-MM-DD
  | 'time'           // HH:mm
  | 'photo'
  | 'photoArray'
  | 'stringArray'
  | 'colorHex'
  | 'url'
  | 'enum'
  | 'objectArray';

export type SkillInputSource =
  | 'agent-profile'    // auto-injected from BrandSettings
  | 'listing-profile'  // auto-injected from ListingProfile
  | 'event'            // from a scheduled event (Phase 3, calendar integration)
  | 'prior-skill'      // chained from another skill's output
  | 'user-input';      // typed by the agent at invocation time

export interface SkillInputSpec {
  key: string;
  type: SkillInputType;
  description: string;
  source?: SkillInputSource; // defaults to 'user-input' if omitted
}

export type SkillOutputFormat =
  | 'pdf'
  | 'jpeg'
  | 'png'
  | 'mp4'
  | 'html'
  | 'text'
  | 'json'
  | 'url';

export type SkillOutputAspectRatio =
  | '9:16'
  | '1:1'
  | '1080x1350'
  | 'letter'
  | 'a4';

export interface SkillOutput {
  type: 'client-facing' | 'agent-facing';
  format: SkillOutputFormat;
  description: string;
  aspectRatio?: SkillOutputAspectRatio;
}

export type WorkflowState =
  // Listing lifecycle
  | 'pre_listing_state'
  | 'listing_launch_state'
  | 'listing_live_state'
  | 'price_reduction_state'
  | 'just_sold_state'
  // Buyer side
  | 'buyer_tour_state'
  | 'showing_today_state'
  | 'post_showing_state'
  // Open house
  | 'open_house_state'
  | 'pre_event_state'
  | 'event_today_state'
  | 'post_event_state'
  // Conversion / pitching
  | 'seller_appointment_state'
  | 'seller_conversion_state'
  // Marketing cadence
  | 'visibility_gap_state'
  | 'authority_building_state'
  // Lead lifecycle
  | 'lead_decay_state'
  | 'follow_up_state';

export interface CallableSkill {
  id: SkillId;
  name: string;
  purpose: string;
  /**
   * Dashboard bucket assignment for /dashboard's "All skills" section.
   * Required so TypeScript flags any new skill that forgets to declare
   * its bucket — this is the root-cause fix for the v1.44.1 hot patch.
   */
  category: SkillCategory;
  inputs: {
    required: SkillInputSpec[];
    optional: SkillInputSpec[];
  };
  outputs: SkillOutput[];
  costProfile: 'free' | 'fixed' | 'variable-ai';
  supportedStates: WorkflowState[];
  recommendedNextSkills?: SkillId[];
}
