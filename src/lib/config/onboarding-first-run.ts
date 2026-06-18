/**
 * ONBOARDING_FIRST_RUN (Onboarding redesign, Pass 2) - the output-first
 * first-run flow. OFF by default; ships DARK so it can be verified on
 * preview before the prod flip.
 *
 * When OFF, a new user's first sign-in is byte-identical to today: they land
 * on /dashboard and nothing about the entry changes. Returning users are
 * never affected either way.
 *
 * When ON, a brand-new agent (zero owned seller pages, onboarding not yet
 * dismissed) is routed from the dashboard entry into the full-screen /welcome
 * first-run flow: pick a path -> a real seller page is prepared in ~2-4 min
 * -> the flow ends inside the live cockpit with the minted page visible.
 *
 * Read SERVER-SIDE in src/app/dashboard/page.tsx (mirroring how the dashboard
 * reads DASHBOARD_HOME_V2) and threaded down to DashboardClient as a prop, so
 * the flag can be true on preview and false on prod independently - no
 * NEXT_PUBLIC inline, no per-environment rebuild, and the flag-off path never
 * reaches a line of first-run gating at render time.
 *
 * This is the single read of the env var; everything downstream takes the
 * resolved boolean.
 */
export function isOnboardingFirstRunEnabled(): boolean {
  return process.env.ONBOARDING_FIRST_RUN === "true";
}
