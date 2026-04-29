import { kv } from "@vercel/kv";

/**
 * Vercel KV-backed user record. Stores ONLY paywall ledger data — no user
 * content, no PII beyond email. User-edited content (brand profile, in-progress
 * forms) lives in browser localStorage.
 */
export interface UserRecord {
  email: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused";
  /** Unix seconds. Set from Stripe subscription.current_period_end. */
  currentPeriodEnd?: number;
  /** Unix seconds; set on every upsert. */
  updatedAt?: number;
}

const userKey = (email: string) => `user:${email.toLowerCase()}`;

export async function getUser(email: string): Promise<UserRecord | null> {
  return (await kv.get<UserRecord>(userKey(email))) ?? null;
}

/** Merge-update a user record. Always normalizes email to lowercase. */
export async function upsertUser(
  email: string,
  patch: Partial<UserRecord>
): Promise<UserRecord> {
  const lowered = email.toLowerCase();
  const existing = (await getUser(lowered)) ?? { email: lowered };
  const updated: UserRecord = {
    ...existing,
    ...patch,
    email: lowered,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  await kv.set(userKey(lowered), updated);
  return updated;
}
