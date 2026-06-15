/**
 * Server-side BRAND SETTINGS store (mirrors SP-KEYSTONE's draft store).
 *
 * Moves an agent's brand/setup (identity, proof, marketing, signature, recent
 * listings, brand-kit colors, etc.) off per-device browser localStorage and
 * into an owner-scoped Vercel KV record, so the setup an agent does on one
 * device is present on every device they sign in on and survives a cache clear.
 *
 * This is the SAME pattern as src/lib/seller-presentation/draft-store.ts — the
 * two stores read as one shape and carry the same privacy guarantee — with one
 * simplification: brand settings are ONE record per owner, so the KV key embeds
 * the owner and is inherently owner-scoped; no separate owner-index SET is
 * needed (drafts need `user:<email>:drafts` only because they are many-per-user
 * keyed by instanceId).
 *
 *   brand:<email>  →  BrandSettingsRecord JSON (owner + updatedAt + settings)
 *
 * Two ABSOLUTE gates this module holds (same as the draft store):
 *   1. Never cross agents. Every read / write is scoped to the AUTHENTICATED
 *      owner. The owner email is stamped server-side from the session (never
 *      trusted from the client body), the key embeds the lowercased owner, and
 *      every record is re-checked against the owner on the way out
 *      (defense-in-depth). A leak here would expose one agent's brand/proof to
 *      another — the hard privacy gate.
 *   2. Never lose / never clobber. `putBrandSettings` is an idempotent upsert
 *      with last-write-wins by `updatedAt`, so a stale second device or an older
 *      migration push can never overwrite a fresher edit made elsewhere.
 *
 * The KV-touching functions are thin; the privacy-critical scoping + LWW logic
 * is factored into the PURE helpers (`isBrandOwnedBy`, `stampBrandOwner`,
 * `brandServerCopyIsNewer`) so the cross-owner-denied behavior is unit-testable
 * in the node-context Playwright specs this repo uses, with no KV in the loop.
 */

import { kv } from "@vercel/kv";
import type { BrandSettings } from "@/lib/brand";

/**
 * The persisted brand-settings record. Wraps the `BrandSettings` blob and
 * hoists the authoritative owner + updatedAt to the top level so the owner
 * check and the last-write-wins comparison can be made without reaching into
 * the settings.
 *
 * `ownerEmail` here is the IDENTITY of record — always the lowercased session
 * email, stamped server-side. `updatedAt` is the client-supplied edit time
 * (the one clock both devices control) used for last-write-wins.
 */
export interface BrandSettingsRecord {
  /** Lowercased authoritative owner (session email). The privacy identity. */
  ownerEmail: string;
  /** ISO 8601 UTC edit time — the last-write-wins key. */
  updatedAt: string;
  /** The full brand settings blob. */
  settings: BrandSettings;
}

function brandKey(ownerEmail: string): string {
  return `brand:${ownerEmail.toLowerCase()}`;
}

/**
 * Best-effort runtime guard for an incoming settings blob at the wire boundary
 * (the PUT route). Like `isSellerDraftInstance`, it validates only the
 * STRUCTURAL minimum: a non-null object carrying a string `agentName` (the one
 * always-present field). The settings are otherwise opaque on the wire and get
 * the full field-by-field clamp at every READ boundary (`normalizeBrandSettings`
 * / the consumer hook), mirroring how the draft store treats the opaque
 * per-skill `draft`. PURE — no KV.
 */
export function isBrandSettingsShape(raw: unknown): raw is BrandSettings {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return typeof r.agentName === "string";
}

// ---------------------------------------------------------------------------
// PURE owner-scoping + LWW helpers (no KV) — the privacy spine, unit-testable.
// ---------------------------------------------------------------------------

/**
 * Does this record belong to `email`? Case-insensitive. A record with no owner
 * is owned by NOBODY — never matches (fail closed). The single predicate every
 * route + store read consults so the cross-owner rule is never written two
 * slightly-different ways. Mirror of `isDraftOwnedBy`.
 */
export function isBrandOwnedBy(
  record: BrandSettingsRecord | null | undefined,
  email: string | null | undefined,
): boolean {
  if (!record || !email) return false;
  if (!record.ownerEmail) return false;
  return record.ownerEmail.toLowerCase() === email.toLowerCase();
}

/**
 * Last-write-wins decision (PURE): does an already-stored record strictly
 * supersede an incoming write? ISO `updatedAt` strings compare
 * lexicographically == chronologically. True ⇒ drop the incoming (stale) write
 * so a slow second device / an older migration re-push can't clobber a fresher
 * edit. Equal timestamps are NOT newer (an idempotent re-save overwrites).
 * Mirror of `serverCopyIsNewer`.
 */
export function brandServerCopyIsNewer(
  existing: BrandSettingsRecord | null | undefined,
  incomingUpdatedAt: string,
): boolean {
  return !!existing && existing.updatedAt > incomingUpdatedAt;
}

/**
 * Build the authoritative record for an incoming save: stamp the owner
 * (lowercased session email), overwriting whatever the client sent — the client
 * is never trusted to declare ownership. `updatedAt` is the client-supplied
 * edit time so the LWW comparison uses one clock both devices control; a missing
 * / non-string value fails closed to the empty string (older than any real ISO
 * stamp, so it never wins a conflict). Mirror of `stampOwner`.
 */
export function stampBrandOwner(
  settings: BrandSettings,
  email: string,
  updatedAt: string,
): BrandSettingsRecord {
  return {
    ownerEmail: email.toLowerCase(),
    updatedAt: typeof updatedAt === "string" ? updatedAt : "",
    settings,
  };
}

// ---------------------------------------------------------------------------
// KV-touching store operations — all owner-scoped.
// ---------------------------------------------------------------------------

export type PutBrandResult = { ok: true; record: BrandSettingsRecord };

/**
 * Idempotent upsert of this agent's brand settings, keyed by the owner email.
 * Stamps the authoritative owner from `email`, then applies last-write-wins:
 * if the stored copy is STRICTLY NEWER than the incoming one, the write is a
 * NO-OP and the newer server copy stands (returned as `record` so the caller
 * can re-sync its local cache). An EQUAL timestamp overwrites (idempotent
 * re-save). Because the key embeds the owner, a cross-owner write is
 * impossible by construction. Mirror of `putDraft`.
 */
export async function putBrandSettings(
  email: string,
  settings: BrandSettings,
  updatedAt: string,
): Promise<PutBrandResult> {
  const record = stampBrandOwner(settings, email, updatedAt);
  const existing = await kv.get<BrandSettingsRecord>(brandKey(record.ownerEmail));
  // Last-write-wins by updatedAt: a strictly-newer stored copy wins; the
  // incoming stale write is dropped to protect the fresher edit.
  if (brandServerCopyIsNewer(existing, record.updatedAt)) {
    return { ok: true, record: existing as BrandSettingsRecord };
  }
  await kv.set(brandKey(record.ownerEmail), record);
  return { ok: true, record };
}

/**
 * Fetch this agent's brand settings, scoped to the owner. Returns null when no
 * record exists yet OR — defense-in-depth — one whose ownerEmail doesn't match
 * (which the embedded-owner key makes structurally impossible, but the check
 * mirrors `getOwnedDraft` so a corrupt record can never leak). Mirror of
 * `getOwnedDraft`.
 */
export async function getOwnedBrandSettings(
  email: string,
): Promise<BrandSettingsRecord | null> {
  const record = await kv.get<BrandSettingsRecord>(brandKey(email));
  if (!isBrandOwnedBy(record, email)) return null;
  return record;
}
