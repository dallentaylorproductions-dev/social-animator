import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOnboardingFirstRunEnabled } from "@/lib/config/onboarding-first-run";
import { isOnboardingFirstRunV2Enabled } from "@/lib/config/onboarding-first-run-v2";
import { isOnboardingHybridV3Enabled } from "@/lib/config/onboarding-first-run-v3";
import { isMarketingZoneRedesignEnabled } from "@/lib/seller-presentation/marketing-zone-redesign";
import { isValuationRedesignEnabled } from "@/lib/seller-presentation/valuation-redesign";
import { WelcomeFlow } from "./WelcomeFlow";
import { WelcomeFlowV2 } from "./WelcomeFlowV2";
import { WelcomeFlowV3 } from "./WelcomeFlowV3";
import { WelcomeAccountReconcile } from "./WelcomeAccountReconcile";
import "./welcome.css";
import "./welcome-v2.css";
import "./welcome-v3.css";

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
  // Precedence at /welcome is strict: V3 > V2 > V1. With ALL THREE flags off the
  // flow does not exist (redirect to /dashboard), so entry stays byte-identical
  // to today. V3 is the dark hybrid SHELL (Phase 3); V2/V1 stay as fallbacks.
  const v3 = isOnboardingHybridV3Enabled();
  const v2 = isOnboardingFirstRunV2Enabled();
  if (!isOnboardingFirstRunEnabled() && !v2 && !v3) {
    redirect("/dashboard");
  }

  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;
  const serverDraftsEnabled = process.env.SERVER_DRAFTS_ENABLED === "true";
  // MARKETING_ZONE_REDESIGN (v1.7 Packet C) — resolved here on the SERVER (the
  // env flag is not NEXT_PUBLIC) and threaded down so the onboarding State-A
  // preview surfaces render the redesigned marketing zone exactly when a flag-on
  // publish would. Flag off → the flows pass false → today's grid, byte-identical.
  const marketingZoneRedesignEnabled = isMarketingZoneRedesignEnabled();
  // VALUATION_REDESIGN (v1.7 Packet B) — resolved on the SERVER (the env flag is
  // not NEXT_PUBLIC) and threaded down so the onboarding State-A preview surfaces
  // render the redesigned valuation section exactly when a flag-on publish would.
  // Flag off → the flows pass false → today's valuation block, byte-identical.
  const valuationRedesignEnabled = isValuationRedesignEnabled();

  // Account-cache reconcile runs on EVERY /welcome entry, ahead of the flow, so
  // a foreign brand left in this browser is cleared before any flow hydrates,
  // renders, or pushes it (the brand-contamination fix). Rendered first so its
  // mount effect fires before the flow subtree's effects; the flow only mounts
  // a brand-reading surface after a user path-click, well after this runs.
  if (v3) {
    return (
      <>
        <WelcomeAccountReconcile email={ownerEmail} />
        <WelcomeFlowV3
          ownerEmail={ownerEmail}
          serverDraftsEnabled={serverDraftsEnabled}
          marketingZoneRedesignEnabled={marketingZoneRedesignEnabled}
          valuationRedesignEnabled={valuationRedesignEnabled}
        />
      </>
    );
  }

  if (v2) {
    return (
      <>
        <WelcomeAccountReconcile email={ownerEmail} />
        <WelcomeFlowV2
          ownerEmail={ownerEmail}
          serverDraftsEnabled={serverDraftsEnabled}
          marketingZoneRedesignEnabled={marketingZoneRedesignEnabled}
          valuationRedesignEnabled={valuationRedesignEnabled}
        />
      </>
    );
  }

  return (
    <>
      <WelcomeAccountReconcile email={ownerEmail} />
      <WelcomeFlow
        ownerEmail={ownerEmail}
        serverDraftsEnabled={serverDraftsEnabled}
      />
    </>
  );
}
