'use client';

import { useState } from 'react';

/**
 * Ambient spotlight (Onboarding redesign, Pass 2).
 *
 * ONE short product-belief line riding on what just happened. It teaches VALUE,
 * never the backend (no property-data source, no Street View, no beacon). It is
 * ignorable by construction: a single inline line with a dismiss affordance,
 * NEVER a blocking modal, never trapping the agent on the step.
 */
export function Spotlight({
  text,
  testid,
}: {
  text: string;
  testid?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="onb__spotlight" data-testid={testid ?? 'onb-spotlight'} role="note">
      <span className="onb__spotlight-dot" aria-hidden />
      <span>{text}</span>
      <button
        type="button"
        className="onb__spotlight-x"
        aria-label="Dismiss tip"
        onClick={() => setDismissed(true)}
      >
        &times;
      </button>
    </div>
  );
}

// The five belief one-liners live in a pure module (spotlights.ts) so a spec
// can assert their count + copy without pulling React. Re-exported here for the
// flow's convenience.
export { ONBOARDING_SPOTLIGHTS } from '@/lib/onboarding/spotlights';
