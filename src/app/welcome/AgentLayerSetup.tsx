'use client';

import { useMemo } from 'react';
import { useBrandSettings } from '@/lib/brand';
import type { HandoutRecord } from '@/lib/share-urls';
import { StateAPage } from '@/tools/seller-presentation/output/flagship/StateAPage';
import { buildSamplePreviewPayload } from '@/lib/onboarding/sample-listing-draft';

/**
 * AgentLayerSetup — the Path A container (ONBOARDING_HYBRID_V3).
 *
 * Phase 4a — the read-only "sample home, real you" MIRROR. It renders the
 * genuine seller page from { the sample listing (SAMPLE_LISTING_DRAFT) + the
 * agent's REAL Agent Layer (via useBrandSettings) } through the SAME publish
 * pipeline the seller receives — so the listing is sample but the hero, agent
 * band, reviews, contact, and marketing reflect the real profile (with the
 * existing graceful fallbacks when sparse: monogram headshot, ghosted reviews,
 * account-email contact). A mirror, not a fake page.
 *
 * G1 — NO write path. The render is pure: `buildSamplePreviewPayload` only
 * derives a PublicPayload (no instance, no slug, no publish state), and
 * `StateAPage` is rendered with `preview` so its engagement-beacon island is
 * never mounted. This surface imports none of the draft-creation, server-draft,
 * publish, slug, or view-beacon functions — enforced structurally and asserted
 * in the spec (the no-mint/no-track grep).
 *
 * G7 — no new renderer / no new seller-page component: the page IS `StateAPage`
 * (the real consumer page) and the listing data is a fixture draft; the only new
 * UI is this framing + the "Sample property" truth label.
 *
 * Phase 4b (next) makes the Agent-Layer slots fillable and live-updating
 * (payoff-gated capture). 4a only renders the mirror. The seam 4b drives:
 * `useBrandSettings().update` writes the real brand and this preview re-derives
 * from `settings` automatically.
 */

/**
 * Stable "prepared on" stamp for the sample (AppointmentBrief reads
 * handout.createdAt). Fixed so the preview never churns between renders.
 */
const PREVIEW_PREPARED_AT = '2026-06-21T00:00:00.000Z';

export function AgentLayerSetup({
  onBack,
  ownerEmail,
}: {
  onBack: () => void;
  ownerEmail: string | null;
}) {
  // The real Agent Layer (server-backed when SERVER_BRAND_SETTINGS_ENABLED is
  // on; localStorage otherwise). Read-only here — 4a never calls `update`.
  const { settings } = useBrandSettings();

  const handout = useMemo<HandoutRecord>(() => {
    const data = buildSamplePreviewPayload(settings, ownerEmail ?? '');
    return {
      slug: '', // empty: no public URL, and the beacon is omitted in preview anyway
      type: 'seller-presentation',
      ownerEmail: ownerEmail ?? '',
      createdAt: PREVIEW_PREPARED_AT,
      updatedAt: PREVIEW_PREPARED_AT,
      data: data as unknown as Record<string, unknown>,
    };
  }, [settings, ownerEmail]);

  return (
    <div data-testid="onbv3-agent-layer">
      <div className="onbv3__setup-head">
        <p className="onb__eyebrow">Your page details</p>
        <h1 className="onb__title">This is how your details appear.</h1>
        <p className="onb__sub">
          Your photo, contact, review, and marketing approach are real. The
          property details are sample data so you can see the finished
          experience before you have an address.
        </p>
      </div>

      <div className="onbv3__preview" data-testid="onbv3-preview">
        <span className="onbv3__sample-badge" data-testid="onbv3-sample-badge">
          Sample property
        </span>
        <div className="onbv3__preview-page">
          <StateAPage handout={handout} preview />
        </div>
      </div>

      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--ghost"
          data-testid="onbv3-agent-layer-back"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </div>
  );
}
