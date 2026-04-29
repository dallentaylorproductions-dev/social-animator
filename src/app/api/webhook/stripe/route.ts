import { getStripe } from "@/lib/stripe";
import { upsertUser } from "@/lib/db";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * POST /api/webhook/stripe
 *
 * Source-of-truth update path for ongoing subscription state. The Checkout
 * success redirect (/api/checkout/success) writes to KV immediately on first
 * subscription, but renewals, payment failures, cancellations all flow through
 * here.
 *
 * STRIPE_WEBHOOK_SECRET must be set in production. Without it we no-op rather
 * than 500 — useful during initial deploy before the webhook endpoint is
 * configured in the Stripe dashboard.
 */
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!webhookSecret) {
    console.warn(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring event"
    );
    return NextResponse.json({ received: true, ignored: "no_secret" });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] signature verification failed:", message);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Recent Stripe API has `subscription` on invoice as nullable string
        const subId = (invoice as unknown as { subscription?: string | null })
          .subscription;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      // Other events ignored — add cases as we extend.
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const stripe = getStripe();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customer = (await stripe.customers.retrieve(
    customerId
  )) as Stripe.Customer;

  if (!customer.email) {
    console.warn(
      `[stripe-webhook] customer ${customerId} has no email; skipping`
    );
    return;
  }

  const periodEnd =
    sub.items?.data?.[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;

  await upsertUser(customer.email, {
    stripeCustomerId: customerId,
    subscriptionId: sub.id,
    subscriptionStatus: sub.status,
    ...(typeof periodEnd === "number" && { currentPeriodEnd: periodEnd }),
  });
}
