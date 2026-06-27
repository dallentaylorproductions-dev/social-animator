'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentProfile } from '@/lib/entitlements/types';
import type { TodayState } from './today-state';
import { DashboardClient } from './DashboardClient';
import { useOwnerPagesActivity } from './use-owner-pages-activity';
import { hasSeenOnboarding } from '@/lib/onboarding/seen';
import { reconcileAccountOwnership } from '@/lib/account-storage';

/**
 * useLayoutEffect runs before the browser paints AND before child components'
 * passive (useEffect) hydration — so the account-cache reconcile clears a
 * prior agent's blobs before DashboardClient / the onboarding gate read them,
 * with no stale-data flash. It's a no-op during SSR (React skips layout
 * effects server-side), so fall back to useEffect there to avoid the dev
 * warning without changing client behavior.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Dashboard entry (ONBOARDING_FIRST_RUN, Pass 2) - the first-run gate.
 *
 * Sits between the server shell (page.tsx) and DashboardClient so the gate's
 * fetch + redirect logic only exists when the flag is ON. When OFF this is a
 * pure pass-through: it renders <DashboardClient/> with the same props and adds
 * no markup, no hook, no fetch - so flag-off is byte-identical to today and a
 * returning user is never delayed.
 *
 * When ON, a brand-new agent (zero owned seller pages) who hasn't already seen
 * or skipped the flow is routed into the full-screen /welcome experience; a
 * returning agent (>=1 page), an agent who already saw it, or an unavailable
 * activity source all fall straight through to the dashboard. The gate keeps
 * DashboardClient untouched - no first-run code reaches the flag-off path.
 */
export function DashboardEntry({
  ownerEmail,
  onboardingFirstRun,
  studioProfileSetup = false,
  agentProfile,
  dashboardV2,
  todaySeam = false,
  todaySeamPreview = null,
}: {
  /**
   * The authenticated email (server-resolved). Account-cache isolation: if
   * this browser's per-account blobs belong to a DIFFERENT agent, they're
   * wiped before any child hydrates — so signing in as a new email never
   * shows the prior agent's name/listing/draft. Not flag-gated (correctness).
   */
  ownerEmail: string;
  onboardingFirstRun: boolean;
  /**
   * STUDIO_PROFILE_SETUP — when ON, the first-run gate routes a brand-new agent to
   * /studio instead of /welcome. Also arms the gate on its own, so studio routing
   * works even with every /welcome onboarding flag off. Default false → flag-off is
   * byte-identical (gate mounts only for the onboarding flags, destination /welcome).
   */
  studioProfileSetup?: boolean;
  agentProfile: AgentProfile;
  dashboardV2: boolean;
  /** DASHBOARD_TODAY_SEAM (Pass 3) — server-resolved; forwarded untouched. */
  todaySeam?: boolean;
  /**
   * QA display override (preview/dev only) — the forced Today-card state, or
   * null. Already gated server-side; forwarded untouched.
   */
  todaySeamPreview?: TodayState | null;
}) {
  // Reconcile the local cache against the authenticated identity BEFORE
  // children read it (layout effect fires before child passive effects).
  // A same-agent round-trip matches and keeps everything; a different agent
  // (account switch / reused incognito / shared device) gets a clean slate.
  useIsomorphicLayoutEffect(() => {
    reconcileAccountOwnership(ownerEmail);
  }, [ownerEmail]);

  // The gate exists only when a first-run flow is armed (any /welcome onboarding
  // flag, OR studio setup). With all off this is a pure pass-through — byte-identical.
  if (!onboardingFirstRun && !studioProfileSetup) {
    return (
      <DashboardClient
        agentProfile={agentProfile}
        dashboardV2={dashboardV2}
        todaySeam={todaySeam}
        todaySeamPreview={todaySeamPreview}
      />
    );
  }
  return (
    <OnboardingEntryGate
      // STUDIO_PROFILE_SETUP wins the destination when on (the new guided setup);
      // otherwise the unchanged /welcome onboarding.
      destination={studioProfileSetup ? '/studio' : '/welcome'}
      dashboard={
        <DashboardClient
          agentProfile={agentProfile}
          dashboardV2={dashboardV2}
          todaySeam={todaySeam}
          todaySeamPreview={todaySeamPreview}
        />
      }
    />
  );
}

type GateDecision = 'deciding' | 'stay';

/**
 * Only mounted when the flag is ON. Reads the SAME owner-scoped activity the
 * Today card uses (single source - no duplicated owner logic) and decides:
 *   - new (0 pages) + not already seen  -> replace() into /welcome,
 *   - returning, already-seen, or unavailable -> render the dashboard.
 *
 * While the activity is still loading it shows the existing calm dashboard
 * placeholder (same testid), so a new agent never flashes the cold dashboard
 * before the redirect lands.
 */
function OnboardingEntryGate({
  dashboard,
  destination,
}: {
  dashboard: React.ReactNode;
  /** Where a brand-new agent is routed: /studio (studio setup) or /welcome. */
  destination: string;
}) {
  const router = useRouter();
  const activity = useOwnerPagesActivity();
  const [decision, setDecision] = useState<GateDecision>('deciding');

  useEffect(() => {
    // Already seen / skipped - stick to the dashboard, never re-nag.
    if (hasSeenOnboarding()) {
      setDecision('stay');
      return;
    }
    // Still resolving owned pages - keep showing the calm placeholder.
    if (activity.status === 'loading') return;
    // Brand-new agent: route into the first-run flow. Stay in 'deciding'
    // (placeholder) until the client nav lands so the dashboard never flashes.
    if (activity.status === 'ready' && activity.totalPages === 0) {
      router.replace(destination);
      return;
    }
    // Returning agent or unavailable source - fall through to the dashboard.
    setDecision('stay');
  }, [activity, router, destination]);

  if (decision === 'deciding') {
    return (
      <div data-testid="dashboard-loading" className="dashboard-loading">
        <div style={{ minHeight: '480px' }} aria-hidden />
      </div>
    );
  }
  return <>{dashboard}</>;
}
