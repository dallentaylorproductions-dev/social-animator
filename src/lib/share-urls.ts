/**
 * Web share URL infrastructure (OH Prep Commit 2 / Audit 1B).
 *
 * The publish-to-URL plumbing that lets agents text/email visitor-facing
 * artifacts as short links. Foundation for the OH Prep visitor handout
 * (Commit 5) and the future Listing Landing Page (H-9).
 *
 * Stateless-principle exception: published handouts persist in Vercel KV
 * because the recipient opens the URL on a different device than the
 * agent. All other user content (drafts, brand profile) stays in
 * browser localStorage.
 *
 * Reuses the existing `@vercel/kv` pattern from src/lib/db.ts —
 * colon-namespaced keys, lowercase email as user identity. No wrapper
 * abstraction added.
 *
 * D5 (1B): retention = indefinite + soft-revoke + read-time expiresAt check
 * D6 (1B): URL scheme = /h/[slug]
 * D8 (1B): slug = 8-char Crockford base32 (no I/L/O/U), CSPRNG via
 *          globalThis.crypto.getRandomValues, SET NX collision-safe
 * D9 (1B): owner index = Redis SET via kv.sadd / kv.smembers (atomic)
 */

import { kv } from '@vercel/kv';

// Crockford base32 — no I, L, O, U for visual disambiguation.
// 32 chars; 256 / 32 = 8 → no modulo bias when mapping random bytes.
const SLUG_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const SLUG_LENGTH = 8;
const PUBLISH_RETRY_ATTEMPTS = 3;

/**
 * Handout type discriminator. Extensible: new visitor surfaces (Listing
 * Landing Page, Showing Tour Page) add a new type value here and a new
 * rendering branch in `/h/[slug]/page.tsx` without migrating the
 * persistence shape.
 */
export type HandoutType =
  | 'open-house-handout'
  | 'listing-landing'
  | (string & {}); // future-extensible; runtime-validated by consumers

/**
 * The persisted record. `data` is the type-specific payload — opaque at
 * this layer; the consuming tool validates its shape per `type`.
 */
export interface HandoutRecord {
  slug: string;
  type: HandoutType;
  /** Auth.js user identity — lowercase email, matches src/lib/db.ts convention. */
  ownerEmail: string;
  /** ISO 8601 UTC. */
  createdAt: string;
  updatedAt: string;
  /** ISO 8601 UTC. Absent = indefinite. Past expiresAt triggers read-time auto-revoke. */
  expiresAt?: string;
  /** Soft-delete flag. Set true to take the handout down; the record stays for owner-list visibility. */
  revoked?: boolean;
  /**
   * SP-LIB — reversible archive flag for the "Your pages" library. An
   * archived page stops serving publicly (treated like `revoked` at
   * fetch time, so the seller's link 404s) yet stays visible in the
   * owner's library so the agent can Restore it. Distinct from `revoked`
   * (a harder take-down) so the two intents stay separable: archived =
   * "closed listing, free the slot, keep it to restore later."
   */
  archived?: boolean;
  /** Type-specific payload. Validated by the consuming tool. */
  data: Record<string, unknown>;
}

export type PublishResult =
  | { ok: true; slug: string }
  | { ok: false; error: 'collision-exhausted' };

function handoutKey(slug: string): string {
  return `handout:${slug}`;
}

function ownerIndexKey(ownerEmail: string): string {
  return `user:${ownerEmail.toLowerCase()}:handouts`;
}

/**
 * Generate a random 8-char Crockford base32 slug. CSPRNG (Web Crypto API,
 * works in both Node and Edge runtimes). No modulo bias.
 */
export function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    // 256 % 32 === 0, so direct modulo is bias-free.
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

/**
 * Publish a new handout. Atomic SET NX with retry on collision. Returns
 * the assigned slug on success, or a collision-exhausted error after
 * `PUBLISH_RETRY_ATTEMPTS` attempts (effectively never at 8-char base32).
 *
 * Owner-index SADD is best-effort — the handout is the source of truth;
 * the owner-list is convenience for the future "my handouts" management
 * surface. A missed SADD doesn't break the handout itself.
 */
