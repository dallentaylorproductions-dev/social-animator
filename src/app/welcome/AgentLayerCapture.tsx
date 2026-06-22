'use client';

import { useMemo, useState } from 'react';
import type { BrandSettings } from '@/lib/brand';
import { HeadshotField } from '@/app/settings/HeadshotField';
import type { HeadshotCropValue } from '@/app/settings/HeadshotCropEditor';
import {
  LEAD_EMPHASIS_LABELS,
  LEAD_EMPHASIS_MORE,
  LEAD_EMPHASIS_PRIMARY,
  type LeadEmphasisKey,
} from '@/lib/seller-presentation/lead-emphasis';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '@/lib/onboarding/funnel';
import {
  firstOpenSlotIndex,
  GHOST_LABEL,
  isSlotDone,
  progressCue,
  SKIPPABLE,
  SLOTS,
} from '@/lib/onboarding/agent-layer-slots';

/**
 * AgentLayerCapture — the payoff-gated, preview-led capture chrome around the 4a
 * mirror (ONBOARDING_HYBRID_V3, Phase 4b).
 *
 * Not a form: one ghosted slot is active at a time, and every input writes the
 * REAL Agent Layer via `update` so the sibling StateAPage preview re-derives and
 * the matching section updates ON SCREEN immediately (G3). Only fields that
 * visibly change the preview are asked (G2): name · headshot (invited) · reach ·
 * exposure · review. Enrichment slots are skippable ("add later"), leaving a
 * quiet ghost. It ends in a calm COMPLETED state (G6).
 *
 * G1/G7: this surface writes ONLY the owner-scoped brand record (via `update`)
 * and reuses the existing Settings field (HeadshotField) + the existing
 * leadEmphasis lever constants + the existing reviewsOutlinkUrl field. It mints
 * nothing — it imports none of the draft-creation / publish / slug / beacon
 * paths, and builds no new seller-page component or preview. The slot rules live
 * in the pure, unit-tested `@/lib/onboarding/agent-layer-slots`.
 */

