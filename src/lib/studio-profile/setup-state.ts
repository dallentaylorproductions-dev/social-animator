/**
 * Studio Profile — guided-setup state model (Slice 1, PURE).
 *
 * The single source of truth for the six segments, the two phases, and the
 * client-ready QUALITY BAR (a threshold, not a percentage). No React, no
 * storage, no window — so the segment logic + the client-ready gate are
 * unit-testable in a node context, and both the desktop console and the mobile
 * sequence read the same predicates.
 *
 * Slice 1 builds Phase 1 (You · Reach · Proof). Phase 2 segments (How you sell ·
 * Recent work · Brand) are STUBBED as upcoming in the rail; their "done"
 * predicates are still defined here so a RETURNING agent who already configured
 * that data in Settings shows an honest check, and so `isFullyComplete` is ready
 * for the Phase 2 follow-on.
 */
import type { BrandSettings } from "@/lib/brand";

export type SegmentKey = "you" | "reach" | "proof" | "sell" | "work" | "brand";
export type Phase = 1 | 2;

export interface SegmentDef {
  key: SegmentKey;
  /** Short rail/segment label (the mock's "You · Reach · Proof · …"). */
  label: string;
  phase: Phase;
}

/** The six labeled segments, in order. */
export const SEGMENTS: readonly SegmentDef[] = [
  { key: "you", label: "You", phase: 1 },
  { key: "reach", label: "Reach", phase: 1 },
  { key: "proof", label: "Proof", phase: 1 },
  { key: "sell", label: "How you sell", phase: 2 },
  { key: "work", label: "Recent work", phase: 2 },
  { key: "brand", label: "Brand", phase: 2 },
];

/** The steps Slice 1 actually captures (Phase 1 · Client-ready). */
export const PHASE1_STEPS: readonly SegmentKey[] = ["you", "reach", "proof"];

const has = (v?: string | null): boolean => !!v && v.trim().length > 0;

/* ─────────────────────────── per-segment "done" ─────────────────────────── */

/** You: a name + a brokerage. Headshot is optional (clean initials fall back). */
export function isYouDone(b: BrandSettings): boolean {
  return has(b.agentName) && has(b.brokerage);
}

/** Reach: at least one reachable contact (email or phone). Link is a bonus. */
export function isReachDone(b: BrandSettings): boolean {
  return has(b.contactEmail) || has(b.contactPhone);
}

/**
 * Proof: one piece of proof a seller can trust — the recommended action (a
 * pasted review) OR either fallback (years of experience / one proof point), so
 * the step never dead-ends and the page still reads credible.
 */
export function isProofDone(b: BrandSettings): boolean {
  const review = b.agentReviews?.[0];
  const hasReview = !!review && has(review.body) && has(review.attributionName);
  return hasReview || has(b.agentYearsInArea) || has(b.whyUs?.differentiators?.[0]);
}

/** Phase 2 (stubbed in Slice 1) — honest checks for a returning agent's data. */
export function isSellDone(b: BrandSettings): boolean {
  return (b.whyUs?.marketingApproach?.length ?? 0) > 0;
}
export function isWorkDone(b: BrandSettings): boolean {
  return (b.recentListings?.length ?? 0) > 0;
}
export function isBrandDone(b: BrandSettings): boolean {
  return has(b.brandAccent) || !!b.logoDataUrl;
}

/** Resolve any segment's done-state from the brand record. */
export function isSegmentDone(key: SegmentKey, b: BrandSettings): boolean {
  switch (key) {
    case "you":
      return isYouDone(b);
    case "reach":
      return isReachDone(b);
    case "proof":
      return isProofDone(b);
    case "sell":
      return isSellDone(b);
    case "work":
      return isWorkDone(b);
    case "brand":
      return isBrandDone(b);
  }
}

/** The set of completed segment keys (for the rail checks + funnel depth). */
export function completedSegments(b: BrandSettings): SegmentKey[] {
  return SEGMENTS.map((s) => s.key).filter((k) => isSegmentDone(k, b));
}

/* ─────────────────────────── thresholds ─────────────────────────── */

/**
 * Client-ready = the QUALITY BAR, not a count: the first seller page will have
 * the agent (name + brokerage, headshot or clean initials), a reachable
 * contact, and one piece of proof. Reaching it triggers the mid-flow checkpoint
 * — NOT the exit (full completion stays the preferred path).
 */
export function isClientReady(b: BrandSettings): boolean {
  return isYouDone(b) && isReachDone(b) && isProofDone(b);
}

/** All six segments done — the Phase 2 follow-on's completion gate. */
export function isFullyComplete(b: BrandSettings): boolean {
  return SEGMENTS.every((s) => isSegmentDone(s.key, b));
}

/** An empty, valid WhyUs the "one proof point" fallback can seed without pulling default example copy. */
export const EMPTY_WHYUS = {
  differentiators: [] as string[],
  marketingApproach: [],
  performanceStats: [],
  howWeWork: [],
} as const;
