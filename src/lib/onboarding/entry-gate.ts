/**
 * Onboarding entry decision — the pure new-vs-returning + replay contract.
 *
 * The single, testable statement of WHO sees the first-run flow. Both the
 * dashboard entry gate (DashboardEntry → OnboardingEntryGate) and the /welcome
 * replay branch read their decision from here, so the contract is asserted once
 * in a Node-context spec rather than only living inside React effects the e2e
 * harness can't drive (the flag-off harness limitation).
 *
 * The signal is a MIX, by design:
 *   - SERVER-SIDE truth: the account's owned seller-presentation page count
 *     (`totalPages`), resolved from the owner-scoped pages endpoint. 0 ⇒ new,
 *     ≥1 ⇒ returning. This is account-correct (scoped to the session email
 *     server-side) and CANNOT be spoofed by another account's browser state.
 *   - CLIENT-SIDE advisory: the per-browser `socanim_onboarding_seen` marker,
 *     a "don't re-nag" flag. When set, the agent stays on the dashboard even at
 *     0 pages, so an intentional skip sticks. This marker is account-scoped via
 *     `reconcileAccountOwnership` (cleared on account CHANGE), so a stale marker
 *     from a PRIOR account on a shared browser is wiped before this runs — it
 *     cannot make a genuinely-new account skip onboarding.
 */

export type OnboardingEntryDecision =
  /** Activity still resolving — hold the calm placeholder, decide later. */
  | 'wait'
  /** Brand-new agent (0 pages, not already seen) — route into /welcome. */
  | 'welcome'
  /** Returning, already-seen, or activity unavailable — render the dashboard. */
  | 'stay';

export interface OnboardingEntryInput {
  /** `socanim_onboarding_seen` === '1' for the CURRENT (reconciled) account. */
  seen: boolean;
  /** The owner-pages fetch status (single source: useOwnerPagesActivity). */
  activityStatus: 'loading' | 'ready' | 'unavailable';
  /** Total owned pages incl. archived — the server-side new(0)/returning(>0) signal. */
  totalPages: number;
}

/**
 * Decide the dashboard first-run entry. Pure: same inputs ⇒ same decision.
 *
 *   - already seen / skipped        → 'stay' (never re-nag)
 *   - activity still loading        → 'wait' (placeholder, no flash)
 *   - ready + zero owned pages      → 'welcome' (the only redirect)
 *   - returning (≥1) or unavailable → 'stay'
 *
 * Precedence note: `seen` wins over a zero-page count on purpose — an agent who
 * explicitly skipped is not dragged back in, and a sample-only bounce isn't
 * trapped. Once an agent owns a real page the zero-pages check stops firing
 * regardless of the marker.
 */
export function decideOnboardingEntry(
  input: OnboardingEntryInput,
): OnboardingEntryDecision {
  if (input.seen) return 'stay';
  if (input.activityStatus === 'loading') return 'wait';
  if (input.activityStatus === 'ready' && input.totalPages === 0) {
    return 'welcome';
  }
  return 'stay';
}

/**
 * Whether an explicit onboarding REPLAY was requested (`/welcome?replay=1`).
 *
 * Replay re-shows the first-run flow for the CURRENT account — even a returning
 * one — for live demos and re-smokes, NON-destructively (no real brand/page/
 * draft write). The trigger is deliberately explicit: a normal returning user's
 * navigation never appends `?replay=1`, so they can never land in replay by
 * accident. The param is the whole gate (plus an auth session, enforced
 * upstream by middleware); replay renders regardless of the onboarding flags so
 * it can be demoed on prod without flipping the product flag.
 */
export function isReplayRequested(
  replayParam: string | string[] | undefined,
): boolean {
  const value = Array.isArray(replayParam) ? replayParam[0] : replayParam;
  return value === '1';
}
