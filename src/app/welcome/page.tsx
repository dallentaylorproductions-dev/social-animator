import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOnboardingFirstRunEnabled } from "@/lib/config/onboarding-first-run";
import { WelcomeFlow } from "./WelcomeFlow";
import "./welcome.css";

/**
 * /welcome - the output-first first-run flow (ONBOARDING_FIRST_RUN, Pass 2).
 *
 * A thin SERVER shell, mirroring the seller-presentation landing gate:
 *   - flag OFF -> redirect to /dashboard. The flow does not exist when dark,
 *     so a stray link or a stale tab can never land on it; entry stays
 *     byte-identical to today (the dashboard owns it).
 *   - flag ON  -> resolve the session email + the server-drafts flag once and
 *     thread them down, exactly as the SP page does, so the flow can mint an
 *     owner-scoped draft and (when keystone is on) push it to the server store.
 *
 * The flow itself is a full-screen client experience (WelcomeFlow) with its own
 * scoped stylesheet (welcome.css under `.onb`), NOT the dashboard shell - it is
 * a one-decision-one-reveal mobile sequence, not a shrunk dashboard.
 *
 * force-dynamic: the entire route is flag-gated, so the flag must be read at
 * REQUEST time, never baked at build. Without this the flag-off redirect makes
 * Next prerender the route static (the redirect short-circuits before auth()),
 * which would freeze the build-time flag value and break the runtime flip on
 * preview. The route is auth-gated anyway, so per-request rendering is correct.
 */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (!isOnboardingFirstRunEnabled()) {
    redirect("/dashboard");
  }

  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;
  const serverDraftsEnabled = process.env.SERVER_DRAFTS_ENABLED === "true";

  return (
    <WelcomeFlow
      ownerEmail={ownerEmail}
      serverDraftsEnabled={serverDraftsEnabled}
    />
  );
}
