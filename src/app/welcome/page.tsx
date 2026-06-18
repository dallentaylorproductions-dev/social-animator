import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOnboardingFirstRunEnabled } from "@/lib/config/onboarding-first-run";
import { isOnboardingFirstRunV2Enabled } from "@/lib/config/onboarding-first-run-v2";
import { WelcomeFlow } from "./WelcomeFlow";
import { WelcomeFlowV2 } from "./WelcomeFlowV2";
import "./welcome.css";
import "./welcome-v2.css";

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
  // V2 supersedes V1 at /welcome when on; with BOTH flags off the flow does not
  // exist (redirect to /dashboard), so entry stays byte-identical to today.
  const v2 = isOnboardingFirstRunV2Enabled();
  if (!isOnboardingFirstRunEnabled() && !v2) {
    redirect("/dashboard");
  }

  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;
  const serverDraftsEnabled = process.env.SERVER_DRAFTS_ENABLED === "true";

  if (v2) {
    return (
      <WelcomeFlowV2
        ownerEmail={ownerEmail}
        serverDraftsEnabled={serverDraftsEnabled}
      />
    );
  }

  return (
    <WelcomeFlow
      ownerEmail={ownerEmail}
      serverDraftsEnabled={serverDraftsEnabled}
    />
  );
}
