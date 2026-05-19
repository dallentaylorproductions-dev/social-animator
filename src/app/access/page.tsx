import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDevAccessGranted } from "@/lib/dev-access";
import { AccessForm } from "./AccessForm";

/**
 * Beta access route (v1.45.3).
 *
 * Private — shared via direct URL by the team admin. robots: noindex
 * lives in the sibling layout.tsx. The form POSTs to
 * /api/access/grant; on success, the user receives a magic link that,
 * when clicked, grants the subscription-paywall bypass via the signIn
 * callback in src/lib/auth.ts.
 *
 * Server-side guard: when the magic link is clicked, Auth.js redirects
 * back to the URL that originally called signIn() — which is /access
 * itself. Without this guard, users would land on the form again and
 * assume sign-in failed. If the session already has a dev-access grant,
 * jump straight to /dashboard.
 *
 * Existing /login flow is untouched — non-dev users continue through
 * the normal magic-link + Stripe-paywall path.
 */
export default async function AccessPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (email && (await isDevAccessGranted(email))) {
    redirect("/dashboard");
  }
  return <AccessForm />;
}
