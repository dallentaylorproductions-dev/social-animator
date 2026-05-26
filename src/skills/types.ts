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
  | 'Social content'
  | 'Open house';

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
  // Open house prep (Commit 4 — wired by state-detection in Commit 6)
  | 'open_house_prep_state'
  | 'open_house_active_state'
  // Conversion / pitching
  | 'seller_appointment_state'
  | 'seller_conversion_state'
  // Marketing cadence
  | 'visibility_gap_state'
  | 'authority_building_state'
  // Lead lifecycle
  | 'lead_decay_state'
  | 'follow_up_state';

/**
 * Per-skill availability declaration (Substrate §3.2 + §8.5, v1.47 /
 * A7f.2). Each dimension carries the MINIMUM tier required for full
 * (unlocked) access. The single entitlement resolver in
 * src/lib/entitlements/resolver.ts joins this with the agent's
 * EntitlementContext to produce a ResolvedSkill — no surface re-derives.
 *
 * Optional on `CallableSkill` so skills that haven't declared yet
 * continue to compile and resolve to fully-available (no-op gating).
 * Today only the Seller Presentation declares; later packets backfill
 * the rest as their gate shapes get drawn.
 */
export interface SkillAvailability {
  /** Tier required to RUN the core workflow at all. Most skills: 'base'. */
  baseWorkflow?: 'base' | 'pro' | 'ai';
  /** Tier required to publish PREMIUM themes (Base theme is always free). */
  premiumThemes?: 'base' | 'pro' | 'ai';
  /** Tier required to use AI plug-points (Category 1 friction-AI). */
  aiPlugPoints?: 'base' | 'pro' | 'ai';
}

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
  /**
   * Per-dimension tier requirements (Substrate §3.2). Consumed by the
   * single resolver in src/lib/entitlements/resolver.ts; surfaces never
   * read this directly. Optional during the per-skill rollout.
   */
  availability?: SkillAvailability;
}

// ----- SkillStatus + SkillRuntime (Substrate §3.2 + §3.3, v1.47 / A4) -----
//
// The orchestration-readable status surface. `CallableSkill` (above) is
// the STATIC skill contract — pure declaration the dashboard reads to
// list, route, and chain skills. `SkillStatus` is the DYNAMIC counterpart
// — what a specific workflow instance looks like right now, derived by
// the per-skill `SkillRuntime` from the instance's draft + resolved
// primitive refs.
//
// A4 defines the types in full (every §3.3 field is present even when
// no skill computes it yet). Per-skill runtime registration starts at
// A5 (Seller Presentation); the dashboard begins consuming runtimes
// later still. Skills without a registered runtime have no computable
// status — `getRuntime(skillId)` returns `undefined`, and the dashboard
// treats that as "status unavailable" rather than an error (pinned
// decision A4.4).
//
// Type-only cycle with workflow-instance.ts: `import type` keeps the
// cycle at the type layer where it's erased at runtime. Both files
// reference each other through type-only imports.

import type { WorkflowInstance } from './workflow-instance';

export type SkillStatusState =
  | 'not-started'
  | 'in-progress'
  | 'blocked'
  | 'complete';

/**
 * Refs to shared primitives resolved for this workflow instance.
 * Mirror of `WorkflowInstanceResolvedPrimitives` — both fields optional
 * because a fresh instance exists before any primitive is selected.
 */
export interface SkillResolvedPrimitives {
  propertyId?: string;
  clientId?: string;
}

/**
 * Reference to an artifact the workflow has produced (Substrate §2).
 * `kind` is an open string union — different skills produce different
 * kinds (web pages, PDFs, MP4 reels). `slug` is set for HandoutRecord-
 * backed artifacts addressable under `/h/[slug]`; locally-exported
 * artifacts (downloaded PDFs) leave it absent. `artifactId` is minted
 * by `generateId('artifact')`.
 */
export interface SkillProducedArtifact {
  artifactId: string;
  kind: string;
  /** Public slug under `/h/[slug]` when the artifact is HandoutRecord-backed. */
  slug?: string;
  /** Absolute URL when the artifact is reachable publicly. */
  url?: string;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** Optional human label (e.g. "Seller presentation v2"). */
  label?: string;
}

/**
 * Timestamp surface for SkillStatus. Shape matches
 * `WorkflowInstanceTimestamps` — the runtime typically passes the
 * instance timestamps through unchanged (and may derive `completedAt`
 * from `state === 'complete'` or vice versa).
 */
export interface SkillStatusTimestamps {
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  completedAt?: string;
}

/**
 * A reason the workflow can't run right now, with optional
 * resolution. `type` is an open string union — common values include
 * `'missing-input'` (a required field is empty) and
 * `'subscription-required'` (an availability gate is denying access);
 * skills may emit their own kinds. `resolutionAction` is the CTA the
 * dashboard renders next to the blocker.
 */
export interface SkillRunBlocker {
  type: string;
  label: string;
  resolutionAction?: {
    label: string;
    /** Wizard step the agent should jump to. */
    targetStepId?: string;
    /** Absolute route override (e.g. `/settings` to fix brand profile). */
    href?: string;
  };
}

/**
 * A "do this next" recommendation surfaced after completion (or
 * during, as a side-quest). `skillId` chains into another workflow;
 * `href` overrides for non-skill jumps. The dashboard renders the
 * `primary` action as the main CTA and `secondary[]` as ghost buttons.
 */
export interface SkillRecommendedAction {
  label: string;
  skillId?: SkillId;
  href?: string;
  /** Optional short reason shown beneath the CTA. */
  reason?: string;
}

export interface SkillRecommendedNextActions {
  primary?: SkillRecommendedAction;
  secondary?: SkillRecommendedAction[];
}

export interface SkillStatus {
  state: SkillStatusState;
  currentStep?: string;
  /**
   * Field keys (per `SkillContract.inputs.required[].key`) that are
   * required but currently empty on the draft. Empty array means
   * "all required inputs satisfied" — orthogonal to `canRun`, which
   * may still be false for non-input reasons (entitlement, etc.).
   */
  missingRequiredInputs: string[];
  resolvedPrimitives: SkillResolvedPrimitives;
  producedArtifacts: SkillProducedArtifact[];
  timestamps: SkillStatusTimestamps;
  /**
   * True iff every blocker is resolved AND state isn't already
   * `complete`. Convention: `canRun === runBlockers.length === 0 &&
   * state !== 'complete'`. The runtime computes the boolean; the
   * dashboard reads it without re-deriving.
   */
  canRun: boolean;
  runBlockers: SkillRunBlocker[];
  recommendedNextActions: SkillRecommendedNextActions;
}

/**
 * Dynamic counterpart to `CallableSkill`. Skills register one of
 * these at module-load time via `registerRuntime` from
 * `./runtime.ts`. `getStatus` reads a typed `WorkflowInstance` and
 * derives the orchestration-readable status; it MAY consult and
 * write to `instance.validation` to cache results across calls.
 *
 * Skills without a runtime continue to work — they just have no
 * computable status, which the dashboard interprets as "no resume
 * card to render."
 */
export interface SkillRuntime<TDraft = unknown> {
  getStatus(instance: WorkflowInstance<TDraft>): SkillStatus;
}
