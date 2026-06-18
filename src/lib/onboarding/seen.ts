"use client";

/**
 * Onboarding "seen" marker (Onboarding redesign, Pass 2).
 *
 * A local, per-browser flag so the first-run flow is shown ONCE and never
 * nags. Set when the agent completes the flow (reaches the cockpit) or
 * explicitly skips it. The dashboard entry gate reads it: a brand-new agent
 * (zero owned pages) who has already seen the flow is NOT redirected again,
 * so an intentional skip sticks and a sample-only bounce isn't trapped.
 *
 * localStorage (not server) on purpose: the gate decision must be instant and
 * offline-safe, it's advisory (worst case the agent re-sees a calm picker),
 * and it matches the brand-profile / listing-profile local markers the
 * dashboard already reads. Once the agent has a real page, the gate's
 * zero-pages check naturally stops firing regardless of this flag.
 */
const SEEN_KEY = "socanim_onboarding_seen";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // ignore quota / storage-disabled - the gate degrades to re-showing.
  }
}
