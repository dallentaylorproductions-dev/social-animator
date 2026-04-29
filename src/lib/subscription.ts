import { getUser } from "./db";

/**
 * Source of truth for "can this user access protected tools?". Reads the KV
 * ledger maintained by /api/checkout/success and /api/webhook/stripe.
 *
 * Returns true iff:
 *   - record exists
 *   - status is "active" or "trialing"
 *   - currentPeriodEnd is in the future (or missing — Stripe webhook may not
 *     have populated it yet, but Checkout success path always does)
 */
export async function hasActiveSubscription(email: string): Promise<boolean> {
  const user = await getUser(email);
  if (!user) return false;

  const status = user.subscriptionStatus;
  if (status !== "active" && status !== "trialing") return false;

  if (
    user.currentPeriodEnd &&
    user.currentPeriodEnd < Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return true;
}
