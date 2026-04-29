import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { upsertUser } from "@/lib/db";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * GET /api/checkout/success?session_id=cs_...
 *
 * Stripe redirects here after a successful Checkout. We retrieve the session,
 * expand the resulting subscription, and write status + period_end into KV
 * so the user can immediately access /dashboard without waiting for the
 * webhook to fire (which may not be configured locally / in preview).
 *
 * Webhook handler covers ongoing updates (renewals, cancellations).
 */
export async function GET(req: Request) {
  const sess = await auth();
  const email = sess?.user?.email;
  if (!email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  try {
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    const sub = checkoutSession.subscription as Stripe.Subscription | null;
    const customer = checkoutSession.customer;
    const customerId =
      typeof customer === "string" ? customer : customer?.id ?? null;

    if (sub) {
      await upsertUser(email, {
        ...(customerId && { stripeCustomerId: customerId }),
        subscriptionId: sub.id,
        subscriptionStatus: sub.status,
        currentPeriodEnd: extractPeriodEnd(sub),
      });
    }
  } catch (err) {
    console.error("[checkout/success] failed to write KV", err);
    // Don't block the user — they paid; webhook will catch up if needed.
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}

/**
 * Stripe API has historically had `current_period_end` on the subscription
 * itself; recent versions moved it to subscription.items[].current_period_end.
 * Try both.
 */
function extractPeriodEnd(
  sub: Stripe.Subscription
): number | undefined {
  // Modern API: subscription items each have their own period end
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;

  // Fallback: legacy field on the subscription
  const legacy = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof legacy === "number") return legacy;

  return undefined;
}
