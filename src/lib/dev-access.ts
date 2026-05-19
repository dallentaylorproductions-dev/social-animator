/**
 * Dev-access bypass mechanism (v1.45.3).
 *
 * Parallel sign-in path for invited beta cohort members. Bypasses the
 * subscription paywall in src/middleware.ts without modifying the
 * existing paid signup flow.
 *
 * Two-stage KV pattern guarantees the bypass is only granted to users
 * who proved control of an email (no self-grant by submitting any
 * address through the /access form):
 *
 *   1. /api/access/grant validates the access code and writes a PENDING
 *      record with short TTL, then triggers Auth.js to send the magic
 *      link.
 *   2. When the user clicks the magic link, Auth.js's signIn callback
 *      (src/lib/auth.ts) calls consumeDevAccessPending(email). If a
 *      pending record exists, it's deleted and grantDevAccess() writes
 *      the PERMANENT record.
 *   3. src/middleware.ts checks isDevAccessGranted(email) before the
 *      Stripe sub check; granted users bypass /paywall.
 *
 * Reversibility (at paid launch): delete /access route + /api/access/
 * grant route + the middleware bypass check + this file. ~30 LOC total.
 * Stale dev_access:* records in KV become inert (no further effect).
 */

import { kv } from "@vercel/kv";

const PENDING_PREFIX = "dev_access_pending:";
const GRANTED_PREFIX = "dev_access:";

/** Magic-link expiry in Auth.js defaults to 24h. Match for safety. */
const PENDING_TTL_SECONDS = 24 * 60 * 60;

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

export interface DevAccessRecord {
  email: string;
  /** ISO 8601. */
  grantedAt: string;
  grantedVia: "access-code";
}

/**
 * Stage 1: write the pending record. Called by /api/access/grant AFTER
 * code validation but BEFORE the magic link is sent. Short TTL so a
 * leaked pending record doesn't grant access weeks later.
 */
export async function markPendingDevAccess(email: string): Promise<void> {
  await kv.set(`${PENDING_PREFIX}${normalize(email)}`, "1", {
    ex: PENDING_TTL_SECONDS,
  });
}

/**
 * Stage 2: called by the Auth.js signIn callback after the user clicks
 * the magic link. If a pending record exists, returns true AND deletes
 * the pending key (one-shot). Caller follows up with grantDevAccess()
 * to write the permanent record.
 *
 * Atomic-ish: read-then-delete has a tiny race window where two
 * concurrent sign-ins could both see the pending and both call
 * grantDevAccess. That's fine — grantDevAccess is idempotent and the
 * net effect is the same.
 */
export async function consumeDevAccessPending(
  email: string,
): Promise<boolean> {
  const key = `${PENDING_PREFIX}${normalize(email)}`;
  const existed = await kv.get(key);
  if (existed === null || existed === undefined) return false;
  await kv.del(key);
  return true;
}

/**
 * Write the permanent dev-access record. Idempotent — repeated calls
 * just overwrite the timestamp. No TTL; revocation is explicit via
 * revokeDevAccess.
 */
export async function grantDevAccess(email: string): Promise<void> {
  const record: DevAccessRecord = {
    email: normalize(email),
    grantedAt: new Date().toISOString(),
    grantedVia: "access-code",
  };
  await kv.set(`${GRANTED_PREFIX}${normalize(email)}`, record);
}

/**
 * Middleware-level check. Reads one KV key per protected-route request
 * for users who've gone through the dev-access flow. Vercel KV is
 * sub-millisecond on a warm connection so the per-request cost is
 * negligible at beta-cohort scale.
 */
export async function isDevAccessGranted(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const record = await kv.get<DevAccessRecord>(
    `${GRANTED_PREFIX}${normalize(email)}`,
  );
  return record !== null && record !== undefined;
}

/**
 * Explicit revocation. Removes the permanent record. The user keeps
 * their authenticated session but, on the next protected-route hit,
 * the middleware paywall check applies again.
 */
export async function revokeDevAccess(email: string): Promise<void> {
  await kv.del(`${GRANTED_PREFIX}${normalize(email)}`);
}
