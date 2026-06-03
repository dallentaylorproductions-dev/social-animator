'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Seller-Presentation entitlement context (v1.47 Lane C).
 *
 * Threads the resolved gate state from /api/entitlements/me into the
 * wizard's client components so the Import-comps button (and any
 * future client-side plug-point UI) can render its tier-aware
 * affordance without prop-drilling AgentProfile through 5+ levels.
 *
 * Why a context instead of restructuring page.tsx as a server-component
 * shell: the SP wizard is already `'use client'` (it owns useState
 * around the WorkflowInstance, currentStep, etc.). Wrapping that in a
 * server-component parent would force splitting state across two
 * layers. A thin context that fetches on mount is much smaller.
 *
 * The fetch carries the `?testTier=` URL param so Dallen's internal-test
 * QA knob still flips the gate state client-side identically to how it
 * flips it server-side on /dashboard.
 *
 * Value:
 *   - `aiAccessState`: 'available' | 'preview-only' | 'upgrade-required'
 *     | 'policy-locked' | 'usage-capped' | null (loading)
 *   - `aiAccessLabel`: calm copy from the resolver (§8.4 voice)
 *   - `suppressUpgradeUi`: hide upgrade messaging in cohort + test paths
 *
 * Loading state is `null` — consumers should treat it as "still
 * resolving" and avoid surfacing a locked affordance prematurely.
 */

export type GateStateClient =
  | 'available'
  | 'preview-only'
  | 'upgrade-required'
  | 'policy-locked'
  | 'usage-capped';

interface SPEntitlement {
  aiAccessState: GateStateClient | null;
  aiAccessLabel: string;
  /** Premium-theme gate (Phase E). `null` while loading; 'available' for Pro/AI tiers, 'upgrade-required'/'policy-locked' otherwise. */
  themeAccessState: GateStateClient | null;
  themeAccessLabel: string;
  suppressUpgradeUi: boolean;
  /** Feature-flag state for comp-import. `null` while loading; `false` hides the affordance entirely. */
  compImportEnabled: boolean | null;
}

const Ctx = createContext<SPEntitlement>({
  aiAccessState: null,
  aiAccessLabel: '',
  themeAccessState: null,
  themeAccessLabel: '',
  suppressUpgradeUi: false,
  compImportEnabled: null,
});

export function useSPEntitlement(): SPEntitlement {
  return useContext(Ctx);
}

export function SPEntitlementProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SPEntitlement>({
    aiAccessState: null,
    aiAccessLabel: '',
    themeAccessState: null,
    themeAccessLabel: '',
    suppressUpgradeUi: false,
    compImportEnabled: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Carry through the URL's ?testTier= so the client-side gate stays
    // consistent with whatever the server is resolving for the same
    // session + URL knob.
    const url = new URL('/api/entitlements/me', window.location.origin);
    const testTier = new URLSearchParams(window.location.search).get(
      'testTier',
    );
    if (testTier) url.searchParams.set('testTier', testTier);

    fetch(url.toString(), { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !data.ok) return;
        setState({
          aiAccessState: data.aiAccess?.state ?? 'available',
          aiAccessLabel: data.aiAccess?.label ?? '',
          themeAccessState: data.themeAccess?.state ?? 'available',
          themeAccessLabel: data.themeAccess?.label ?? '',
          suppressUpgradeUi: !!data.suppressUpgradeUi,
          compImportEnabled: !!data.features?.compImportEnabled,
        });
      })
      .catch(() => {
        // Network failure → leave loading (null). The button stays in
        // its loading state; manual entry remains 100% available below.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
