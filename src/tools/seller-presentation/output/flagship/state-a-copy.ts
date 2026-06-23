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

import type { LeadEmphasisKey } from "@/lib/seller-presentation/lead-emphasis";

/**
 * Seller State A · Signature B — the campaign-spread launch-story headline.
 *
 * Rendered as `{lead} <em>{em}</em>.` The DEFAULT reproduces the shipped headline
 * byte-for-byte, so an agent who never picked a lead emphasis (every existing
 * page + every flag-off publish) renders exactly as today. When the agent picked
 * one during onboarding (`BrandSettings.leadEmphasis` -> `payload.leadEmphasis`),
 * the chosen lever becomes the populated headline. Evergreen + seller-facing, no
 * em-dash, no over-claim, no duration / "the listing" assumption.
 */
export const CAMPAIGN_HEADLINE_DEFAULT = {
  lead: "Produced beautifully.",
  em: "Put in front of buyers",
} as const;

/**
 * The tasteful ghost sub-line shown beneath the launch-story headline when the
 * agent has chosen a lead emphasis but has not added any capability samples or
 * recent listings yet (the onboarding BEAT 5 climax, and any live page in the
 * same state). Evergreen + seller-facing; names no asset and claims nothing the
 * page does not have. The headline (the chosen lever) carries the meaning.
 */
export const CAMPAIGN_GHOST_SUB = "My plan to get your home seen.";

export const CAMPAIGN_HEADLINE_BY_EMPHASIS: Record<
  LeadEmphasisKey,
  { lead: string; em: string }
> = {
  "listing-launch": { lead: "A polished launch.", em: "Put in front of buyers" },
  "social-reach": { lead: "Produced beautifully.", em: "Seen where buyers scroll" },
  "buyer-network": { lead: "Produced beautifully.", em: "Shown to ready buyers" },
  "open-house": { lead: "Doors open.", em: "Buyers walk through" },
  "video-story": { lead: "Told as a story.", em: "Buyers remember" },
  "fast-followup": { lead: "No buyer slips.", em: "Followed up fast" },
  "local-market": { lead: "Priced for here.", em: "Placed for this market" },
};

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
 * The welcome-video (Z1) pedestal eyebrow — a quiet mono label that sets the
 * moment above the hello heading. EVERGREEN, no duration / tour assumption;
 * pairs as the before-the-visit counterpart to the "At Our Meeting" section.
 */
export const HELLO_EYEBROW = "Before We Meet";

/**
 * The Z1 caption pill prompt, shown on a solid surface beneath the player (never
 * over the video) next to the runtime + the single earned mint status dot.
 */
export const HELLO_CAPTION = "Press play";

/**
 * Z2 proof-panel (the `+6%` neighborhood delta) — the mono label + the muted
 * sub-line. EVERGREEN framing of the agent-stamped trailing-12-month trend; the
 * number itself is data-driven (the area YoY delta).
 */
export const PROOF_NEIGHBORHOOD_LABEL = "Neighborhood · trailing 12 mo";
export const PROOF_NEIGHBORHOOD_CAPTION = "vs. last year";

/**
 * Z3 proof-panel (the `$580K – $700K` comps range) — the mono label above the
 * range. Frames it as nearby comparable sales (matching the context sentence
 * below it), never the subject home's number.
 */
export const PROOF_RANGE_LABEL = "Recently sold nearby";

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

/**
 * v1.7 Packet C — the redesigned marketing zone (MARKETING_ZONE_REDESIGN flag).
 * "THE WORK" is a flat swipe showcase of the agent's craft (photo · video ·
 * more); "WHAT'S INCLUDED" is the editorial capabilities list. The micro-cue and
 * affordance chip make the showcase read as clearly swipeable (the fix for "flat,
 * nothing feels clickable"). Reserved sentence-case display; mono eyebrows match
 * the rest of the State-A vocabulary.
 */
export const WORK_EYEBROW = "The work";
export const WORK_SWIPE_CUE = "swipe the craft";
export const WORK_NEXT_CHIP = "See the work";
export const INCLUDED_EYEBROW = "What's included";

/**
 * The quiet tinted lead-in that reframes from craft to proof, sitting between the
 * "WHAT'S INCLUDED" list and the existing exposure coverflow so the showcase and
 * the coverflow never read as one continuous swipe region (the differentiation
 * buffer). Renders only when there is craft above AND a coverflow below.
 */
export const CAMPAIGN_LEADIN =
  "That's the craft. Here's the proof it reaches buyers.";

/**
 * Zone 5 listings coverflow ("Put in front of buyers"). Evergreen, source-
 * agnostic, no em-dash. The per-card label is a plain "Views" (never a named
 * portal — the honesty gate: no specific-portal claim on a number we don't
 * control). The aggregate line is summed from the agent's OWN real per-card
 * numbers at render, so it is never a hollow claim.
 */
export const COVERFLOW_EYEBROW = "Recent listings, real reach";
export const COVERFLOW_VIEWS_LABEL = "Views";

/**
 * The aggregate proof lockup beneath the fan (the shared proof-number language:
 * mono label · summed Newsreader teal number · mono caption). The number is the
 * agent's OWN real per-card view counts, summed at render and grouped with
 * thousands separators, so it is never a hollow claim. Renders only when enough
 * cards carry a number.
 */
export const COVERFLOW_AGGREGATE_LABEL = "Across recent listings";
export const COVERFLOW_AGGREGATE_CAP = "Buyer views";
