/**
 * Today-card state derivation (DASHBOARD_HOME_V2, Pass 1) — PURE.
 *
 * Kept React-free in its own module so it is unit-testable without a
 * browser (the e2e harness can't flip a server env flag mid-suite, so the
 * V2 logic is covered by pure + source-contract specs — same approach the
 * Pages Library DARK passes used). The Today card consumes this and only
 * renders.
 *
 * Pass-1 scope: returning vs basic-empty only. The richer new/sample/
 * partial onboarding states are the Pass-2 seam.
 */

import type { OwnerPagesActivity } from './use-owner-pages-activity';

export type TodayState = 'loading' | 'new' | 'returning' | 'unavailable';

export interface TodayView {
  state: TodayState;
  /** Returning agent with one or more pages the source flagged for follow-up. */
  needsAttention: boolean;
  worthFollowUpCount: number;
  activeCount: number;
}

export function deriveTodayState(activity: OwnerPagesActivity): TodayView {
  const { status, totalPages, worthFollowUpCount, activeCount } = activity;

  let state: TodayState;
  if (status === 'loading') state = 'loading';
  else if (status === 'unavailable') state = 'unavailable';
  else state = totalPages > 0 ? 'returning' : 'new';

  return {
    state,
    needsAttention: state === 'returning' && worthFollowUpCount > 0,
    worthFollowUpCount,
    activeCount,
  };
}
