import Stripe from "stripe";

/**
 * Stripe SDK accessor. Lazy-initialized to avoid throwing during Next.js
 * page-data collection on builds where STRIPE_SECRET_KEY isn't injected
 * (CI, local builds without .env, etc.). Production routes that actually use
 * Stripe will throw a clear error if the key is missing at request time.
 */
let cached: Stripe | undefined;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Add it to .env.local for dev or Vercel env vars for production."
    );
  }
  cached = new Stripe(key, { typescript: true });
  return cached;
}
