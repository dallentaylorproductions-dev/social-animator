import { auth } from "@/lib/auth";
import { hasActiveSubscription } from "@/lib/subscription";
import { isDevAccessGranted } from "@/lib/dev-access";
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
    // v1.45.3 dev-access bypass: invited beta cohort members who
    // signed up via /access + access code skip the Stripe paywall.
    // The dev_access:[email] KV record is written by the signIn
    // callback in src/lib/auth.ts after the user clicked their
    // magic link (proves email control). Reversible at paid launch
    // by deleting this branch + /access route + /api/access/grant.
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
    "/paywall/:path*",
    "/api/checkout",
    "/api/checkout/:path*",
  ],
};
