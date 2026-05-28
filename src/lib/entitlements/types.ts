import type { CallableSkill } from "@/skills/types";

/**
 * Entitlement / gate types (Substrate §8.4 + §8.5, v1.47 / A7f.2).
 *
 * Pure declaration — no behavior, no React, no KV. The resolver in
 * ./resolver.ts is the SINGLE consumer/producer of these shapes; every
 * surface (dashboard today; wizard / consumer page in later packets)
 * reads `ResolvedSkill` instead of re-deriving gates. Centralizing here
 * is the root-cause fix for the v1.44 dashboard bug class (hardcoded
 * filter logic in one surface that fell out of sync).
 */

// ----- AccessMode + Tier -----

/**
 * How the agent reached the product. Load-bearing for cohort UX:
 *   - 'team-invite' = invited beta agent (today: dev-access KV grant).
 *     Effective tier includes premium themes; subscription messaging is
 *     SUPPRESSED for this mode.
 *   - 'internal-test' = Dallen's own QA. Allows forcing a specific tier
 *     so the Base preview-but-lock flow can be exercised without
 *     touching account state. Subscription messaging is SUPPRESSED.
 *   - 'trial' = time-boxed prospect (today: Stripe `trialing` status).
 *   - 'paid' = real subscriber (today: Stripe `active` status).
 */
export type AccessMode = "paid" | "trial" | "team-invite" | "internal-test";

/**
 * The substrate's three-tier ladder (§8.3). Today only `base` and `pro`
 * are reachable; `ai` is declared for forward-compat (AI OS, the
 * conversational orchestration layer in §7).
 */
export type Tier = "base" | "pro" | "ai";

// ----- AgentProfile (resolver input) -----

/**
 * The substrate's §8.5 input to `resolveEntitlements`. Server-resolved
 * at the page boundary (see ./load-agent-profile.ts); from there it
 * flows into client components as a serialized prop.
 *
 * Intentionally narrow — only what the resolver consumes. Brand
 * identity (logo, name, colors) lives in BrandSettings / brand profile
 * (client-localStorage), not here; mixing the two would make this type
 * grow without bound.
 */
export interface AgentProfile {
  /** Authenticated email, or null when the request has no session (E2E test bypass). */
  email: string | null;
  /**
   * True iff the dev-access KV record exists for this email. This is
   * the persistent signal the v1.45.3 cohort access flow writes after
   * the user proved control of the email by clicking the magic link.
   * The resolver maps this to `accessMode: 'team-invite'`.
   */
  devAccessGranted: boolean;
  /**
   * True iff a Stripe subscription is currently in good standing
   * (see hasActiveSubscription in src/lib/subscription.ts).
   */
  hasActiveSubscription: boolean;
  /**
   * Raw Stripe status when present. Distinguishes paid vs trial.
   * 'active' → paid, 'trialing' → trial. Other states (past_due,
   * canceled, etc.) imply !hasActiveSubscription and are equivalent
   * to undefined for resolution purposes.
   */
  subscriptionStatus?: "active" | "trialing";
  /**
   * Force a specific tier for internal testing. When set, the resolver
   * returns accessMode='internal-test' with this tier — letting Dallen
   * exercise the Base preview-but-lock flow without changing real
   * billing or KV state. Surfaced via ?testTier= on the dashboard URL.
   */
  internalTestOverride?: Tier;
}

// ----- ResolvedGate (per dimension) -----

/**
 * Gate states (§8.4). Every gateable dimension on a skill resolves to
 * exactly one of these per agent.
 *
 *   - 'available': run it.
 *   - 'preview-only': render the premium UI, allow scrubbing, gate at
 *     export. Always carries a `fallbackAction` naming the Base
 *     alternative (§8.6 trust rule).
 *   - 'upgrade-required': locked behind a higher tier. Calm copy.
 *   - 'policy-locked': team admin governance lock (no mechanism yet —
 *     shape only).
 *   - 'usage-capped': volume cap hit (no mechanism yet — shape only).
 */
export type GateState =
  | "available"
  | "preview-only"
  | "upgrade-required"
  | "policy-locked"
  | "usage-capped";

/**
 * Open string union (§8.4). Common values listed; skills may emit
 * their own kinds without an enum change. 'available' is the
 * informational value for non-gated states.
 */
export type GateReason =
  | "available"
  | "premium-theme"
  | "tier-pro-required"
  | "tier-ai-required"
  | "admin-brand-lock"
  | "monthly-ai-cap"
  | (string & {});

export interface UsageInfo {
  used: number;
  limit: number;
  /** ISO 8601. */
  resetsAt: string;
  manualStillWorks: boolean;
}

export interface ResolvedGate {
  state: GateState;
  reason: GateReason;
  /** Calm user-facing copy. Never salesy (§8.6). */
  label: string;
  /**
   * What the agent can do instead. REQUIRED on `preview-only` per §8.6
   * trust rule (the premium gate must always name a Base path).
   * Optional on other states.
   */
  fallbackAction?: string;
  /** Present only when state === 'usage-capped'. */
  usage?: UsageInfo;
}

// ----- Team policy + caps (shape only; no mechanism yet) -----

/**
 * Team-admin governance shape (§8.4/§8.5). Today's resolver always
 * returns `undefined` for teamPolicy — there is no team feature yet.
 * Declared here so consumers can already pattern-match on policy-locked
 * gates without a later type-break.
 */
export interface TeamPolicy {
  /** Dimension keys an admin has locked. */
  lockedDimensions?: ReadonlyArray<"theme" | "core" | "ai" | "export">;
}

/**
 * Per-dimension usage tracking shape (§8.4/§8.5). Today empty — no
 * caps mechanism is built. The resolver always returns `{}` here.
 */
export interface UsageCaps {
  /** Reserved — populated when caps land. */
  aiCalls?: UsageInfo;
  exports?: UsageInfo;
}

// ----- EntitlementContext (resolver output, agent-wide) -----

export interface EntitlementContext {
  accessMode: AccessMode;
  /** Effective tier for THIS access mode (not the agent's billing tier). */
  tier: Tier;
  caps: UsageCaps;
  teamPolicy?: TeamPolicy;
  /**
   * True iff subscription / upgrade messaging should be hidden on every
   * surface. Computed from accessMode (team-invite + internal-test).
   * Surfaces consume this flag rather than re-deriving from accessMode
   * so the rule lives in one place (§8.5).
   */
  suppressUpgradeUi: boolean;
}

// ----- ResolvedSkill (resolver output, per skill) -----

/**
 * The skill contract joined with per-dimension gate resolutions
 * (§8.5). Surfaces render from this; they never call resolver internals
 * directly past this boundary.
 *
 * - `coreAccess`: can the agent run the workflow at all?
 * - `themeAccess`: premium theme picker access (§8.6 preview-but-lock
 *   pattern lives here).
 * - `aiAccess`: AI plug-points (Category 1 friction-AI in §5).
 * - `exportAccess`: per-format export gating (declared for forward-compat;
 *   today always 'available' — no skill declares per-export gating yet).
 */
export interface ResolvedSkill {
  skill: CallableSkill;
  coreAccess: ResolvedGate;
  themeAccess: ResolvedGate;
  aiAccess: ResolvedGate;
  exportAccess: ResolvedGate;
}
