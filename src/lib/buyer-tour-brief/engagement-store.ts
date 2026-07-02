/**
 * Buyer Tour Brief — first-party engagement store (BUYER_TOUR_ANALYTICS).
 *
 * Persists the per-tour engagement AGGREGATE (counters + last-seen), keyed by tour
 * slug in OUR OWN Vercel KV — the same store `/tour/[slug]` reads from (see
 * share-urls.ts). This is our data, not GreatSchools data, so the no-store constraint
 * does NOT apply; we store freely.
 *
 * Shape choice: one small aggregate record per tour (`tour-engagement:<slug>`), NOT a
 * raw per-event log and NOT embedded in the `handout:<slug>` record. Keeping it in a
 * SEPARATE key means:
 *   • high-frequency counter writes never rewrite (or risk clobbering) the published
 *     tour payload;
 *   • the record stays bounded (counters, not rows) and cheap;
 *   • NO PII is ever near it by construction — the aggregate carries only counts +
 *     timestamps (see engine/engagement.ts).
 *
 * The privacy boundary is the pure `validateTrackPayload` (engine); this layer only
 * folds an already-validated event into the aggregate and enforces a coarse per-tour
 * write cap.
 */

import { kv } from "@vercel/kv";
import {
  applyEvent,
  isOverWriteCap,
  type BuyerTourTrackPayload,
  type TourEngagement,
} from "@/tools/buyer-tour-brief/engine/engagement";

function engagementKey(slug: string): string {
  return `tour-engagement:${slug}`;
}

/**
 * Read the raw aggregate for a tour, or null if none yet. Owner-agnostic; callers
 * that expose it to an agent must enforce ownership themselves (the track GET route
 * checks the handout's ownerEmail before returning a summary).
 */
export async function readTourEngagement(
  slug: string,
): Promise<TourEngagement | null> {
  return (await kv.get<TourEngagement>(engagementKey(slug))) ?? null;
}

export type RecordResult =
  | { ok: true; capped: false }
  | { ok: true; capped: true }
  | { ok: false; reason: "error" };

/**
 * Record ONE validated event into a tour's aggregate. Read-modify-write of the small
 * counter record. Enforces the per-tour write cap: once a tour hits
 * TOUR_ENGAGEMENT_WRITE_CAP accepted writes, further events are silently dropped
 * (returns capped: true) so a single tour can't be spammed unbounded — the page and
 * the endpoint stay healthy regardless.
 *
 * Best-effort by contract: the caller (track route) is fire-and-forget, so any KV
 * hiccup surfaces as ok:false and the route still returns a success-shaped no-content
 * response. Nothing here ever throws into the request path.
 */
export async function recordTourEngagement(
  payload: BuyerTourTrackPayload,
  nowIso: string,
): Promise<RecordResult> {
  try {
    const current = await readTourEngagement(payload.tourSlug);
    if (isOverWriteCap(current)) {
      return { ok: true, capped: true };
    }
    const next = applyEvent(current, payload, nowIso);
    await kv.set(engagementKey(payload.tourSlug), next);
    return { ok: true, capped: false };
  } catch (err) {
    console.warn("[buyer-tour/track] engagement write failed", err);
    return { ok: false, reason: "error" };
  }
}
