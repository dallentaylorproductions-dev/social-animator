import { hasActiveSubscription } from "./subscription";
import { isDevAccessGranted } from "./dev-access";

/**
 * Effective-tier resolver (Substrate §3, §8, §9.7 trust boundary).
 *
 * v1.47 / A2 minimal stub per pinned decision Q-2: tier is server-
 * authoritative, derived from the SAME state the paywall middleware
 * (src/middleware.ts) consults — never a client flag. Pro billing
 * itself (H-8) doesn't exist yet, so this effectively returns 'base'
 * for everyone outside the beta cohort. The core Seller Presentation
 * workflow is Base = ungated, so that's the right v1.47 answer.
 *
 * Not built here: the multi-dimensional availability resolver
 * (per skill × {baseWorkflow, premiumThemes, aiPlugPoints}) and any
 * actual gate enforcement. Those land alongside the premium-theme
 * catalog (A7) and Pro billing (H-8). Keeping the surface area
 * minimal until then avoids cementing assumptions the real billing
 * model hasn't validated.
 *
 * Mapping rule (intentionally permissive — Pro is currently a proxy
 * for "is a paying customer or invited beta tester"):
 *   - active Stripe subscription → 'pro'
 *   - dev-access bypass granted  → 'pro'
 *   - anything else (incl. unauthenticated callers) → 'base'
 */

export type Tier = "base" | "pro";

export async function effectiveTier(
  email: string | null | undefined,
): Promise<Tier> {
  if (!email) return "base";
  if (await isDevAccessGranted(email)) return "pro";
  if (await hasActiveSubscription(email)) return "pro";
  return "base";
}
