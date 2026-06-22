'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBrandSettings, type BrandSettings } from '@/lib/brand';
import type { HandoutRecord } from '@/lib/share-urls';
import { StateAPage } from '@/tools/seller-presentation/output/flagship/StateAPage';
import { buildSamplePreviewPayload } from '@/lib/onboarding/sample-listing-draft';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '@/lib/onboarding/funnel';
import { markOnboardingSeen, markPathAComplete } from '@/lib/onboarding/seen';
import { AgentLayerCapture } from './AgentLayerCapture';

/**
 * AgentLayerSetup — the Path A container (ONBOARDING_HYBRID_V3).
 *
 * Phase 4a — the read-only "sample home, real you" MIRROR (StateAPage in preview
 * mode, fed by { SAMPLE_LISTING_DRAFT + the real Agent Layer }).
 * Phase 4b — the preview-led CAPTURE around it (AgentLayerCapture): each input
 * writes the real brand via `useBrandSettings().update`, and because the preview
 * derives from the same `settings`, the matching section updates on screen
 * immediately (G3). Payoff-gated, one ghosted slot at a time, ending COMPLETED
 * (G6) with a route to the dashboard (Phase 5 builds the Today-card it lands on).
 *
 * G1 — NO mint. The only writes are to the owner-scoped brand record (via
 * `update`); the render is pure (`buildSamplePreviewPayload`) and `StateAPage` is
 * rendered with `preview` so its engagement-beacon island is never mounted. This
 * surface imports none of the draft-creation, server-draft, publish, slug, or
 * view-beacon functions — enforced structurally and asserted in the spec.
 *
 * G7 — no new renderer / no new seller-page component / no new uploader: the page
 * IS `StateAPage`, the headshot IS the Settings `HeadshotField`, the exposure
 * lever reuses the `leadEmphasis` constants, the review reuses `reviewsOutlinkUrl`.
 * The only new UI is this framing + the ghosted-slot capture chrome.
 */

/**
 * Stable "prepared on" stamp for the sample (AppointmentBrief reads
 * handout.createdAt). Fixed so the preview never churns between renders.
 */
const PREVIEW_PREPARED_AT = '2026-06-21T00:00:00.000Z';

/**
 * Read-only fixture route — the canonical example page. Mints nothing. State-A
 * variant so "See an example" matches the home + state of this inline preview.
 */
const EXAMPLE_HREF = '/seller-presentation-preview?fixture=state-a';

export function AgentLayerSetup({
  onBack,
  ownerEmail,
  replay = false,
}: {
  onBack: () => void;
  ownerEmail: string | null;
  /**
   * REPLAY — non-destructive demo/re-smoke mode. When on, capture writes are
   * SANDBOXED to local state instead of the real owner-scoped brand record, so
   * a demo (e.g. to Aaron, on his own account) re-shows the live-preview flow
   * without overwriting his real photo/contact/review/marketing approach. The
   * preview still derives from the sandboxed `settings`, so the on-screen
   * live-update demo is identical — just non-persistent.
   */
  replay?: boolean;
}) {
  const router = useRouter();

  // The real Agent Layer (server-backed when SERVER_BRAND_SETTINGS_ENABLED is
  // on; localStorage otherwise). `realUpdate` writes a single field's change
  // back — the only write this surface performs (G1: brand record only).
  const { settings: realSettings, update: realUpdate } = useBrandSettings();

  // Replay sandbox: mirror the REAL brand into local state until the demoer's
  // first edit, then freeze to their sandbox so the preview reflects the agent's
  // actual brand (a better demo than a cold/empty preview) while NEVER writing
  // it back. `realSettings` hydrates async (DEFAULT_BRAND → real), so re-sync
  // until the first sandbox write captures the hydrated value.
  const [replayDraft, setReplayDraft] = useState<BrandSettings | null>(null);
  const replayTouched = useRef(false);
  useEffect(() => {
    if (replay && !replayTouched.current) setReplayDraft(realSettings);
  }, [replay, realSettings]);

  const settings = replay ? replayDraft ?? realSettings : realSettings;
  const update = replay
    ? (next: BrandSettings) => {
        replayTouched.current = true;
        setReplayDraft(next);
      }
    : realUpdate;

  // The live preview re-derives from `settings`, so every capture write updates
  // the matching section on screen immediately (G3).
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

  const onCreatePage = () => {
    // Replay is non-destructive: no funnel write, and crucially no marker writes
    // (markOnboardingSeen / markPathAComplete change the live gate + Today-card
    // state for a returning agent). Just return them to the dashboard.
    if (replay) {
      router.replace('/dashboard');
      return;
    }
    emitOnboardingEvent(ONBOARDING_EVENTS.reachedCockpit);
    markOnboardingSeen();
    // The "profile ready, no page yet" signal the dashboard Today card reads
    // (Phase 5) — the only thing that tells a completed Path A agent apart from
    // a returning agent who deleted all their pages.
    markPathAComplete();
    router.replace('/dashboard');
  };

  const onSeeExample = () => {
    if (!replay) {
      emitOnboardingEvent(ONBOARDING_EVENTS.previewReached, { path: 'example' });
    }
    window.location.assign(EXAMPLE_HREF);
  };

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

      <AgentLayerCapture
        settings={settings}
        update={update}
        onCreatePage={onCreatePage}
        onSeeExample={onSeeExample}
      />

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