export async function publishHandout(opts: {
  type: HandoutType;
  ownerEmail: string;
  data: Record<string, unknown>;
  expiresAt?: string;
}): Promise<PublishResult> {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < PUBLISH_RETRY_ATTEMPTS; attempt++) {
    const slug = generateSlug();
    const record: HandoutRecord = {
      slug,
      type: opts.type,
      ownerEmail: opts.ownerEmail.toLowerCase(),
      createdAt: now,
      updatedAt: now,
      expiresAt: opts.expiresAt,
      data: opts.data,
    };
    // SET NX returns 'OK' on success, null on existing key.
    const result = await kv.set(handoutKey(slug), record, { nx: true });
    if (result !== null) {
      await kv.sadd(ownerIndexKey(record.ownerEmail), slug);
      return { ok: true, slug };
    }
  }
  return { ok: false, error: 'collision-exhausted' };
}

/**
 * Look up a handout by slug. Returns null for missing, revoked, or expired
 * records — all three surface as 404 from the consumer's perspective.
 */
export async function fetchHandout(slug: string): Promise<HandoutRecord | null> {
  const record = await kv.get<HandoutRecord>(handoutKey(slug));
  if (!record) return null;
  if (record.revoked) return null;
  // SP-LIB — an archived page is taken down publicly (same visitor-facing
  // outcome as revoked: 404). The owner still sees it via the library's
  // owner-scoped listing so they can Restore it.
  if (record.archived) return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return null;
  }
  return record;
}

/**
 * Soft-revoke a handout. Owner must match. The record stays in KV with
 * `revoked: true` so the owner can see it in their list; fetch returns
 * null thereafter.
 */
