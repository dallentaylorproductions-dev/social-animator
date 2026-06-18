/**
 * ONBOARDING_FIRST_RUN_V2 (Onboarding redesign, Pass 2b / Gate 3) - the locked
 * 9-beat real-section-reveal first-run flow. OFF by default; ships DARK so the
 * whole sequence can be verified on preview before the prod flip.
 *
 * V2 is a PARALLEL dark path to the shipped ONBOARDING_FIRST_RUN (V1) flow. The
 * two are independent env flags so V2 can be true on preview while V1 stays the
 * live prod experience, untouched, until V2 verifies. When BOTH are off, the
 * entry is byte-identical to today; when V2 is on it SUPERSEDES V1 at /welcome
 * (V2 takes precedence in the flow selection), per the Ship Runbook.
 *
 * Read SERVER-SIDE (mirroring isOnboardingFirstRunEnabled): /welcome selects the
 * flow, and the dashboard entry gate + the funnel-event route honor V2 OR V1 so
 * the flow is reachable and instrumented on a V2-only preview (no V1 needed).
 * The flag-off path never reaches a line of V2 gating at render time.
 *
 * This is the single read of the env var; everything downstream takes the
 * resolved boolean.
 */
export function isOnboardingFirstRunV2Enabled(): boolean {
  return process.env.ONBOARDING_FIRST_RUN_V2 === "true";
}
