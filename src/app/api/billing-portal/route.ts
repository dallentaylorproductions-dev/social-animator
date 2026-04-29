import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getUser } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/billing-portal
 *
 * Creates a Stripe Customer Portal session so the user can manage / cancel
 * their subscription. Used by the Settings page.
 *
 * Self-authenticates (not protected by middleware) so we can return a clean
 * 401/404 instead of the middleware redirect. UI handles those states.
 */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUser(email);
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file" },
      { status: 404 }
    );
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const stripe = getStripe();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/settings`,
  });

  return NextResponse.json({ url: portalSession.url });
}
