/**
 * Today-card state derivation (DASHBOARD_HOME_V2) — PURE.
 *
 * Kept React-free in its own module so it is unit-testable without a
 * browser (the e2e harness can't flip a server env flag mid-suite, so the
 * V2 logic is covered by pure + source-contract specs — same approach the
 * Pages Library DARK passes used). The Today card consumes this and only
 * renders.
 *
 * Pass 1 (DASHBOARD_HOME_V2) derives `returning` vs `new` only. Pass 3
 * (DASHBOARD_TODAY_SEAM) extends it to the full set of onboarding states an
 * agent can now be in, so the dashboard is a true continuation of onboarding
 * rather than a separate cold surface. The richer states are gated behind the
 * optional `onboarding` argument: when it is omitted (flag OFF) the function
 * derives EXACTLY the Pass-1 states, so the flag-off Today card is
 * byte-identical.
 *
 * Precedence when more than one state could apply (most-advanced actionable
 * state wins): returning > partial > sample-only > new. `returning` and `new`
 * keep their Pass-1 behavior exactly.
 */

import type { OwnerPagesActivity } from './use-owner-pages-activity';

export type TodayState =
  | 'loading'
  | 'new'
  | 'sample-only'
  | 'partial'
  | 'returning'
  | 'unavailable';

/**
 * The local, onboarding-derived signals the seam needs (Pass 3). PURE input:
 * the client hook reads these from localStorage and hands them in, so the
 * derivation stays browser-free and unit-testable. Omit (or pass undefined)
 * to get the flag-off Pass-1 behavior.
 */
export interface OnboardingSignals {
  /**
   * instanceId of an in-progress seller-presentation draft that was NEVER
   * published, or null. Drives `partial` — the card deep-links a resume
   * (`?id=`) straight back into this exact draft. A published draft shows up
   * server-side instead (→ `returning`), so it is excluded here by the hook.
   */
  partialInstanceId: string | null;
  /** Address (or seller) label for the partial resume copy; null if neither. */
  partialLabel: string | null;
  /**
   * The agent opened the curated sample but produced no real page or draft.
   * Drives `sample-only` (the prominent convert card). From the dedicated
   * `socanim_onboarding_sample_walked` marker — NOT the generic seen flag.
   */
  hasWalkedSample: boolean;
}

export interface TodayView {
  state: TodayState;
  /** Returning agent with one or more pages the source flagged for follow-up. */
  needsAttention: boolean;
  worthFollowUpCount: number;
  activeCount: number;
  /** PARTIAL only — the draft instanceId to deep-link resume; null otherwise. */
  partialInstanceId: string | null;
  /** PARTIAL only — the address/seller label for the resume headline. */
  partialLabel: string | null;
}

export function deriveTodayState(
  activity: OwnerPagesActivity,
  onboarding?: OnboardingSignals,
): TodayView {
  const { status, totalPages, worthFollowUpCount, activeCount } = activity;

  let state: TodayState;
  let partialInstanceId: string | null = null;
  let partialLabel: string | null = null;

  if (status === 'loading') {
    state = 'loading';
  } else if (status === 'unavailable') {
    // We can't know the published-page count, so we can't tell returning from
    // new; degrade to the neutral create CTA (same as Pass 1). The local seam
    // signals are deliberately NOT consulted here — without the authoritative
    // count, showing a resume/convert card could contradict reality.
    state = 'unavailable';
  } else if (totalPages > 0) {
    // RETURNING wins the precedence — the most-advanced actionable state.
    state = 'returning';
  } else if (onboarding?.partialInstanceId) {
    // PARTIAL — an in-progress, never-published draft. Resume it directly.
    state = 'partial';
    partialInstanceId = onboarding.partialInstanceId;
    partialLabel = onboarding.partialLabel;
  } else if (onboarding?.hasWalkedSample) {
    // SAMPLE-ONLY — walked the sample, made nothing. Convert them.
    state = 'sample-only';
  } else {
    // NEW — never started (or seam off, so partial/sample degrade to here).
    state = 'new';
  }

  return {
    state,
    needsAttention: state === 'returning' && worthFollowUpCount > 0,
    worthFollowUpCount,
    activeCount,
    partialInstanceId,
    partialLabel,
  };
}

/* ── QA display override (preview/dev only — see isTodaySeamPreviewAllowed) ── */

/** The four states the `?todaySeam=` query param can force, for QA display. */
export type TodaySeamPreview = 'new' | 'sample' | 'partial' | 'returning';

/**
 * Map a raw `?todaySeam=` query value to the TodayState it forces, or null if
 * it is absent / not one of the four QA values. PURE — the env/feature gate
 * (isTodaySeamPreviewAllowed) is applied by the caller BEFORE this runs, so
 * this never decides whether the override is allowed, only what it means.
 */
export function parseSeamPreview(
  raw: string | string[] | undefined,
): TodayState | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  switch (value) {
    case 'new':
      return 'new';
    case 'sample':
      return 'sample-only';
    case 'partial':
      return 'partial';
    case 'returning':
      return 'returning';
    default:
      return null;
  }
}

/**
 * Build a fully SYNTHETIC TodayView for a forced state — the QA override's
 * display payload. Touches no real pages/drafts: the partial resume id/label
 * and the returning follow-up count are placeholders that exist only so the
 * forced card renders its complete shape (resume link, attention line). Used
 * ONLY when isTodaySeamPreviewAllowed() already cleared the override.
 */
export function previewTodayView(state: TodayState): TodayView {
  switch (state) {
    case 'returning':
      return {
        state,
        needsAttention: true,
        worthFollowUpCount: 2,
        activeCount: 3,
        partialInstanceId: null,
        partialLabel: null,
      };
    case 'partial':
      return {
        state,
        needsAttention: false,
        worthFollowUpCount: 0,
        activeCount: 0,
        partialInstanceId: 'preview',
        partialLabel: '123 Sample Avenue',
      };
    case 'sample-only':
      return {
        state,
        needsAttention: false,
        worthFollowUpCount: 0,
        activeCount: 0,
        partialInstanceId: null,
        partialLabel: null,
      };
    default:
      return {
        state: 'new',
        needsAttention: false,
        worthFollowUpCount: 0,
        activeCount: 0,
        partialInstanceId: null,
        partialLabel: null,
      };
  }
}
