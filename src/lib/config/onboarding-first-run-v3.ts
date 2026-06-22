/**
 * ONBOARDING_HYBRID_V3 (Onboarding rebuild, Phase 3) - the hybrid first-run
 * SHELL: one calm first screen that defaults to Agent-Layer Setup (Path A) with
 * an "I have an address ready" escape hatch (Path B), plus a quiet "See an
 * example". OFF by default; ships DARK so the whole shell can be verified on
 * preview before any prod flip.
 *
 * V3 is a PARALLEL dark path stacked ABOVE the shipped V2 (ONBOARDING_FIRST_RUN_V2)
 * and V1 (ONBOARDING_FIRST_RUN) flows. The three are independent env flags so V3
 * can be true on preview while V2 stays the verified experience and V1 stays the
 * legacy fallback, both untouched. Precedence at /welcome is strict: V3 > V2 > V1.
 * When ALL THREE are off, the entry is byte-identical to today (the route
 * redirects to /dashboard); when V3 is on it SUPERSEDES V2 and V1 at /welcome.
 *
 * Read SERVER-SIDE (mirroring isOnboardingFirstRunV2Enabled): /welcome selects
 * the flow from this resolved boolean. The flag-off path never reaches a line of
 * V3 gating at render time.
 *
 * This is the single read of the env var; everything downstream takes the
 * resolved boolean.
 */
export function isOnboardingHybridV3Enabled(): boolean {
  return process.env.ONBOARDING_HYBRID_V3 === "true";
}
