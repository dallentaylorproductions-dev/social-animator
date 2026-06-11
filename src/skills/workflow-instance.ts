import type { SkillId, SkillStatusState } from "./types";

/**
 * Converged workflow draft shape (Substrate §9.5, v1.47 / A3).
 *
 * Every workflow's in-progress state — irrespective of which skill —
 * persists as a `WorkflowInstance<TDraft>` keyed by `instanceId`. The
 * skill-specific working data lives under `draft`; the surrounding
 * fields (skillId, resolved primitive refs, current step, timestamps,
 * cached validation) are what the orchestration layer (dashboard,
 * SkillStatus computation, recommendedNextActions) reads.
 *
 * Per-instance — not per-tool. The legacy `*:draft` localStorage keys
 * (sellerIntelligenceReport:draft, openHousePrep:draft, …) are
 * untouched in v1.47; the converged shape lives in its own namespace
 * (`workflowInstance:<id>`) so the new Seller Presentation wizard can
 * adopt it without disturbing any existing tool. See
 * docs/v1.47-A1-seller-presentation-audit.md §4 + §5.2.
 *
 * Pinned A3 decisions baked into the shape:
 *   - `resolvedPrimitives.propertyId` and `.clientId` are BOTH OPTIONAL.
 *     A fresh instance exists from the moment the agent starts the
 *     wizard — before Step 1 saves a property. Making them required
 *     would make a just-opened instance unrepresentable and would
 *     break resume. Presence is enforced later by step validation and
 *     surfaces in the SkillStatus.runBlockers + missingRequiredInputs
 *     (Substrate §3.3), which a later commit computes.
 *   - No `agentEmail` on resolvedPrimitives. The auth session is the
 *     source of truth for the agent identity; persisting it per-
 *     instance would create a sync problem if the user re-auths under
 *     a different email. If a future flow needs cross-account
 *     attribution, it's an additive field.
 *   - `currentStep` is optional. A brand-new instance with no step
 *     selected is valid; the wizard sets it on first navigation.
 *   - `validation` is optional and intentionally minimal. The
 *     SkillRuntime in a later commit (A4) defines a tight shape for
 *     what it caches; A3 doesn't lock the shape ahead of that work.
 *
 * Generic on `TDraft` (default `unknown`). Per-skill code narrows via
 * `loadInstance<MyDraft>(id)`. The storage layer doesn't know the
 * draft shape and never reaches into it.
 */

export interface WorkflowInstanceResolvedPrimitives {
  /** Stable Property identifier (Substrate §2.3). Optional pre-Step 1. */
  propertyId?: string;
  /** Stable Client identifier (Substrate §2.3). Optional — many SPs personalize implicitly. */
  clientId?: string;
}

export interface WorkflowInstanceTimestamps {
  /** ISO 8601 UTC of instance creation. Immutable. */
  createdAt: string;
  /** ISO 8601 UTC of the last write to this record. Bumped by `saveInstance`. */
  updatedAt: string;
  /**
   * ISO 8601 UTC of the most recent time the agent opened the wizard
   * on this instance. Set explicitly by the wizard via `markOpened` —
   * NOT bumped on every save (saves happen continuously inside a
   * session; lastOpened is the dashboard's "what did you walk away
   * from last?" signal).
   */
  lastOpenedAt?: string;
  /**
   * ISO 8601 UTC of when the agent marked the workflow complete.
   * Present when state === 'complete' in the derived SkillStatus.
   */
  completedAt?: string;
}

/**
 * Cached `SkillStatus` snapshot — the subset of orchestration-status
 * fields it pays to memoize between renders. A4 tightens the shape
 * to mirror the SkillStatus fields a runtime might cache; A5+
 * runtimes populate; A4 itself never writes here.
 *
 * Cache-validity convention: a runtime treats this as fresh iff
 * `lastCheckedAt >= WorkflowInstance.timestamps.updatedAt`. A draft
 * mutation always bumps `updatedAt` (via `saveInstance`), so any
 * post-edit `getStatus` recomputes. Writers update `lastCheckedAt`
 * to `WorkflowInstance.timestamps.updatedAt` after a fresh compute.
 *
 * Every field optional — a brand-new instance has no cached state,
 * and a runtime may legitimately choose not to cache. Adding fields
 * is additive; tightening any existing field's type is not.
 */
export interface WorkflowInstanceValidation {
  /** Cached `SkillStatus.state`. */
  state?: SkillStatusState;
  /** Cached `SkillStatus.missingRequiredInputs`. Required field keys empty on the draft. */
  missingRequiredInputs?: string[];
  /** ISO 8601 UTC of the most recent recompute. Compare to `timestamps.updatedAt` to test freshness. */
  lastCheckedAt?: string;
}

export interface WorkflowInstance<TDraft = unknown> {
  /** Stable id minted by `generateId('workflow')`. */
  instanceId: string;
  /** The skill that owns this instance (CallableSkill.id). */
  skillId: SkillId;
  /** Per-skill working state. Opaque to the storage layer. */
  draft: TDraft;
  /** Refs to shared primitives — propertyId and clientId both optional pre-resolve. */
  resolvedPrimitives: WorkflowInstanceResolvedPrimitives;
  /** Wizard step the agent is currently on. Optional for a brand-new instance. */
  currentStep?: string;
  /** Cached validation snapshot. A3 leaves this unset; A4+ writes it. */
  validation?: WorkflowInstanceValidation;
  timestamps: WorkflowInstanceTimestamps;
  /**
   * Lowercased email of the authenticated agent who owns this instance,
   * stamped at creation from the server session (SP-LIB). Optional for
   * back-compat — legacy instances created before SP-LIB have none.
   *
   * The "Your pages" library scopes its DRAFT cards strictly by this
   * field (an instance with no `ownerEmail`, or one that doesn't match
   * the current session, is never shown). Published pages are scoped
   * independently + authoritatively by the server handout owner index;
   * this field only governs the localStorage draft slice. The wizard
   * itself ignores it — adding it does not change any rendered output,
   * so the flag-off landing stays byte-identical.
   */
  ownerEmail?: string;
  /**
   * SP-LIB — the public handout slug this instance was last published
   * to, recorded by `markPublished` after a successful publish. Its
   * presence is what makes a card "Live" (vs "Draft"); re-publishing
   * reuses this slug so the seller's existing /h/<slug> link stays
   * stable ("Update live page"). Unset = never published = a Draft.
   */
  publishedSlug?: string;
  /**
   * SP-LIB — ISO 8601 UTC of the most recent publish. Compared against
   * `timestamps.updatedAt` to derive "Live · edits pending": the working
   * draft has unpublished edits iff `updatedAt > publishedAt`. Stamped
   * equal to `updatedAt` at publish time so a freshly-published page is
   * never falsely flagged as pending.
   */
  publishedAt?: string;
  /**
   * SP-LIB — ISO 8601 UTC of when the agent archived this instance from
   * the library (reversible). Set for DRAFT cards archived locally;
   * published-page archival lives on the server handout record instead
   * (so the public page stops serving). Unset = not archived.
   */
  archivedAt?: string;
}
