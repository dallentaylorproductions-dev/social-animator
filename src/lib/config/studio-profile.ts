/**
 * STUDIO_PROFILE_SETUP (Studio Profile, Slice 1) — the guided one-time
 * activation surface at /studio.
 *
 * OFF by default; ships DARK so the whole guided sequence + live asset-preview
 * stage can be verified on a Vercel preview before any prod flip. Flag-off is
 * byte-identical to today: the /studio route redirects to /dashboard (the flow
 * does not exist), the event sink no-ops, and today's /settings page is
 * untouched (it stays the returning-user edit surface until the hub follow-on).
 *
 * Read SERVER-SIDE only (the env var is not NEXT_PUBLIC), mirroring
 * isOnboardingHybridV3Enabled: the /studio shell selects the flow from this
 * resolved boolean and threads it down. This is the single read of the env var.
 */
export function isStudioProfileSetupEnabled(): boolean {
  return process.env.STUDIO_PROFILE_SETUP === "true";
}
