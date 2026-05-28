import type { CallableSkill, SkillAvailability } from "@/skills/types";
import type {
  AccessMode,
  AgentProfile,
  EntitlementContext,
  ResolvedGate,
  ResolvedSkill,
  Tier,
} from "./types";

/**
 * The single entitlement resolver (Substrate §8.5, v1.47 / A7f.2).
 *
 * Pure functions — no React, no KV, no async. The async work of
 * deriving the AgentProfile from auth + KV state lives in
 * ./load-agent-profile.ts (server only). From there the resolver is
 * synchronous and shareable across server + client.
 *
 * EVERY surface that needs to know "can the agent do X?" calls
 * resolveSkill via the dashboard / page boundary. No surface
 * re-implements the gate logic — the v1.44 dashboard-discovery bug
 * was exactly that failure mode (hardcoded filter logic out of sync).
 */

// ----- Tier comparison -----

/** Ordinal so `tierMeets('pro', 'base')` is cheap (1 >= 0). */
const TIER_ORDER: Readonly<Record<Tier, number>> = { base: 0, pro: 1, ai: 2 };

function tierMeets(have: Tier, need: Tier): boolean {
  return TIER_ORDER[have] >= TIER_ORDER[need];
}

// ----- Access-mode + effective-tier mapping -----

/**
 * Map AgentProfile → AccessMode. Pinned 2026-05-25: internalTestOverride
 * wins over everything else (it's Dallen's QA knob); dev-access wins
 * over Stripe trial/active (cohort agents may also have a billing row
 * one day, but the cohort experience is what matters for them).
 */
function accessModeFor(p: AgentProfile): AccessMode {
  if (p.internalTestOverride !== undefined) return "internal-test";
  if (p.devAccessGranted) return "team-invite";
  if (p.subscriptionStatus === "trialing") return "trial";
  if (p.subscriptionStatus === "active" || p.hasActiveSubscription) {
    return "paid";
  }
  // No paywall-paying, no trial, no dev-access, no override. In
  // production this caller can't reach a protected route (middleware
  // bounces them to /paywall); the only callers here in practice are
  // the E2E test bypass (NODE_ENV !== 'production' + E2E_TESTING) and
  // future free-tier surfaces. Both want the calm Base experience with
  // upgrade UI suppressed, so 'internal-test' is the right home — it
  // suppresses subscription messaging AND defaults the tier to base.
  return "internal-test";
}

/**
 * Map AccessMode + AgentProfile → effective Tier (Substrate §8.5).
 *
 * Pinned decisions (2026-05-25, Dallen):
 *   - team-invite → 'pro'. June 1 ATHT cohort gets the full experience,
 *     premium themes resolve to available, NO subscription messaging.
 *   - internal-test → caller-controlled. Defaults to 'base' so the
 *     Base preview-but-lock flow is the default test mode; override
 *     via internalTestOverride to climb the ladder.
 *   - trial / paid → 'pro' today. Billing data doesn't carry a tier
 *     yet (v1.47 has a single Stripe price); when H-8 lands the real
 *     tier with the sub row, this becomes `subscriptionTier ?? 'pro'`.
 */
function tierFor(mode: AccessMode, p: AgentProfile): Tier {
  if (mode === "internal-test") return p.internalTestOverride ?? "base";
  if (mode === "team-invite") return "pro";
  if (mode === "trial") return "pro";
  if (mode === "paid") return "pro";
  return "base";
}

// ----- resolveEntitlements -----

export function resolveEntitlements(agent: AgentProfile): EntitlementContext {
  const accessMode = accessModeFor(agent);
  const tier = tierFor(accessMode, agent);
  return {
    accessMode,
    tier,
    // Shape only — no caps / no policy mechanism yet (§8.4/§8.5).
    caps: {},
    teamPolicy: undefined,
    // §8.5: non-paying modes hide subscription/upgrade copy. The cohort
    // (team-invite) experience MUST NOT show any paywall affordance;
    // internal-test is Dallen's QA and also hides it (his own dashboard
    // shouldn't surface upgrade prompts).
    suppressUpgradeUi: accessMode === "team-invite" || accessMode === "internal-test",
  };
}

// ----- resolveSkill -----

const AVAILABLE: ResolvedGate = {
  state: "available",
  reason: "available",
  label: "Available",
};

/**
 * Resolve one dimension of a skill's availability declaration. The `dim`
 * parameter selects the gated-state copy + fallbackAction shape — keeps
 * the labels (§8.4 calm voice) close to the resolver instead of letting
 * surfaces invent their own.
 */
function resolveDimension(
  required: Tier | undefined,
  agentTier: Tier,
  dim: "core" | "theme" | "ai" | "export",
): ResolvedGate {
  // Undeclared dimension = no gate. Surfaces still see a ResolvedGate
  // (uniform shape) so they don't have to null-check.
  if (required === undefined) return AVAILABLE;
  if (tierMeets(agentTier, required)) return AVAILABLE;

  if (dim === "theme") {
    // §8.6: premium themes follow preview-but-lock-export. The Base
    // agent can see / scrub the premium preview; only publishing the
    // premium variant is gated. fallbackAction names the Base path,
    // which §8.6 requires as the load-bearing trust rule.
    return {
      state: "preview-only",
      reason: "premium-theme",
      label: "Premium theme — upgrade to Pro to publish this style",
      fallbackAction: "Publish with the Base theme",
    };
  }

  if (dim === "ai") {
    return {
      state: "upgrade-required",
      reason: "tier-pro-required",
      label: "AI-assisted fields — upgrade to Pro to use these",
      fallbackAction: "Fill the form manually",
    };
  }

  // 'core' or 'export' gated above Base. §8.6 forbids gating the BASE
  // core deliverable — a skill whose `baseWorkflow` requires > base
  // means the entire workflow lives at a higher tier (rare; reserved
  // for AI-OS-only skills under §7).
  return {
    state: "upgrade-required",
    reason: required === "pro" ? "tier-pro-required" : "tier-ai-required",
    label: `Upgrade to ${required === "pro" ? "Pro" : "AI OS"} to run this`,
  };
}

export function resolveSkill(
  skill: CallableSkill,
  ent: EntitlementContext,
): ResolvedSkill {
  const avail: SkillAvailability | undefined = skill.availability;
  return {
    skill,
    coreAccess: resolveDimension(avail?.baseWorkflow, ent.tier, "core"),
    themeAccess: resolveDimension(avail?.premiumThemes, ent.tier, "theme"),
    aiAccess: resolveDimension(avail?.aiPlugPoints, ent.tier, "ai"),
    // Per-export gating isn't declared on any skill yet; reserve the
    // slot so a later packet can wire it without a type break.
    exportAccess: AVAILABLE,
  };
}

/** Convenience re-exports for surface consumers. */
export type {
  AccessMode,
  AgentProfile,
  EntitlementContext,
  GateState,
  GateReason,
  ResolvedGate,
  ResolvedSkill,
  Tier,
} from "./types";