export function AgentLayerCapture({
  settings,
  update,
  onCreatePage,
  onSeeExample,
}: {
  settings: BrandSettings;
  update: (next: BrandSettings) => void;
  onCreatePage: () => void;
  onSeeExample: () => void;
}) {
  // Explicit cursor so a live write (which flips isDone true mid-keystroke)
  // doesn't auto-advance the agent off the slot they're still filling. Starts at
  // the first slot they haven't already satisfied in Settings (payoff-gated: a
  // returning agent skips straight past what's already real).
  const firstOpen = useMemo(() => {
    return firstOpenSlotIndex(settings);
    // Only seed once on mount; later edits must not yank the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [cursor, setCursor] = useState(firstOpen);
  const [showMore, setShowMore] = useState(false);

  const writeField = (patch: Partial<BrandSettings>) => {
    update({ ...settings, ...patch });
  };

  const advance = () => setCursor((c) => Math.min(c + 1, SLOTS.length));

  if (cursor >= SLOTS.length) {
    // ── COMPLETED (G6) — an accomplishment, never an empty ending ──────────
    return (
      <div className="onbv3__capture" data-testid="onbv3-completed">
        <p className="onb__eyebrow">{progressCue(settings)}</p>
        <h2 className="onbv3__capture-title">
          Your seller page details are ready.
        </h2>
        <p className="onb__sub">
          When you have an address, Studio will use your photo, contact, review,
          and marketing approach automatically.
        </p>
        <div className="onb__actions">
          <button
            type="button"
            className="onb__btn onb__btn--primary"
            data-testid="onbv3-completed-create"
            onClick={onCreatePage}
          >
            Create your first seller page
          </button>
          <button
            type="button"
            className="onb__btn onb__btn--ghost"
            data-testid="onbv3-completed-example"
            onClick={onSeeExample}
          >
            See an example
          </button>
        </div>
      </div>
    );
  }

  const active = SLOTS[cursor];
  const canSkip = SKIPPABLE.has(active);
  const upcoming = SLOTS.slice(cursor + 1);

  return (
    <div className="onbv3__capture" data-testid="onbv3-capture">
      <p className="onb__eyebrow" data-testid="onbv3-progress-cue">
        {progressCue(settings)}
      </p>

      <div className="onbv3__slot" data-testid={`onbv3-slot-${active}`}>
        {active === 'name' && (
          <NameSlot
            value={settings.agentName ?? ''}
            onChange={(v) => writeField({ agentName: v })}
          />
        )}

        {active === 'headshot' && (
          <div className="onbv3__field">
            <p className="onb__label">Add your face</p>
            <p className="onbv3__hint">
              Your initials work beautifully until you do. Add a photo whenever.
            </p>
            <HeadshotField
              photoUrl={settings.agentPhotoUrl}
              focalX={settings.agentHeadshotFocalX ?? 50}
              focalY={settings.agentHeadshotFocalY ?? 50}
              scale={settings.agentHeadshotScale ?? 1}
              monogramName={settings.agentName ?? ''}
              onPhotoChange={(url) => {
                writeField({
                  agentPhotoUrl: url || undefined,
                  agentHeadshotFocalX: undefined,
                  agentHeadshotFocalY: undefined,
                  agentHeadshotScale: undefined,
                });
                if (url) emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'headshot' });
              }}
              onCropChange={({ focalX, focalY, scale }: HeadshotCropValue) => {
                const centered = focalX === 50 && focalY === 50 && scale === 1;
                writeField({
                  agentHeadshotFocalX: centered ? undefined : focalX,
                  agentHeadshotFocalY: centered ? undefined : focalY,
                  agentHeadshotScale: centered ? undefined : scale,
                });
              }}
            />
          </div>
        )}

        {active === 'contact' && (
          <ContactSlot
            email={settings.contactEmail ?? ''}
            phone={settings.contactPhone ?? ''}
            onEmail={(v) => writeField({ contactEmail: v })}
            onPhone={(v) => writeField({ contactPhone: v })}
          />
        )}

        {active === 'exposure' && (
          <div className="onbv3__field">
            <p className="onb__label">What gets buyers in?</p>
            <p className="onbv3__hint">
              Pick the angle you lead with. It shapes your campaign headline.
            </p>
            <div className="onbv3__levers" data-testid="onbv3-levers">
              {LEAD_EMPHASIS_PRIMARY.map((key) => (
                <LeverButton
                  key={key}
                  k={key}
                  active={settings.leadEmphasis === key}
                  onPick={pickExposure}
                />
              ))}
              {showMore &&
                LEAD_EMPHASIS_MORE.map((key) => (
                  <LeverButton
                    key={key}
                    k={key}
                    active={settings.leadEmphasis === key}
                    onPick={pickExposure}
                  />
                ))}
              {!showMore && (
                <button
                  type="button"
                  className="onbv3__lever onbv3__lever--more"
                  data-testid="onbv3-levers-more"
                  onClick={() => setShowMore(true)}
                >
                  More…
                </button>
              )}
            </div>
          </div>
        )}

        {active === 'review' && (
          <ReviewSlot
            body={settings.agentReviews?.[0]?.body ?? ''}
            name={settings.agentReviews?.[0]?.attributionName ?? ''}
            outlink={settings.reviewsOutlinkUrl ?? ''}
            onReview={(body, name) =>
              writeField({
                agentReviews: body.trim()
                  ? [{ body: body.trim(), attributionName: name.trim() || 'A recent seller' }]
                  : undefined,
              })
            }
            onOutlink={(v) => writeField({ reviewsOutlinkUrl: v })}
          />
        )}
      </div>

      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--primary"
          data-testid="onbv3-slot-continue"
          disabled={!isSlotDone(active, settings)}
          onClick={() => {
            if (active === 'review' && isSlotDone('review', settings))
              emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'review' });
            advance();
          }}
        >
          Continue
        </button>
        {canSkip && (
          <button
            type="button"
            className="onb__btn onb__btn--ghost"
            data-testid="onbv3-slot-skip"
            onClick={advance}
          >
            Add later
          </button>
        )}
      </div>

      {upcoming.length > 0 && (
        <ul className="onbv3__ghosts" data-testid="onbv3-ghosts" aria-hidden>
          {upcoming.map((slot) => (
            <li key={slot} className="onbv3__ghost">
              {GHOST_LABEL[slot]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  function pickExposure(key: LeadEmphasisKey) {
    writeField({ leadEmphasis: key });
    emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'exposure' });
  }
}

/* ───────────────────────────── slot inputs ─────────────────────────────── */

function NameSlot({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="onbv3__field">
      <label className="onb__label" htmlFor="onbv3-name">
        Your name
      </label>
      <p className="onbv3__hint">It shows in your page&rsquo;s hero right away.</p>
      <input
        id="onbv3-name"
        className="onb__input"
        data-testid="onbv3-input-name"
        type="text"
        autoFocus
        value={value}
        placeholder="Aaron Thomas"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ContactSlot({
  email,
  phone,
  onEmail,
  onPhone,
}: {
  email: string;
  phone: string;
  onEmail: (v: string) => void;
  onPhone: (v: string) => void;
}) {
  return (
    <div className="onbv3__field">
      <p className="onb__label">How sellers reach you</p>
      <p className="onbv3__hint">
        Email or phone. Either one lets a seller respond.
      </p>
      <input
        className="onb__input"
        data-testid="onbv3-input-email"
        type="email"
        inputMode="email"
        value={email}
        placeholder="you@brokerage.com"
        onChange={(e) => onEmail(e.target.value)}
      />
      <input
        className="onb__input"
        data-testid="onbv3-input-phone"
        type="tel"
        inputMode="tel"
        value={phone}
        placeholder="(555) 555-0123"
        onChange={(e) => onPhone(e.target.value)}
      />
    </div>
  );
}

function ReviewSlot({
  body,
  name,
  outlink,
  onReview,
  onOutlink,
}: {
  body: string;
  name: string;
  outlink: string;
  onReview: (body: string, name: string) => void;
  onOutlink: (v: string) => void;
}) {
  return (
    <div className="onbv3__field">
      <p className="onb__label">Add a review</p>
      <p className="onbv3__hint">
        Paste one a past seller gave you, and link your full reviews.
      </p>
      <textarea
        className="onb__input onbv3__textarea"
        data-testid="onbv3-input-review-body"
        rows={3}
        value={body}
        placeholder="They made the whole sale feel easy…"
        onChange={(e) => onReview(e.target.value, name)}
      />
      <input
        className="onb__input"
        data-testid="onbv3-input-review-name"
        type="text"
        value={name}
        placeholder="Who said it (e.g. J. Mendoza)"
        onChange={(e) => onReview(body, e.target.value)}
      />
      <input
        className="onb__input"
        data-testid="onbv3-input-review-outlink"
        type="url"
        inputMode="url"
        value={outlink}
        placeholder="Link to all your reviews (e.g. Zillow profile)"
        onChange={(e) => onOutlink(e.target.value)}
      />
    </div>
  );
}

function LeverButton({
  k,
  active,
  onPick,
}: {
  k: LeadEmphasisKey;
  active: boolean;
  onPick: (k: LeadEmphasisKey) => void;
}) {
  return (
    <button
      type="button"
      className={`onbv3__lever${active ? ' onbv3__lever--active' : ''}`}
      data-testid={`onbv3-lever-${k}`}
      onClick={() => onPick(k)}
    >
      {LEAD_EMPHASIS_LABELS[k]}
    </button>
  );
}
