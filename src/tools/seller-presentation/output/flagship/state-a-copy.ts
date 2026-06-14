/**
 * Seller State A — evergreen fixed copy + strong defaults for the editable
 * voice lines and the capability frame labels.
 *
 * Governing principle (locked): fixed copy must be EVERGREEN, ACCURATE, and
 * written for the seller. It never assumes a video duration, a photo type, or a
 * particular agent voice. The personal / voice-heavy lines are agent-editable
 * (sourced from Settings); when an agent edits nothing, these defaults ship great
 * out of the box. The capability frame labels describe the agent's CAPABILITY
 * (set once), never this home's not-yet-existent listing.
 *
 * Pure strings + helpers, no React, so the no-em-dash + truthful-copy gates scan
 * one canonical source. Keep every string free of em-dashes and of duration /
 * "the listing" / "magazine-grade" assumptions.
 */

/** First name from a full name, or undefined when there is no usable name. */
function firstName(name: string | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  return first || undefined;
}

/**
 * The hero hello label. EVERGREEN: it names the agent's personal message without
 * assuming any duration (the message may run 60 to 90 seconds, not "15 seconds")
 * and without calling it a tour (it is the agent's hello, not a walk of a home
 * that is not shot yet). One consistent label across the page.
 */
export function heroVideoLabel(agentName: string | undefined): string {
  const first = firstName(agentName);
  return first ? `A quick hello from ${first}` : "A quick hello from your agent";
}

/** Aria fallback for the hero video element when no title is set. */
export const HERO_VIDEO_ARIA = "A short hello from your agent";

/**
 * Pointer line in the hero agent row to the hello video, which now lives in its
 * own section directly below the hero. EVERGREEN: first person, no duration, never
 * a tour. Keeps the hero compact while still cueing the personal message below.
 */
export const HERO_VIDEO_CUE = "A quick word, just below";

/**
 * The exposure / reach line beneath the campaign frames. Seller-centered and
 * human: concrete about WHERE the home is seen, truthful, no abstract jargon, no
 * duration or listing assumption. First person to match "How I'll Get Your Home
 * Seen".
 */
export const EXPOSURE_LINE =
  "Your home in front of buyers wherever they are already looking: the major search sites, my own buyer list, and the feeds they scroll.";

/**
 * Strong default for the editable VALUATION voice line. Drops the blunt "I don't
 * guess with your money" while keeping the substance: the number is grounded in
 * the home, confirmed in person, never a guess. Agent can rewrite it in Settings.
 */
export function defaultValuationMessage(): string {
  return "Before I recommend a range, I'll walk the home with you and confirm what buyers respond to, so your number is grounded in your home, not a guess.";
}

/**
 * Strong default for the editable personal WELCOME line near the agent in the
 * hero. Warm, evergreen, first person. Agent can rewrite it in Settings.
 */
export function defaultWelcomeLine(): string {
  return "I put this together ahead of our visit, so you can see how I'll treat your home and your sale before we even meet.";
}

/**
 * Capability frame labels for "How I'll get your home seen". These describe the
 * agent's CAPABILITY (set once in Settings), NOT this home's listing or tour
 * (which do not exist before the walkthrough). Honest by construction.
 */
export const CAPABILITY_PHOTO_LABEL = "Photography that sells";
export const CAPABILITY_PHOTO_SUB = "How I shoot every listing";
export const CAPABILITY_VIDEO_LABEL = "A recent video tour";
export const CAPABILITY_VIDEO_SUB = "From a recent listing of mine";
