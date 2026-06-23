'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createInstance } from '@/skills/workflow-instance-storage';
import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from '@/tools/seller-presentation/engine/types';
import { putServerDraft } from '@/tools/seller-presentation/hooks/server-draft-client';
import { saveListingProfile } from '@/lib/listing-profile';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '@/lib/onboarding/funnel';
import { markOnboardingSeen } from '@/lib/onboarding/seen';
import { AgentLayerSetup } from './AgentLayerSetup';

/**
 * WelcomeFlowV3 — the hybrid first-run SHELL (ONBOARDING_HYBRID_V3, Phase 3).
 *
 * One calm first screen that DEFAULTS to Agent-Layer Setup (Path A) and offers
 * an "I have an address ready" escape hatch (Path B) plus a quiet "See an
 * example" — never a "pick a mode" fork. This phase builds the routing + state
 * wiring and the real, working Path B fast-track; the "sample home, real you"
 * live preview behind Path A is the NEXT packet (Phase 4), so the Path A target
 * here is a thin {@link AgentLayerSetup} container.
 *
 * State model (locked architecture §3) the routing speaks in:
 *   - first screen + Path A container = Preview/none — they MINT NOTHING (G1).
 *   - Path B = Draft — the ONLY mint in this flow, an explicit private draft
 *     (no slug, no publish, no engagement beacon) created via the EXISTING
 *     wizard draft-creation call, then handed off into the EXISTING wizard.
 *
 * G1 is structural, not by convention: the only module here that can mint is
 * the Path B submit handler below (the sole importer of `createInstance` /
 * `putServerDraft`). The first screen and the Path A container have no access
 * to any draft-creation path.
 */
interface AddressFields {
  street: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_ADDRESS: AddressFields = { street: '', city: '', state: '', zip: '' };

/**
 * Read-only fixture route — the canonical example page. Mints nothing. Points at
 * the State-A (prepared-invitation) variant so "See an example" shows the SAME
 * home and state as the Path A inline preview, not the revealed State-B page.
 */
const EXAMPLE_HREF = '/seller-presentation-preview?fixture=state-a';

type Screen = 'first' | 'address' | 'agent-layer';

export function WelcomeFlowV3({
  ownerEmail,
  serverDraftsEnabled,
  // MARKETING_ZONE_REDESIGN (v1.7 Packet C) — resolved on the server welcome
  // shell and threaded to the Path A mirror so its inline State-A preview shows
  // the redesigned marketing zone exactly when a flag-on publish would. Default
  // false keeps a flag-off session byte-identical to today's grid.
  marketingZoneRedesignEnabled = false,
}: {
  ownerEmail: string | null;
  serverDraftsEnabled: boolean;
  marketingZoneRedesignEnabled?: boolean;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('first');
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // started — once on mount (mirrors V2's funnel instrumentation).
  useEffect(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.started);
  }, []);
  // per-screen drop-off.
  useEffect(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.stepEntered, { step: screen });
  }, [screen]);

  const exitToDashboard = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.dismissed, { step: screen });
    markOnboardingSeen();
    router.replace('/dashboard');
  }, [router, screen]);

  // Path A — route to the Agent-Layer container. Preview/none: mints nothing.
  const goPathA = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.pathChosen, { path: 'agent-layer' });
    setScreen('agent-layer');
  }, []);

  // Path B — reveal address entry. The draft is minted only on submit.
  const goPathB = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.pathChosen, { path: 'address-first' });
    setScreen('address');
  }, []);

  // "See an example" — read-only fixture route; mints nothing (G1). The anchor
  // navigates; this only records the intent for the funnel.
  const seeExample = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.previewReached, { path: 'example' });
  }, []);

  // Path B submit — the ONLY mint in this flow. Reuses the EXISTING wizard
  // draft-creation call (`createInstance`) verbatim, seeds the address into the
  // draft exactly as WelcomeFlowV2 does, then hands off into the EXISTING wizard
  // on that specific draft via `?id=`. createInstance never sets publishedSlug/
  // publishedAt, so the result is a private DRAFT — no slug, no publish, no
  // engagement beacon (G8). No second draft-creation path is introduced.
  const createDraftAndHandoff = useCallback(async () => {
    if (busy) return;
    const street = address.street.trim();
    if (!street) return;
    setBusy(true);
    setError(null);

    const city = address.city.trim();
    const stateAbbr = address.state.trim();
    const zip = address.zip.trim();

    // Seed the listing-profile Property primitive FIRST — the SAME store the
    // wizard's StepProperty reads (and mirrors into the draft). Without this the
    // wizard mounts, finds the primitive empty, and the mirror effect clobbers
    // the seeded draft address back to undefined (the field shows empty). The
    // returned record carries the backfilled propertyId, which we stamp onto the
    // draft so the two agree and the mirror sees a match (no clobber). This is
    // the owner-scoped local listing store the wizard already writes — NOT a
    // page mint (G1/G8 hold: still a private draft, no slug/publish/beacon).
    const cityState =
      [city, stateAbbr].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
    const profile = saveListingProfile({
      heroPhoto: '',
      status: 'Just Listed',
      address: street,
      cityState: cityState.trim(),
      city: city || undefined,
      state: stateAbbr || undefined,
      zip: zip || undefined,
      price: '',
      beds: '',
      baths: '',
      sqft: '',
    });

    const draft: SellerPresentationDraft = {
      ...EMPTY_DRAFT,
      propertyId: profile.propertyId,
      propertyAddress: street,
      propertyCity: city || undefined,
      propertyState: stateAbbr || undefined,
      propertyZip: zip || undefined,
    };

    let created;
    try {
      created = createInstance<SellerPresentationDraft>({
        skillId: 'seller-presentation',
        draft,
        currentStep: 'property',
        ownerEmail: ownerEmail ?? undefined,
      });
    } catch {
      setError('We could not start your page. Please try again.');
      setBusy(false);
      return;
    }

    if (serverDraftsEnabled) {
      try {
        await putServerDraft(created);
      } catch {
        /* the local record still lands in the cockpit; the wizard recovers it */
      }
    }

    emitOnboardingEvent(ONBOARDING_EVENTS.stepEntered, { step: 'wizard-handoff' });
    markOnboardingSeen();
    router.replace(`/seller-presentation?id=${created.instanceId}`);
  }, [address, busy, ownerEmail, serverDraftsEnabled, router]);

  return (
    <main className="onb onbv3" data-testid="onbv3-root">
      <div className="onb__inner">
        <div className="onb__top">
          <span className="onb__brand">Simply Edit</span>
          <button
            type="button"
            className="onb__skip"
            data-testid="onbv3-skip"
            onClick={exitToDashboard}
          >
            Skip for now
          </button>
        </div>

        <div className="onb__body">
          {screen === 'first' && (
            <FirstScreen
              onPathA={goPathA}
              onPathB={goPathB}
              onSeeExample={seeExample}
              exampleHref={EXAMPLE_HREF}
            />
          )}
          {screen === 'address' && (
            <AddressScreen
              value={address}
              onChange={setAddress}
              busy={busy}
              error={error}
              onBack={() => setScreen('first')}
              onSubmit={() => void createDraftAndHandoff()}
            />
          )}
          {screen === 'agent-layer' && (
            <AgentLayerSetup
              onBack={() => setScreen('first')}
              ownerEmail={ownerEmail}
              marketingZoneRedesignEnabled={marketingZoneRedesignEnabled}
            />
          )}
        </div>
      </div>
    </main>
  );
}

