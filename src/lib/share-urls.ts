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
