/**
 * Dev-access bypass mechanism.
 *
 * Parallel sign-in path for invited beta cohort members. Bypasses the
 * subscription paywall in src/middleware.ts without modifying the
 * existing paid signup flow.
 *
 * v1.47 Lane A polish: cohort sign-in is DIRECT. The beta-code
 * Credentials provider in src/lib/auth.ts validates the access code
 * inside authorize() and calls grantDevAccess() to write the permanent
 * dev_access:<email> record before Auth.js issues the session — no
 * magic-link loop, no two-stage promotion. Knowledge of the
 * shared-secret code IS the verification for the closed cohort.
 *
 * The pending-record helpers (markPendingDevAccess /
 * consumeDevAccessPending) survive in case a future flow needs the
 * proven-email-control variant again; the signIn callback in
 * src/lib/auth.ts still calls consumeDevAccessPending defensively for
 * any other sign-in (it's a no-op when no pending key exists).
 *
 * Reversibility (at paid launch): delete the beta-code provider +
 * the /login code field + the middleware bypass check + this file.
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
 * Stage 1 of the two-stage email-proven pattern: write a short-TTL
 * pending record. Unused by the current direct-sign-in flow but kept
 * for any future surface that needs to gate on proven email control.
 */
export async function markPendingDevAccess(email: string): Promise<void> {
  await kv.set(`${PENDING_PREFIX}${normalize(email)}`, "1", {
    ex: PENDING_TTL_SECONDS,
  });
}

/**
 * Stage 2 of the two-stage pattern. If a pending record exists,
 * returns true AND deletes the pending key (one-shot). The signIn
 * callback in src/lib/auth.ts still calls this defensively, but since
 * the direct beta-code provider no longer writes pending records, it
 * is a no-op in the current flow.
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
