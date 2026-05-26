import { isDevAccessGranted } from "@/lib/dev-access";
import { hasActiveSubscription } from "@/lib/subscription";
import { getUser } from "@/lib/db";
import type { AgentProfile, Tier } from "./types";

/**
 * Server-side AgentProfile loader (Substrate §8.5, v1.47 / A7f.2).
 *
 * The ONE place where async account state — the dev-access KV record
 * and the Stripe sub ledger — is read to produce the resolver's input.
 * Called from a server component (dashboard page.tsx today); the
 * synchronous resolver (resolveEntitlements/resolveSkill) runs over
 * the materialized profile downstream, including in client components.
 *
 * Same KV signals as src/middleware.ts and src/lib/skill-entitlement.ts
 * consult — so swapping the legacy `effectiveTier()` over to this is a
 * pure refactor with zero change to cohort access.
 */

const TIER_VALUES: ReadonlyArray<Tier> = ["base", "pro", "ai"];

function parseTierOverride(raw: string | string[] | null | undefined): Tier | undefined {
  if (raw === null || raw === undefined) return undefined;
  // searchParams.foo on Next 16 is string | string[] | undefined; take
  // the first if duplicated, ignore unknown values.
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (TIER_VALUES as readonly string[]).includes(value) ? (value as Tier) : undefined;
}

export interface LoadAgentProfileOptions {
  /**
   * Optional ?testTier=base|pro|ai query param. Sets
   * `internalTestOverride` so the resolver returns
   * accessMode='internal-test' with the chosen tier. Lets Dallen exercise
   * the Base preview-but-lock flow on his own dashboard without changing
   * billing state.
   */
  testTier?: string | string[] | null;
}

export async function loadAgentProfile(
  email: string | null | undefined,
  opts: LoadAgentProfileOptions = {},
): Promise<AgentProfile> {
  const internalTestOverride = parseTierOverride(opts.testTier);

  if (!email) {
    // Unauthenticated callers don't reach protected routes in
    // production (middleware bounces them). In E2E this happens
    // because the test bypass skips auth; the resolver's accessModeFor
    // will land on 'internal-test' below.
    return {
      email: null,
      devAccessGranted: false,
      hasActiveSubscription: false,
      internalTestOverride,
    };
  }

  // Parallel KV reads — the existing helpers each round-trip Vercel
  // KV; running them concurrently keeps the dashboard server render
  // bounded to one KV-round-trip's latency.
  const [devAccessGranted, hasSub, user] = await Promise.all([
    isDevAccessGranted(email),
    hasActiveSubscription(email),
    getUser(email),
  ]);

  // Narrow Stripe status to the two values the resolver discriminates
  // on. Any other status (past_due / canceled / …) implies !hasSub
  // and is equivalent to undefined for resolution.
  const status =
    user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trialing"
      ? user.subscriptionStatus
      : undefined;

  return {
    email,
    devAccessGranted,
    hasActiveSubscription: hasSub,
    subscriptionStatus: status,
    internalTestOverride,
  };
}
