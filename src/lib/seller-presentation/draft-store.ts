/**
 * Server-side seller-presentation DRAFT store (SP-KEYSTONE).
 *
 * The keystone that completes the "Your pages" library (#63/#64/#65): it
 * moves in-progress drafts from per-device browser localStorage to an
 * owner-indexed Vercel KV store, so any draft is openable, editable, and
 * re-publishable from any device the agent signs in on.
 *
 * Mirrors the published-handout owner-index spine in src/lib/share-urls.ts
 * (HandoutRecord / `user:<email>:handouts`) so the two stores read as one
 * pattern and the privacy guarantee is the same shape:
 *
 *   draft:<instanceId>        →  DraftRecord JSON (the full WorkflowInstance)
 *   user:<email>:drafts       →  Redis SET of this agent's draft instanceIds
 *
 * Two ABSOLUTE gates this module exists to hold (SP-KEYSTONE packet):
 *   1. Never cross agents. Every read / write / list / delete is scoped to
 *      the AUTHENTICATED owner. The owner email is stamped server-side from
 *      the session (never trusted from the client body), and every record
 *      is re-checked against the owner on the way out (defense-in-depth,
 *      exactly like `listOwnerHandoutRecords`). A second account can never
 *      see, list, open, edit, or delete another agent's draft.
 *   2. Never lose a draft. `putDraft` is an idempotent upsert keyed by the
 *      client-minted `instanceId`, so a migration push or a re-saved draft
 *      overwrites in place and never duplicates. The store never deletes a
 *      record except on an explicit owner-checked delete.
 *
 * UNLIKE the published handout (which persists ONLY the public-payload
 * allowlist via `toPublicPayload`), a draft record persists the FULL
 * WorkflowInstance — that is the whole point: the working draft (private
 * pitch points, comp notes, pricing strategy, confidence) must round-trip
 * so the agent can keep editing it elsewhere. That full draft lives ONLY in
 * the owner-scoped `draft:<id>` record and is never served publicly; the
 * public `/h/<slug>` page is still fed exclusively by the publish route's
 * allowlisted payload.
 *
 * The KV-touching functions are thin; the privacy-critical scoping logic is
 * factored into the PURE helpers at the top (`isDraftOwnedBy`,
 * `scopeOwnedDrafts`, `stampOwner`) so the cross-owner-denied behavior is
 * unit-testable in the node-context Playwright specs this repo uses, with
 * no KV in the loop.
 */

import { kv } from "@vercel/kv";
import type { WorkflowInstance } from "@/skills/workflow-instance";

/** The skillId every seller-presentation draft carries. */
export const SELLER_PRESENTATION_SKILL_ID = "seller-presentation";

/**
 * The persisted draft record. Wraps the full `WorkflowInstance` and hoists
 * the authoritative owner + updatedAt to the top level so the owner index
 * can be re-checked and the last-write-wins comparison made without
 * reaching into the nested instance.
 *
 * `ownerEmail` here is the IDENTITY of record — always the lowercased
 * session email, stamped server-side. It is the field every scope check
 * trusts; the nested `instance.ownerEmail` is kept in sync but is never the
 * authority (a client could tamper with the body).
 */
export interface DraftRecord {
  /** Mirrors `instance.instanceId` — the KV key sans prefix. */
  instanceId: string;
  /** Lowercased authoritative owner (session email). The privacy identity. */
  ownerEmail: string;
  /** ISO 8601 UTC — mirror of `instance.timestamps.updatedAt`; the last-write-wins key + index ordering. */
  updatedAt: string;
  /** The full WorkflowInstance (draft + step + timestamps + publish state). */
  instance: WorkflowInstance;
}

/**
 * Best-effort runtime guard for an incoming draft instance at the wire
 * boundary (the PUT route). Validates only the STRUCTURAL fields the store
 * + index depend on — `draft` is opaque per-skill and never inspected, same
 * as the localStorage layer's `isWorkflowInstanceShape`. Also pins
 * `skillId` to seller-presentation so this store can never be used to write
 * a foreign skill's instance into the SP draft namespace. PURE — no KV.
 */
export function isSellerDraftInstance(raw: unknown): raw is WorkflowInstance {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.instanceId !== "string" || r.instanceId.length === 0) return false;
  if (r.skillId !== SELLER_PRESENTATION_SKILL_ID) return false;
  if (!r.timestamps || typeof r.timestamps !== "object") return false;
  const ts = r.timestamps as Record<string, unknown>;
  if (typeof ts.createdAt !== "string") return false;
  if (typeof ts.updatedAt !== "string") return false;
  if (!r.resolvedPrimitives || typeof r.resolvedPrimitives !== "object") {
    return false;
  }
  return true;
}

function draftKey(instanceId: string): string {
  return `draft:${instanceId}`;
}

function ownerIndexKey(ownerEmail: string): string {
  return `user:${ownerEmail.toLowerCase()}:drafts`;
}

// ---------------------------------------------------------------------------
// PURE owner-scoping helpers (no KV) — the privacy spine, unit-testable.
// ---------------------------------------------------------------------------

/**
 * Does this record belong to `email`? Case-insensitive. A record with no
 * owner is owned by NOBODY — never matches (fail closed). This is the single
 * predicate every route + store read consults so the cross-owner rule can
 * never be written two slightly-different ways.
 */
