import { auth } from "@/lib/auth";
import { hasActiveSubscription } from "@/lib/subscription";
import { NextResponse } from "next/server";

/**
 * Two-stage gate: identity then subscription.
 *
 *   anonymous → /login
 *   authed, no active sub → /paywall
 *   authed, active sub → through
 *
 * Bypass list (auth still required, but sub-check skipped):
 *   /paywall — destination of the gate; can't redirect-loop to itself
 *   /api/checkout, /api/checkout/success — the upgrade path itself; user
 *     needs to reach these to GET an active sub
 */
export default auth(async (req) => {
  const isLoggedIn = !!req.auth;
  const { pathname, search } = req.nextUrl;

  if (!isLoggedIn) {
    const callbackUrl = encodeURIComponent(pathname + search);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.url)
    );
  }

  // Bypass sub-check on the paywall and checkout-flow routes
  if (
    pathname.startsWith("/paywall") ||
    pathname.startsWith("/api/checkout")
  ) {
    return NextResponse.next();
  }

  const email = req.auth?.user?.email;
  if (email) {
    const active = await hasActiveSubscription(email);
    if (!active) {
      return NextResponse.redirect(new URL("/paywall", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/social-animator/:path*",
    "/settings/:path*",
    "/paywall/:path*",
    "/api/checkout",
    "/api/checkout/:path*",
  ],
};
