import { auth } from "@/lib/auth";
import { hasActiveSubscription } from "@/lib/subscription";
import { isDevAccessGranted } from "@/lib/dev-access";
import { isBuyerTourBuilderV2Enabled } from "@/lib/config/buyer-tour-builder-v2";
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
  // Test-only bypass: skip auth/subscription checks when running E2E
  // tests against a non-production build. The bypass requires BOTH
  // conditions simultaneously to prevent any chance of leaking into
  // production:
  //   - NODE_ENV !== 'production' (Next.js sets this automatically in
  //     production builds; Vercel respects it)
  //   - E2E_TESTING === '1' (only set by playwright.config.ts when
  //     Playwright spawns the dev server for tests; never set in any
  //     other environment)
  // Even if E2E_TESTING somehow leaked into Vercel prod env vars by
  // misconfiguration, the NODE_ENV check still blocks the bypass.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_TESTING === "1"
  ) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;

  // Buyer Tour Brief builder (BUYER_TOUR_BUILDER_V2, Lever 2). The route is in the
  // matcher so the middleware runs on it, but the auth gate only applies when V2 is
  // ON. When the flag is OFF we early-return before the identity redirect, so
  // `/buyer-tour` behaves EXACTLY as today (byte-identical: no sign-in gate — the
  // publish/enrich APIs still enforce their own auth). When ON, it falls through to
  // the identity gate below; the subscription bypass list adds `/buyer-tour` so it is
  // identity-only (no paywall — this is a dark beta tool).
  if (pathname.startsWith("/buyer-tour") && !isBuyerTourBuilderV2Enabled()) {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;

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

  // Buyer Tour Brief builder is identity-only when V2 is on: sign-in required
  // (handled by the identity gate above), but no paywall — a dark beta tool that
  // should not be entangled with billing. (Reached only when the V2 flag is on;
  // flag-off already early-returned before the identity gate.)
  if (pathname.startsWith("/buyer-tour")) {
    return NextResponse.next();
  }

  const email = req.auth?.user?.email;
  if (email) {
    // Beta cohort bypass: invited members who signed in via the
    // beta-code Credentials provider on /login skip the Stripe
    // paywall. The dev_access:[email] KV record is written by that
    // provider's authorize() in src/lib/auth.ts (v1.47 Lane A polish:
    // direct sign-in — knowledge of the code is the verification, no
    // magic-link loop). Reversible at paid launch by deleting this
    // branch + the beta-code provider + the /login code field.
    if (await isDevAccessGranted(email)) {
      return NextResponse.next();
    }
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
    "/listing-flyer/:path*",
    "/settings/:path*",
    // Studio Profile guided setup writes to the signed-in agent's BrandSettings
    // and uploads to their Blob store (auth-gated), so it must require auth:
    // unauthenticated → /login?callbackUrl=/studio, then the whole flow has
    // account context and never bounces mid-flow. (Flag-off still redirects to
    // /dashboard inside the page; the matcher only adds the identity gate.)
    "/studio/:path*",
    "/studio",
    // Buyer Tour Brief builder (BUYER_TOUR_BUILDER_V2). Present in the matcher so the
    // middleware can gate it when the flag is on; the middleware body early-returns
    // (byte-identical to today) when the flag is off. Identity-only (no paywall).
    "/buyer-tour/:path*",
    "/buyer-tour",
    "/paywall/:path*",
    "/api/checkout",
    "/api/checkout/:path*",
  ],
};