export async function revokeHandout(
  slug: string,
  ownerEmail: string,
): Promise<boolean> {
  const record = await kv.get<HandoutRecord>(handoutKey(slug));
  if (!record) return false;
  if (record.ownerEmail !== ownerEmail.toLowerCase()) return false;
  await kv.set(handoutKey(slug), {
    ...record,
    revoked: true,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Update a handout's data or expiresAt. Slug unchanged; updatedAt refreshed.
 * Used for edit-after-publish (Audit 1B §9).
 */
export async function updateHandout(
  slug: string,
  ownerEmail: string,
  patch: Partial<Pick<HandoutRecord, 'data' | 'expiresAt'>>,
): Promise<boolean> {
  const record = await kv.get<HandoutRecord>(handoutKey(slug));
  if (!record) return false;
  if (record.ownerEmail !== ownerEmail.toLowerCase()) return false;
  const updated: HandoutRecord = {
    ...record,
    data: patch.data !== undefined ? patch.data : record.data,
    expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : record.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(handoutKey(slug), updated);
  return true;
}

/**
 * List all slugs owned by an agent — feeds the future "my handouts"
 * management surface (Pro tier). Includes revoked + expired entries so
 * the agent can see what they've taken down.
 */
export async function listOwnerHandouts(
  ownerEmail: string,
): Promise<string[]> {
  const slugs = await kv.smembers(ownerIndexKey(ownerEmail));
  return slugs ?? [];
}

/**
 * SP-LIB — fetch the FULL records for every handout an agent owns, in no
 * particular order. Unlike the visitor-facing `fetchHandout`, this returns
 * revoked + archived + expired records too (the owner needs to see them in
 * the library to Restore / understand state). Dangling index entries
 * (slug in the set but record gone) are silently dropped.
 *
 * Owner-scoped by construction: it only reads slugs from THIS agent's
 * owner index, so it can never surface another agent's pages — the
 * privacy spine of the "Your pages" library.
 */
export async function listOwnerHandoutRecords(
  ownerEmail: string,
): Promise<HandoutRecord[]> {
  const slugs = await listOwnerHandouts(ownerEmail);
  if (slugs.length === 0) return [];
  const records = await Promise.all(
    slugs.map((slug) => kv.get<HandoutRecord>(handoutKey(slug))),
  );
  const out: HandoutRecord[] = [];
  for (const record of records) {
    if (!record) continue;
    // Defense-in-depth: never trust a record whose ownerEmail doesn't
    // match the index it came from (a corrupt index entry must not leak
    // someone else's page).
    if (record.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase()) continue;
    out.push(record);
  }
  return out;
}

/**
 * SP-LIB — toggle a handout's reversible archive flag. Owner must match
 * (same guard as `revokeHandout`). `archived: true` takes the page down
 * publicly and frees its cap slot; `false` restores it. Refreshes
 * `updatedAt`. Returns false for a missing record or an owner mismatch.
 */
export async function setHandoutArchived(
  slug: string,
  ownerEmail: string,
  archived: boolean,
): Promise<boolean> {
  const record = await kv.get<HandoutRecord>(handoutKey(slug));
  if (!record) return false;
  if (record.ownerEmail !== ownerEmail.toLowerCase()) return false;
  await kv.set(handoutKey(slug), {
    ...record,
    archived,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

// ===========================================================================
// B0c — durable per-agent pre-listing page.
//
// Unlike the per-publish seller pages (random 8-char `handout:<slug>` records,
// a NEW url every publish), the standalone "why list with us" page is ONE
// DURABLE page per agent: republishing updates the SAME url so the agent can
// text the link once and keep it current (the cohort-example durable-URL
// lesson). That requires a STABLE slug derived from the agent's identity, not
// a random one — and a SEPARATE key namespace so a derived slug can never
// collide with a random seller slug.
//
//   • slug      = `deriveAgentPageSlug(email)` — SHA-256(email) → 12-char
//                 Crockford base32. Deterministic (same agent → same slug),
//                 opaque (no email in the url), and a DIFFERENT LENGTH from the
//                 8-char seller slug so the two slug spaces can never overlap.
//   • key       = `prelisting:<slug>` — its own namespace, never `handout:`.
//   • publish   = overwrite-in-place (NOT SET NX), preserving the original
//                 createdAt — republish refreshes `data` + `updatedAt` only.
// ===========================================================================

/** B0c — handout type discriminator for the standalone pre-listing page. */
export const PRELISTING_TYPE = 'prelisting' as const;

/** Length of the derived per-agent slug. Distinct from SLUG_LENGTH (8) so the
 *  durable + random slug spaces never overlap. */
const PRELISTING_SLUG_LENGTH = 12;

function prelistingKey(slug: string): string {
  return `prelisting:${slug}`;
}

/**
 * Derive the STABLE per-agent pre-listing slug from the agent's email. SHA-256
 * (Web Crypto — works in both Node and Edge runtimes), mapped byte-by-byte onto
 * the Crockford base32 alphabet. `256 % 32 === 0`, so the modulo is bias-free.
 * Deterministic: the same lowercased email always yields the same slug, which
 * is what makes the published url durable across republishes.
 */
export async function deriveAgentPageSlug(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(`prelisting:${normalized}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let slug = '';
  for (let i = 0; i < PRELISTING_SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

/**
 * Publish (or republish) the agent's durable pre-listing page. Derives the
 * stable slug, then writes `prelisting:<slug>` IN PLACE — overwriting any
 * prior record at the same key so the url never changes. The original
 * `createdAt` is preserved across republishes; only `data` + `updatedAt` move.
 * A republish also clears any prior `revoked` flag (re-publishing is the
 * explicit "put it back up" action).
 */
export async function publishPrelistingPage(opts: {
  ownerEmail: string;
  data: Record<string, unknown>;
}): Promise<{ ok: true; slug: string }> {
  const ownerEmail = opts.ownerEmail.toLowerCase();
  const slug = await deriveAgentPageSlug(ownerEmail);
  const existing = await kv.get<HandoutRecord>(prelistingKey(slug));
  const now = new Date().toISOString();
  const record: HandoutRecord = {
    slug,
    type: PRELISTING_TYPE,
    ownerEmail,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    data: opts.data,
  };
  await kv.set(prelistingKey(slug), record);
  await kv.sadd(ownerIndexKey(ownerEmail), slug);
  return { ok: true, slug };
}

/**
 * Look up a durable pre-listing page by slug. Returns null for missing,
 * revoked, or expired records — all surface as 404 from the recipient's
 * perspective, exactly like `fetchHandout`.
 */
export async function fetchPrelistingPage(
  slug: string,
): Promise<HandoutRecord | null> {
  const record = await kv.get<HandoutRecord>(prelistingKey(slug));
  if (!record) return null;
  if (record.revoked) return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return null;
  }
  return record;
}
