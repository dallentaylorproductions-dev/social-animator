'use client';

import { useEffect, useState } from 'react';
import { findLatestInProgress } from '@/skills/workflow-instance-storage';
import { hasWalkedSample } from '@/lib/onboarding/seen';
import type { SellerPresentationDraft } from '@/tools/seller-presentation/engine/types';
import type { OnboardingSignals } from './today-state';

/**
 * Local onboarding signals for the Today-card seam (DASHBOARD_TODAY_SEAM,
 * Pass 3). Reads the two browser-local signals the seam's richer states need:
 *
 *   - PARTIAL: the latest in-progress seller-presentation WorkflowInstance
 *     that was never published (drafts live only in localStorage; a published
 *     page comes back from the owner-scoped pages route instead and lands the
 *     card on `returning`). We hand the draft's instanceId out so the card can
 *     deep-link a resume (`?id=`) straight back into that exact draft — the
 *     converged-instance resume-on-open pattern the wizard already honors.
 *   - SAMPLE-ONLY: the dedicated `socanim_onboarding_sample_walked` marker.
 *
 * Returns `undefined` until resolved AND whenever the flag is off, so the pure
 * deriver gets no `onboarding` argument and produces the byte-identical Pass-1
 * state set. Reading happens in an effect (SSR-safe; localStorage is
 * client-only) and the deps are flag-only, mirroring useOwnerPagesActivity.
 */

const SELLER_PRESENTATION_SKILL_ID = 'seller-presentation';

export function useTodaySeamSignals(
  enabled: boolean,
): OnboardingSignals | undefined {
  const [signals, setSignals] = useState<OnboardingSignals | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!enabled) {
      setSignals(undefined);
      return;
    }

    const draft = findLatestInProgress<SellerPresentationDraft>(
      SELLER_PRESENTATION_SKILL_ID,
    );
    // Only a NEVER-published draft is a `partial`. A draft carrying a
    // publishedSlug already shows up server-side (→ returning, which wins the
    // precedence anyway), so excluding it here keeps the two stores from
    // double-counting the same page.
    const partial = draft && !draft.publishedSlug ? draft : null;

    setSignals({
      partialInstanceId: partial ? partial.instanceId : null,
      partialLabel: partial ? deriveLabel(partial.draft) : null,
      hasWalkedSample: hasWalkedSample(),
    });
  }, [enabled]);

  return signals;
}

/** Address first, seller name as fallback, null if the draft carries neither. */
function deriveLabel(draft: SellerPresentationDraft | undefined): string | null {
  const address = draft?.propertyAddress?.trim();
  if (address) return address;
  const seller = draft?.preparedFor?.trim();
  return seller || null;
}
