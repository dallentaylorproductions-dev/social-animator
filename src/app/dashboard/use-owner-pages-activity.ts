'use client';

import { useEffect, useState } from 'react';
import type { ServerPageSummary } from '@/lib/seller-presentation/pages-library';

/**
 * Owner-scoped seller-page activity for the V2 dashboard (Today card +
 * Seller Presentation flagship).
 *
 * SINGLE SOURCE: reads the SAME owner-scoped endpoint "Your pages" reads
 * (`GET /api/seller-presentation/pages`) — no duplicated owner/follow-up
 * logic on the dashboard. The route already scopes to the session email
 * server-side and returns `liveCount` (active, non-archived) plus the
 * per-page `worthFollowUp` advisory; we derive the follow-up COUNT the
 * same way the library does (`countWorthFollowUp`-equivalent filter).
 *
 * Degrades calmly: when the library route is inert (503 feature-disabled),
 * the agent isn't signed in (401), or the fetch errors, status resolves to
 * 'unavailable' and the dashboard simply omits the activity counts rather
 * than guessing — the Today card falls back to a neutral create CTA.
 */

export type OwnerPagesActivityStatus = 'loading' | 'ready' | 'unavailable';

export interface OwnerPagesActivity {
  status: OwnerPagesActivityStatus;
  /** Total pages incl. archived — distinguishes new (0) vs returning (>0). */
  totalPages: number;
  /** Live (non-archived) pages — the route's own `liveCount`. */
  activeCount: number;
  /** Pages the route flagged `worthFollowUp` (advisory follow-up nudge). */
  worthFollowUpCount: number;
}

interface PagesResponse {
  ok: boolean;
  pages?: ServerPageSummary[];
  liveCount?: number;
}

const INITIAL: OwnerPagesActivity = {
  status: 'loading',
  totalPages: 0,
  activeCount: 0,
  worthFollowUpCount: 0,
};

export function useOwnerPagesActivity(): OwnerPagesActivity {
  const [activity, setActivity] = useState<OwnerPagesActivity>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/seller-presentation/pages', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`pages ${res.status}`);
        return (await res.json()) as PagesResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const pages = data.ok && Array.isArray(data.pages) ? data.pages : [];
        setActivity({
          status: 'ready',
          totalPages: pages.length,
          activeCount:
            typeof data.liveCount === 'number'
              ? data.liveCount
              : pages.filter((p) => !p.archived).length,
          worthFollowUpCount: pages.filter((p) => p.worthFollowUp).length,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setActivity({ ...INITIAL, status: 'unavailable' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return activity;
}
