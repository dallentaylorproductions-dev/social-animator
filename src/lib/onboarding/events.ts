/**
 * Onboarding funnel - event vocabulary (Onboarding redesign, Pass 2).
 *
 * The one place the first-run flow was flying blind. These are the named
 * events the packet calls out, kept in a single pure module so the client
 * emitter and the server store agree on spelling and so a test can assert
 * the exact names fire. No backend nouns leak here - these measure the
 * agent's PROGRESS, not how a page got prepared.
 *
 * Reuses the product's existing measurement DNA (fire-and-forget beacon ->
 * KV, the same shape the viewed-signal beacon uses) rather than introducing
 * a new analytics dependency.
 */

export const ONBOARDING_EVENTS = {
  /** The flow mounted (the path picker is shown). */
  started: "onboarding_started",
  /** A path was chosen. props: { path: 'real' | 'sample' }. */
  pathChosen: "onboarding_path_chosen",
  /** A step became active. props: { step }. Powers per-step drop-off. */
  stepEntered: "onboarding_step_entered",
  /** The first meaningful seller-page preview rendered. props: { path }. */
  previewReached: "onboarding_preview_reached",
  /** Best-effort property prepare resolved. props: { ok, thin }. */
  prepareResolved: "onboarding_prepare_resolved",
  /** A trust signal (first name / brand color) was saved. props: { kind }. */
  trustSignalAdded: "onboarding_trust_signal_added",
  /** The minted page was published. props: { path }. */
  published: "onboarding_published",
  /** Sample -> real conversion CTA taken. */
  sampleConverted: "onboarding_sample_converted",
  /** Flow handed off into the cockpit with the page visible. */
  reachedCockpit: "onboarding_reached_cockpit",
  /** Agent dismissed / skipped the flow. props: { step }. */
  dismissed: "onboarding_dismissed",
} as const;

export type OnboardingEventName =
  (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];

/** The flat set of valid names - the route validates against this. */
export const ONBOARDING_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(ONBOARDING_EVENTS),
);

/** A single recorded funnel event. `at` is stamped server-side. */
export interface OnboardingFunnelEvent {
  event: OnboardingEventName;
  /** ISO 8601, stamped by the server on receipt. */
  at: string;
  /** Coarse, non-PII context (path, step, ok/thin flags). */
  props?: Record<string, string | number | boolean>;
}
