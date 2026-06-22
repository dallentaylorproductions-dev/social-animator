import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { isDashboardHomeV2Enabled } from "@/lib/config/dashboard-home-v2";
import {
  isDashboardTodaySeamEnabled,
  isTodaySeamPreviewAllowed,
} from "@/lib/config/dashboard-today-seam";
import { parseSeamPreview } from "./today-state";
import { isOnboardingFirstRunEnabled } from "@/lib/config/onboarding-first-run";
import { isOnboardingFirstRunV2Enabled } from "@/lib/config/onboarding-first-run-v2";
import { isOnboardingHybridV3Enabled } from "@/lib/config/onboarding-first-run-v3";
import { DashboardEntry } from "./DashboardEntry";
import "./sep-studio.css";

/**
 * Dashboard server shell (v1.47 Lane A — SEP-S Studio re-brand).
 *
 * Layer responsibilities:
 *   - Server: auth, AgentProfile resolution (entitlements + KV reads),
 *     the `?testTier=` URL knob, and the static topbar (brand + topnav
 *     + sign-out server action). Sign-out stays an inline server action
 *     because that's the cleanest Next.js App Router idiom for a single
 *     button — no need to extract to a 'use server' module.
 *   - Client (DashboardClient): welcome derived from localStorage (brand
 *     name, listing address, OH events), hero card driven by
 *     getActiveWorkflows + entitlement resolver, three stage sections,
 *     flagship Social Studio + modal, footer.
 *
 * Root: `.sep-studio` is the SINGLE scoping anchor for every CSS rule
 * in ./sep-studio.css. Other routes (/login, /h/[slug], wizard surfaces)
 * never receive this class, so the warm-dark palette / ambient orbs /
 * tile geometry can't leak. data-attrs (`data-bg`, `data-density`,
 * `data-stagedots`) carry static defaults; the TweaksPanel UI from the
 * reference is deliberately not ported (theme picker = A7f.3).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  const email = session?.user?.email ?? "";

  // ?testTier=base|pro|ai — Dallen's internal-test QA knob (§8.5).
  // Reading searchParams forces dynamic rendering on /dashboard, which
  // is fine — the route already depends on auth (also dynamic). The
  // resolver maps the override into AgentProfile.internalTestOverride,
  // which DashboardClient consumes via resolveEntitlements → resolveSkill.
  const sp = await searchParams;
  const agentProfile = await loadAgentProfile(email || null, {
    testTier: sp.testTier,
  });

  // DASHBOARD_HOME_V2 (Pass 1) — read server-side, threaded as a prop so
  // the flag can differ between preview and prod without a NEXT_PUBLIC
  // inline, and the flag-off path never reaches V2 code. Flag-off renders
  // byte-identical to today's dashboard.
  const dashboardHomeV2 = isDashboardHomeV2Enabled();

  // DASHBOARD_TODAY_SEAM (Pass 3) — read server-side, threaded the same way.
  // Only meaningful when DASHBOARD_HOME_V2 is on (the Today card lives in V2);
  // flag-off keeps the Pass-1 Today card byte-identical.
  const dashboardTodaySeam = isDashboardTodaySeamEnabled();

  // QA display override: `?todaySeam=new|sample|partial|returning` forces which
  // Today-card state renders, so all four can be eyeballed on preview from an
  // account that naturally only shows "returning". Double-gated server-side
  // (feature on AND preview/dev env) — null (no override) in production, so it
  // can never affect a real agent. Pure render override; touches no data.
  const todaySeamPreview = isTodaySeamPreviewAllowed()
    ? parseSeamPreview(sp.todaySeam)
    : null;

  // ONBOARDING_FIRST_RUN (Pass 2) / _V2 (Pass 2b) / _HYBRID_V3 (Phase 3-5) -
  // read server-side, threaded as a prop the same way. The entry gate fires for
  // ANY of the three flags (precedence V3 > V2 > V1 at /welcome), so a V3-only
  // preview still routes a brand-new agent into the hybrid flow. With ALL three
  // off, DashboardEntry is a pure pass-through to DashboardClient (no markup, no
  // fetch, no redirect), so the first-run entry stays byte-identical to today.
  const onboardingFirstRun =
    isOnboardingFirstRunEnabled() ||
    isOnboardingFirstRunV2Enabled() ||
    isOnboardingHybridV3Enabled();

  return (
    <main
      className="sep-studio"
      data-bg="warm"
      data-density="comfy"
      data-stagedots="on"
      data-testid="sep-studio-root"
    >
      <div className="ambient" aria-hidden>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div className="app">
        <header className="topbar" data-testid="sep-topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <span className="brand-dot" />
            </span>
            <span className="brand-name">
              SIMPLY EDIT <span className="brand-pro">PRO STUDIO</span>
            </span>
          </div>
          <nav className="topnav" aria-label="Primary">
            {/* Topnav consolidated: Library was dropped (route doesn't
                exist); Brand kit was dropped (redundant with Settings —
                both pointed at /settings, which mounts BrandProfileForm).
                Hero empty-state CTA still says "Open brand kit" because
                that's the action a fresh agent is doing — different
                surfaces, different jobs. */}
            <Link href="/settings" className="topnav-link">
              Settings
            </Link>
            <span className="topnav-sep" aria-hidden />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="topnav-link topnav-quiet"
                data-testid="sep-sign-out"
              >
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <DashboardEntry
          ownerEmail={email}
          onboardingFirstRun={onboardingFirstRun}
          agentProfile={agentProfile}
          dashboardV2={dashboardHomeV2}
          todaySeam={dashboardTodaySeam}
          todaySeamPreview={todaySeamPreview}
        />
      </div>
    </main>
  );
}
