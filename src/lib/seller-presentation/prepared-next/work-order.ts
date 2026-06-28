/**
 * PREPARED_NEXT — the Work Order: type + KV persistence (lifecycle + idempotency).
 *
 * One Work Order per page + asset type + trigger + CONTENT VERSION. The content
 * version is the handout record's `updatedAt` (no `payloadVersion` exists; this
 * is the verified content-change signal, and `setHandoutFollowedUp` deliberately
 * does NOT bump it, so it tracks content edits, not nudge metadata). Legacy /
 * absent → `"initial"`.
 *
 * KV namespace `prepared:<slug>` (NEW; decoupled from the hot `views:<slug>`
 * write path). The record is created at the view event (status `eligible`, no
 * generation) and read back later — possibly in a different session — when the
 * agent clicks "Prepare follow-up". `slug` is globally unique (8-char Crockford
 * base32, SET NX), so it alone keys the record; `accountId` rides the body only
 * for the per-account daily generation ceiling.
 *
 * Idempotency: `ensureEligibleWorkOrder` uses a SET NX create so two rapid
 * (ms-apart) view events for the same page+version still yield exactly ONE Work
 * Order and one eventual generation.
 */

import { kv } from "@vercel/kv";
import type { Moment } from "./moment";
import type { Confidence } from "./confidence";

export type WorkOrderStatus =
  | "eligible"
  | "prepared"
  | "reviewed"
  | "copied"
  | "dismissed"
  | "stale"
  | "failed"
  | "failed_final";

export type ApprovalAction = "approve" | "edit" | "dismiss";

export type WorkOrderDestination = "review_card" | "copy" | "manual_send";

export interface PreparedDraft {
  textVariant: string;
  emailVariant: string;
}

export interface FollowUpRecapWorkOrder {
  moment: Moment;
  /** One-line rationale shown to the agent. */
  whyNow: string;
  availableContext: string[];
  missingContext: string[];
  suggestedAsset: "follow_up_recap";
  /** Null until a prepare click computes it (eligible stage carries no confidence). */
  confidence: Confidence | null;
  /** Null until generated AND passed the validator. */
  draftOutput: PreparedDraft | null;
  approvalAction: ApprovalAction | null;
  /** v0 delivery contract ONLY. */
  destination: WorkOrderDestination;
  /** ALWAYS null in v0 — no CRM behavior. */
  writeback: null;
  status: WorkOrderStatus;
  /** Lowercased owner email — the account identity for the daily ceiling. */
  accountId: string;
  /** = handout `updatedAt` ?? "initial". Part of the WO identity. */
  version: string;
  /** Enforces the two-generation cap (one initial + one manual retry). */
  generationCount: number;
}

const PREPARED_KEY_PREFIX = "prepared:";

export function preparedKey(slug: string): string {
  return `${PREPARED_KEY_PREFIX}${slug}`;
}

/**
 * The idempotency identity: `accountId:slug:follow_up_recap:viewed_signal:<version>`.
 * `slug` is globally unique, so this is unique per content version; computing it
 * twice yields the same string, so the same view produces exactly one Work Order.
 */
export function workOrderIdentity(opts: {
  accountId: string;
  slug: string;
  version: string;
}): string {
  return `${opts.accountId.toLowerCase()}:${opts.slug}:follow_up_recap:viewed_signal:${opts.version}`;
}

/** Build a fresh `eligible` Work Order (no generation, no confidence yet). */
export function newEligibleWorkOrder(opts: {
  moment: Moment;
  accountId: string;
  version: string;
}): FollowUpRecapWorkOrder {
  return {
    moment: opts.moment,
    whyNow: "A seller recently engaged with this page.",
    availableContext: [],
    missingContext: [],
    suggestedAsset: "follow_up_recap",
    confidence: null,
    draftOutput: null,
    approvalAction: null,
    destination: "review_card",
    writeback: null,
    status: "eligible",
    accountId: opts.accountId.toLowerCase(),
    version: opts.version,
    generationCount: 0,
  };
}

/** Read a page's Work Order (or null if none recorded). */
export async function getWorkOrder(
  slug: string,
): Promise<FollowUpRecapWorkOrder | null> {
  return (await kv.get<FollowUpRecapWorkOrder>(preparedKey(slug))) ?? null;
}

/** Persist a Work Order (plain overwrite; callers own the state transition). */
export async function saveWorkOrder(
  slug: string,
  wo: FollowUpRecapWorkOrder,
): Promise<void> {
  await kv.set(preparedKey(slug), wo);
}

/**
 * Ensure an `eligible` Work Order exists for this page + version, race-safely.
 *
 *   - same version already stored → return it untouched (idempotent: one WO,
 *     one eventual generation, even for ms-apart duplicate view events).
 *   - a DIFFERENT version stored (the page changed) → supersede with a fresh
 *     eligible WO for the new version (a new identity; dismissal does not carry
 *     across versions, which is the "page materially changed → prepare again" rule).
 *   - nothing stored → create via SET NX; if a concurrent create won the race,
 *     re-read and return that one.
 *
 * Best-effort by design: the caller fires this from the view beacon and ignores
 * failures, so a transient KV hiccup never affects the seller's page.
 */
export async function ensureEligibleWorkOrder(opts: {
  moment: Moment;
  accountId: string;
  version: string;
}): Promise<FollowUpRecapWorkOrder> {
  const slug = opts.moment.subject;
  const existing = await getWorkOrder(slug);
  if (existing && existing.version === opts.version) return existing;

  const fresh = newEligibleWorkOrder(opts);

  if (!existing) {
    const result = await kv.set(preparedKey(slug), fresh, { nx: true });
    if (result === null) {
      // Lost the create race — return whoever won.
      return (await getWorkOrder(slug)) ?? fresh;
    }
    return fresh;
  }

  // Existing WO is for an older content version → supersede.
  await kv.set(preparedKey(slug), fresh);
  return fresh;
}
