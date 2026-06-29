/**
 * PREPARED_NEXT v0 constants (named, team-tunable).
 *
 * All user-facing copy here is em-dash-free by rule (the validator rejects any
 * model output that contains one; these code constants must hold the same bar).
 */

/**
 * The closing line appended by CODE to every prepared draft. NEVER model-
 * generated, so it is EXEMPT from the output denylist + em-dash scan (it is a
 * trusted constant, not untrusted model text). No CTA is ever read from the
 * payload (there is no CTA field); this is always appended.
 */
export const FALLBACK_CTA =
  "Happy to walk you through any of the numbers whenever you would like.";

/** A payload section must exceed this trimmed length to count as a bullet candidate. */
export const MIN_BULLET_CHARS = 20;

/** Max bullets restated in the draft (first 3 qualifying candidates, in priority order). */
export const MAX_BULLETS = 3;

/**
 * One text variant + one email/recap variant, no rambling. Headroom against
 * truncation: v0.2 raised 650 → 1024 after the page link moved out of the model
 * output (appended by code, like FALLBACK_CTA), so two concise variants fit with
 * room to spare. This is headroom, not license to ramble — the prompt holds the
 * brevity bar; the truncation gate stays the backstop.
 */
export const MAX_GEN_OUTPUT_TOKENS = 1024;

/** AbortController ceiling for the single generation call. Route maxDuration stays 60. */
export const GEN_TIMEOUT_MS = 20_000;

/** Soft per-account daily generation ceiling (even in dark launch). Caps a view-flood. */
export const PER_ACCOUNT_DAILY_GEN_CEILING = 25;

/**
 * At most two generations per Work Order: one initial + one manual retry on
 * failure. No automatic retries, no background generation.
 */
export const MAX_GENERATIONS_PER_WORK_ORDER = 2;
