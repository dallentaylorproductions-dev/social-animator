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

/**
 * Sample-walked marker (DASHBOARD_TODAY_SEAM, Pass 3).
 *
 * Distinct from `socanim_onboarding_seen`: that flag is set identically
 * whether the agent walked the sample, finished a real page, or just hit
 * "Skip for now" on the first beat, so it can't tell a sample-walker apart
 * from a pure skipper. This marker is written ONLY when the agent actually
 * opens the curated sample, giving the dashboard Today card a clean signal
 * for the `sample-only` state ("you've seen what it does — now make one for
 * your listing") instead of cold-starting them at `new`.
 *
 * Local + advisory like the other onboarding markers: worst case (storage
 * disabled / cleared) the card degrades to `new`, never breaks.
 */
const SAMPLE_KEY = "socanim_onboarding_sample_walked";

export function hasWalkedSample(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SAMPLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSampleWalked(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAMPLE_KEY, "1");
  } catch {
    // ignore quota / storage-disabled - the card degrades to `new`.
  }
}

/**
 * Path-A-completed marker (ONBOARDING_HYBRID_V3, Phase 5).
 *
 * Set when a hybrid Path A agent finishes Agent-Layer setup and takes the
 * handoff to the dashboard. It is the ONLY clean signal that distinguishes a
 * "profile ready, no page yet" agent (Agent Layer captured, zero pages) from a
 * returning agent who deleted all their pages — both otherwise read as
 * `agentName set + totalPages 0`. Written ONLY by the hybrid flow, so flag-off
 * (and V1/V2) never set it and the dashboard stays byte-identical.
 *
 * Local + advisory like the other onboarding markers: worst case (storage
 * disabled / cleared) the Today card degrades to `new`, never breaks.
 */
const PATH_A_COMPLETE_KEY = "socanim_onboarding_path_a_complete";

export function hasCompletedPathA(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PATH_A_COMPLETE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPathAComplete(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PATH_A_COMPLETE_KEY, "1");
  } catch {
    // ignore quota / storage-disabled - the card degrades to `new`.
  }
}
