import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOnboardingFirstRunEnabled } from "@/lib/config/onboarding-first-run";
import { isOnboardingFirstRunV2Enabled } from "@/lib/config/onboarding-first-run-v2";
import { isOnboardingHybridV3Enabled } from "@/lib/config/onboarding-first-run-v3";
import { isReplayRequested } from "@/lib/onboarding/entry-gate";
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

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Precedence at /welcome is strict: V3 > V2 > V1. With ALL THREE flags off the
  // flow does not exist (redirect to /dashboard), so entry stays byte-identical
  // to today. V3 is the dark hybrid SHELL (Phase 3); V2/V1 stay as fallbacks.
  const v3 = isOnboardingHybridV3Enabled();
  const v2 = isOnboardingFirstRunV2Enabled();

  // REPLAY — explicit `/welcome?replay=1`. Re-shows the hybrid flow for the
  // CURRENT account (even a returning one) for live demos + re-smokes, and does
  // so REGARDLESS of the onboarding flags so it works on prod without flipping
  // the product flag. It is checked BEFORE the flag-off redirect, so replay
  // renders even when onboarding is fully dark. Non-destructive: the flow runs
  // in `replay` mode below, which sandboxes every write (no real brand/page/
  // draft is touched). The explicit param + an auth session (enforced by
  // middleware) is the whole gate — a normal returning user never appends it,
  // so they can't land in replay by accident.
  const sp = await searchParams;
  const replay = isReplayRequested(sp.replay);

  if (!isOnboardingFirstRunEnabled() && !v2 && !v3 && !replay) {
    redirect("/dashboard");
  }

  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;
  const serverDraftsEnabled = process.env.SERVER_DRAFTS_ENABLED === "true";

  // Replay always uses the hybrid V3 flow (the "new onboarding" being demoed),
  // in non-destructive preview mode. Reconcile still runs first, identically.
  if (replay) {
    return (
      <>
        <WelcomeAccountReconcile email={ownerEmail} />
        <WelcomeFlowV3
          ownerEmail={ownerEmail}
          serverDraftsEnabled={serverDraftsEnabled}
          replay
        />
      </>
    );
  }

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