export function isDraftOwnedBy(
  record: DraftRecord | null | undefined,
  email: string | null | undefined,
): boolean {
  if (!record || !email) return false;
  if (!record.ownerEmail) return false;
  return record.ownerEmail.toLowerCase() === email.toLowerCase();
}

/**
 * Filter a fetched batch down to the ones this agent owns, dropping any
 * dangling (null) entry and — defense-in-depth — any record whose ownerEmail
 * doesn't match the index it came from. Mirror of `listOwnerHandoutRecords`'s
 * inner guard: a corrupt index entry must NEVER leak someone else's draft.
 */
export function scopeOwnedDrafts(
  records: Array<DraftRecord | null | undefined>,
  email: string,
): DraftRecord[] {
  const out: DraftRecord[] = [];
  for (const record of records) {
    if (!record) continue;
    if (!isDraftOwnedBy(record, email)) continue;
    out.push(record);
  }
  return out;
}

/**
 * Build the authoritative record for an incoming instance: stamp the owner
 * (lowercased session email) onto BOTH the top-level record and the nested
 * instance, overwriting whatever the client sent — the client is never
 * trusted to declare ownership. `updatedAt` mirrors the instance's own
 * timestamp so the index + LWW comparison use one clock the client controls.
 */
export function stampOwner(
  instance: WorkflowInstance,
  email: string,
): DraftRecord {
  const ownerEmail = email.toLowerCase();
  const stampedInstance: WorkflowInstance = { ...instance, ownerEmail };
  return {
    instanceId: stampedInstance.instanceId,
    ownerEmail,
    updatedAt: stampedInstance.timestamps.updatedAt,
    instance: stampedInstance,
  };
}

// ---------------------------------------------------------------------------
// KV-touching store operations — all owner-scoped.
// ---------------------------------------------------------------------------

export type PutDraftResult =
  | { ok: true; record: DraftRecord }
  | { ok: false; reason: "forbidden" };

/**
 * Idempotent upsert of a draft keyed by its client-minted `instanceId`.
 * Stamps the authoritative owner from `email`, then:
 *   - If a record already exists at this id owned by a DIFFERENT agent,
 *     REFUSE with `forbidden` (never overwrite another agent's draft — the
 *     cross-agent gate). A non-existent id, or one this agent owns, proceeds.
 *   - SET the record + SADD the id into this agent's owner index.
 *
 * Because the key is the stable instanceId, re-running (migration retry,
 * re-save) overwrites in place — no duplicates, never a lost draft.
 */
export async function putDraft(
  email: string,
  instance: WorkflowInstance,
): Promise<PutDraftResult> {
  const record = stampOwner(instance, email);
  const existing = await kv.get<DraftRecord>(draftKey(record.instanceId));
  if (existing && !isDraftOwnedBy(existing, email)) {
    return { ok: false, reason: "forbidden" };
  }
  await kv.set(draftKey(record.instanceId), record);
  await kv.sadd(ownerIndexKey(record.ownerEmail), record.instanceId);
  return { ok: true, record };
}

/**
 * Fetch a single draft, scoped to the owner. Returns null for a missing
 * record OR one owned by another agent — the two are INDISTINGUISHABLE to
 * the caller, so a cross-owner probe can never confirm a draft's existence
 * (the route maps null → 404, never 403, so existence never leaks).
 */
export async function getOwnedDraft(
  email: string,
  instanceId: string,
): Promise<DraftRecord | null> {
  const record = await kv.get<DraftRecord>(draftKey(instanceId));
  if (!isDraftOwnedBy(record, email)) return null;
  return record;
}

/**
 * Every draft this agent owns, most-recent-first. Owner-scoped by
 * construction: it only reads ids from THIS agent's owner index, then
 * re-checks ownerEmail on each fetched record (`scopeOwnedDrafts`). Dangling
 * index entries (id in the set but record gone) are silently dropped.
 */
export async function listOwnedDraftRecords(
  email: string,
): Promise<DraftRecord[]> {
  const ids = (await kv.smembers(ownerIndexKey(email))) ?? [];
  if (ids.length === 0) return [];
  const records = await Promise.all(
    ids.map((id) => kv.get<DraftRecord>(draftKey(id))),
  );
  const owned = scopeOwnedDrafts(records, email);
  owned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return owned;
}

export type DeleteDraftResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "forbidden" };

/**
 * Permanently delete a draft: drop the KV record AND remove its id from the
 * owner index. Owner-checked — a missing record returns `not-found`, a record
 * owned by someone else returns `forbidden` (the route maps BOTH to 404 so
 * existence never leaks across owners).
 */
export async function deleteOwnedDraft(
  email: string,
  instanceId: string,
): Promise<DeleteDraftResult> {
  const record = await kv.get<DraftRecord>(draftKey(instanceId));
  if (!record) return { ok: false, reason: "not-found" };
  if (!isDraftOwnedBy(record, email)) return { ok: false, reason: "forbidden" };
  await kv.del(draftKey(instanceId));
  await kv.srem(ownerIndexKey(record.ownerEmail), instanceId);
  return { ok: true };
}
