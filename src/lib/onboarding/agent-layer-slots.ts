import type { BrandSettings } from "@/lib/brand";

/**
 * Pure slot logic for the Path A capture (ONBOARDING_HYBRID_V3, Phase 4b).
 *
 * Kept free of any React / component import so the payoff-gating + one-active +
 * completion rules are unit-testable in Node, and so the capture component and
 * its tests share ONE source of truth. The capture is payoff-gated (G2): every
 * slot here is a field that visibly changes the live State A preview.
 */
export type SlotKey = "name" | "headshot" | "contact" | "exposure" | "review";

/** Capture order: hero identity first, reach next, enrichment last. */
export const SLOTS: readonly SlotKey[] = [
  "name",
  "headshot",
  "contact",
  "exposure",
  "review",
];

/** Enrichment slots the agent may defer with "add later" (leaving a ghost). */
export const SKIPPABLE: ReadonlySet<SlotKey> = new Set([
  "headshot",
  "exposure",
  "review",
]);

/** Calm prompt shown for a not-yet-active slot (never a field name dump). */
export const GHOST_LABEL: Record<SlotKey, string> = {
  name: "Your name",
  headshot: "Your face here",
  contact: "Add your contact",
  exposure: "What gets buyers in",
  review: "Add a review",
};

/** Whether a slot's backing field is already satisfied in the Agent Layer. */
export function isSlotDone(slot: SlotKey, s: BrandSettings): boolean {
  switch (slot) {
    case "name":
      return !!s.agentName?.trim();
    case "headshot":
      return !!s.agentPhotoUrl;
    case "contact":
      return !!(s.contactEmail?.trim() || s.contactPhone?.trim());
    case "exposure":
      return !!s.leadEmphasis;
    case "review":
      return !!(s.agentReviews?.length || s.reviewsOutlinkUrl?.trim());
  }
}

/**
 * The slot the agent should land on first — the first one they haven't already
 * satisfied (payoff-gated: a returning agent skips straight past what's real).
 * Returns SLOTS.length when everything is already done (→ the COMPLETED state).
 */
export function firstOpenSlotIndex(s: BrandSettings): number {
  const i = SLOTS.findIndex((slot) => !isSlotDone(slot, s));
  return i === -1 ? SLOTS.length : i;
}

/** Qualitative progress — calm cues, NEVER a percentage (§6). */
export function progressCue(s: BrandSettings): string {
  const hasName = !!s.agentName?.trim();
  const hasContact = !!(s.contactEmail?.trim() || s.contactPhone?.trim());
  if (hasName && hasContact) return "Ready for your first address";
  if (hasContact) return "Reachable";
  if (hasName) return "Looks like you";
  return "Let's make this yours";
}
