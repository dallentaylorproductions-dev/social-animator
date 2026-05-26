import { hasActiveSubscription } from "./subscription";
import { isDevAccessGranted } from "./dev-access";

/**
 * Effective-tier resolver (Substrate §3, §8, §9.7 trust boundary).
 *
 * @deprecated v1.47 / A7f.2 — replaced by the multi-dimensional resolver
 * in src/lib/entitlements/resolver.ts (resolveEntitlements +
 * resolveSkill). That module is now the single source of truth for
 * gating decisions; this single-tier stub had no production consumers
 * by the time A7f.2 landed and is retained only as a rollback shim.
 * Do not call from new code — depend on the new resolver instead.
 *
 * Original v1.47 / A2 docstring follows:
 *
 * A2 minimal stub per pinned decision Q-2: tier is server-authoritative,
 * derived from the SAME state the paywall middleware (src/middleware.ts)
 * consults — never a client flag. Pro billing itself (H-8) doesn't exist
 * yet, so this effectively returns 'base' for everyone outside the beta
 * cohort.
 *
 * Mapping rule:
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
