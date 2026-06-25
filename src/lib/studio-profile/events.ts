/**
 * Studio Profile funnel — event vocabulary (Slice 1).
 *
 * The named events the build packet calls out, kept in one pure module so the
 * client emitter and the server store agree on spelling and a test can assert
 * the exact names fire. These measure the agent's PROGRESS through the guided
 * activation, not how any page got prepared. Mirrors the onboarding funnel DNA
 * (fire-and-forget beacon → owner-scoped KV) — no new analytics dependency.
 *
 * The thesis to validate: deeper setup → stronger first assets → higher
 * retention. Time-to-client-ready / time-to-full-setup ride as numeric `props`
 * (ms since `setupStarted`); first-page-created / sparse-rate / churn-by-depth
 * are reconstructed server-side from this log joined to the publish + page-view
 * records (a follow-on dashboard), so no new client event is needed for them.
 */

export const STUDIO_EVENTS = {
  /** The guided flow mounted (the intro / commitment screen is shown). */
  setupStarted: "studio_setup_started",
  /** A step became active. props: { step }. Powers per-step drop-off. */
  stepEntered: "studio_step_entered",
  /** A step's fields were committed (the "Save & continue" reward). props: { step }. */
  stepSaved: "studio_step_saved",
  /** A step was skipped ("I'll add this later"). props: { step }. Skips-by-section. */
  stepSkipped: "studio_step_skipped",
  /** Client-ready threshold reached. props: { ms } (time-to-client-ready). */
  clientReadyReached: "studio_client_ready_reached",
  /** All six segments completed. props: { ms } (time-to-full-setup). */
  fullSetupCompleted: "studio_full_setup_completed",
  /** "Create a seller page now" taken. props: { from: 'checkpoint' | 'intro' }. */
  createPageClicked: "studio_create_page_clicked",
  /** "Finish setup" taken at the client-ready checkpoint (into Phase 2). */
  finishSetupClicked: "studio_finish_setup_clicked",
} as const;

export type StudioEventName =
  (typeof STUDIO_EVENTS)[keyof typeof STUDIO_EVENTS];

/** The flat set of valid names — the route validates against this. */
export const STUDIO_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(STUDIO_EVENTS),
);

/** A single recorded funnel event. `at` is stamped server-side. */
export interface StudioFunnelEvent {
  event: StudioEventName;
  /** ISO 8601, stamped by the server on receipt. */
  at: string;
  /** Coarse, non-PII context (step, ms). */
  props?: Record<string, string | number | boolean>;
}
