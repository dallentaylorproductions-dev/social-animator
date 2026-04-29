import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Route protection middleware.
 *
 * H-0b: identity gate only — unauthenticated users on protected routes
 *       redirect to /login with callbackUrl preserved.
 * H-0c (next checkpoint): adds subscription gate — authed but no active sub
 *       redirects to /paywall.
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname, search } = req.nextUrl;

  if (!isLoggedIn) {
    const callbackUrl = encodeURIComponent(pathname + search);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.url)
    );
  }

  return NextResponse.next();
});

export const config = {
  // Match all protected routes. Public surface (/, /login, /api/auth, static
  // assets, _next) is excluded by omission.
  matcher: [
    "/dashboard/:path*",
    "/social-animator/:path*",
    "/settings/:path*",
    "/paywall/:path*",
    "/api/checkout",
    "/api/billing-portal",
  ],
};
