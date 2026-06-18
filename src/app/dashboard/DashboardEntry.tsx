'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentProfile } from '@/lib/entitlements/types';
import { DashboardClient } from './DashboardClient';
import { useOwnerPagesActivity } from './use-owner-pages-activity';
import { hasSeenOnboarding } from '@/lib/onboarding/seen';

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
  onboardingFirstRun,
  agentProfile,
  dashboardV2,
}: {
  onboardingFirstRun: boolean;
  agentProfile: AgentProfile;
  dashboardV2: boolean;
}) {
  if (!onboardingFirstRun) {
    return <DashboardClient agentProfile={agentProfile} dashboardV2={dashboardV2} />;
  }
  return (
    <OnboardingEntryGate
      dashboard={
        <DashboardClient agentProfile={agentProfile} dashboardV2={dashboardV2} />
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
function OnboardingEntryGate({ dashboard }: { dashboard: React.ReactNode }) {
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
      router.replace('/welcome');
      return;
    }
    // Returning agent or unavailable source - fall through to the dashboard.
    setDecision('stay');
  }, [activity, router]);

  if (decision === 'deciding') {
    return (
      <div data-testid="dashboard-loading" className="dashboard-loading">
        <div style={{ minHeight: '480px' }} aria-hidden />
      </div>
    );
  }
  return <>{dashboard}</>;
}