/* ───────────────────────────── FIRST SCREEN ─────────────────────────────
 * The calm default + escape hatch (locked architecture §5). NOT a fork: Path A
 * is the visual primary, Path B the secondary, "See an example" a quiet
 * tertiary. This component imports nothing that can mint — G1 by construction.
 */
function FirstScreen({
  onPathA,
  onPathB,
  onSeeExample,
  exampleHref,
}: {
  onPathA: () => void;
  onPathB: () => void;
  onSeeExample: () => void;
  exampleHref: string;
}) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">Welcome</p>
        <h1 className="onb__title">Let&rsquo;s get your seller pages ready.</h1>
        <p className="onb__sub">
          We&rsquo;ll set up your page details so every listing looks ready the
          moment you need it.
        </p>
      </div>
      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--primary"
          data-testid="onbv3-cta-path-a"
          onClick={onPathA}
        >
          Set up my page details
        </button>
        <button
          type="button"
          className="onb__btn onb__btn--ghost"
          data-testid="onbv3-cta-path-b"
          onClick={onPathB}
        >
          I have an address ready
        </button>
      </div>
      <a
        className="onbv3__example"
        data-testid="onbv3-cta-example"
        href={exampleHref}
        onClick={onSeeExample}
      >
        See an example
      </a>
    </>
  );
}

/* ───────────────────────────── ADDRESS SCREEN ───────────────────────────
 * Path B momentum: street address is enough; the rest is optional. Mirrors the
 * V1 address markup so the wizard handoff feels continuous. The submit mints
 * the draft (handled by the parent).
 */
function AddressScreen({
  value,
  onChange,
  busy,
  error,
  onBack,
  onSubmit,
}: {
  value: AddressFields;
  onChange: (next: AddressFields) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">Your listing</p>
        <h1 className="onb__title">What&rsquo;s the address?</h1>
        <p className="onb__sub">
          The street address is enough to get started. The rest is optional.
        </p>
      </div>
      <div className="onb__field">
        <label className="onb__label" htmlFor="onbv3-street">
          Street address
        </label>
        <input
          id="onbv3-street"
          className="onb__input"
          data-testid="onbv3-address-street"
          type="text"
          autoFocus
          value={value.street}
          placeholder="1742 Kenilworth Avenue"
          onChange={(e) => onChange({ ...value, street: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.street.trim() && !busy) onSubmit();
          }}
        />
      </div>
      <div className="onb__row">
        <input
          className="onb__input"
          aria-label="City"
          type="text"
          value={value.city}
          placeholder="City"
          onChange={(e) => onChange({ ...value, city: e.target.value })}
        />
        <input
          className="onb__input"
          aria-label="State"
          type="text"
          value={value.state}
          placeholder="ST"
          onChange={(e) => onChange({ ...value, state: e.target.value })}
        />
        <input
          className="onb__input"
          aria-label="ZIP"
          type="text"
          value={value.zip}
          placeholder="ZIP"
          onChange={(e) => onChange({ ...value, zip: e.target.value })}
        />
      </div>
      {error && (
        <p className="onbv3__error" data-testid="onbv3-address-error" role="alert">
          {error}
        </p>
      )}
      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--primary"
          data-testid="onbv3-address-submit"
          disabled={!value.street.trim() || busy}
          onClick={onSubmit}
        >
          {busy ? 'Starting…' : 'Start my page'}
        </button>
        <button
          type="button"
          className="onb__btn onb__btn--ghost"
          data-testid="onbv3-address-back"
          onClick={onBack}
          disabled={busy}
        >
          Back
        </button>
      </div>
    </>
  );
}
