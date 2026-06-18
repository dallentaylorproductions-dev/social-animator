/**
 * Seller State A - the agent's "lead emphasis": the ONE exposure lever they pick
 * during onboarding (BEAT 5) for how they get a home seen. Set-once, agent-
 * constant, reused across every future page (same pattern as `agentReviews`);
 * the chosen lever drives `CampaignSpread`'s launch-story headline.
 *
 * This module is the single low-level VOCABULARY for that value - the canonical
 * key set, the type, the boundary clamp, and the agent-facing lever labels. It
 * has no React / no copy-rendering deps so every layer can share one source of
 * truth: the BrandSettings load-clamp, the publish projector + read-clamp, the
 * onboarding flow's lever UI, and the campaign-headline map all import from here.
 * (The seller-facing headline COPY lives in `state-a-copy.ts`, keyed by these.)
 */

export const LEAD_EMPHASIS_KEYS = [
  "listing-launch",
  "social-reach",
  "buyer-network",
  "open-house",
  "video-story",
  "fast-followup",
  "local-market",
] as const;

export type LeadEmphasisKey = (typeof LEAD_EMPHASIS_KEYS)[number];

/** True only for a known lever key. Defense-at-boundary for stored/wire values. */
export function isLeadEmphasisKey(value: unknown): value is LeadEmphasisKey {
  return (
    typeof value === "string" &&
    (LEAD_EMPHASIS_KEYS as readonly string[]).includes(value)
  );
}

/** A known lever key or undefined - the clamp every boundary uses. */
export function clampLeadEmphasis(value: unknown): LeadEmphasisKey | undefined {
  return isLeadEmphasisKey(value) ? value : undefined;
}

/**
 * Agent-facing lever labels (the only text the agent ever sees - the locked
 * Gate-3 refinement keeps the internal key out of the UI). Used by the
 * onboarding BEAT 5 tap UI.
 */
export const LEAD_EMPHASIS_LABELS: Record<LeadEmphasisKey, string> = {
  "listing-launch": "Polished listing launch",
  "social-reach": "Social reach",
  "buyer-network": "Buyer network",
  "open-house": "Open-house visibility",
  "video-story": "Video and storytelling",
  "fast-followup": "Fast buyer follow-up",
  "local-market": "Local market exposure",
};

/**
 * Locked Gate-3 split: four primary levers shown first, the rest behind a "more"
 * drawer, so the one-tap promise stays true on mobile.
 */
export const LEAD_EMPHASIS_PRIMARY: readonly LeadEmphasisKey[] = [
  "listing-launch",
  "social-reach",
  "buyer-network",
  "open-house",
];

export const LEAD_EMPHASIS_MORE: readonly LeadEmphasisKey[] = [
  "video-story",
  "fast-followup",
  "local-market",
];
