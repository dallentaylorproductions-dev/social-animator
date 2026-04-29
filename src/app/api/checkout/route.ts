import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { PRICING } from "@/lib/pricing";
import { getUser, upsertUser } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for the authenticated user's monthly
 * subscription. Find-or-creates a Stripe customer keyed by email. Returns
 * { url } so the client can redirect.
 */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!PRICING.priceId) {
    return NextResponse.json(
      { error: "Stripe not configured (STRIPE_PRICE_ID missing)" },
      { status: 500 }
    );
  }

  const stripe = getStripe();

  // Find-or-create Stripe customer
  const user = await getUser(email);
  let customerId = user?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { source: "studio" },
    });
    customerId = customer.id;
    await upsertUser(email, { stripeCustomerId: customerId });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PRICING.priceId, quantity: 1 }],
    // Success path writes to KV server-side via /api/checkout/success so the
    // user lands on /dashboard with sub-status already updated, regardless of
    // whether the Stripe webhook has fired yet.
    success_url: `${origin}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/paywall?canceled=true`,
    allow_promotion_codes: true,
  });

  if (!checkoutSession.url) {
    return NextResponse.json(
      { error: "Stripe did not return a checkout URL" },
      { status: 500 }
    );
  }
  return NextResponse.json({ url: checkoutSession.url });
}
