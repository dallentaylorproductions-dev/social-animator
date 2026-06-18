'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createInstance } from '@/skills/workflow-instance-storage';
import {
  EMPTY_DRAFT,
  getMissingRequiredInputs,
  type SellerPresentationDraft,
} from '@/tools/seller-presentation/engine/types';
import type { Comp } from '@/tools/seller-intelligence-report/engine/types';
import {
  loadBrandSettings,
  saveBrandSettings,
  DEFAULT_BRAND_THEME_ID,
} from '@/lib/brand';
import { putServerBrandSettings } from '@/lib/brand-settings-client';
import { putServerDraft } from '@/tools/seller-presentation/hooks/server-draft-client';
import {
  buildPreviewFromDraft,
  type PreviewModel,
} from '@/lib/onboarding/preview-model';
import { SAMPLE_PREVIEW } from '@/lib/onboarding/sample-listing';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '@/lib/onboarding/funnel';
import { markOnboardingSeen } from '@/lib/onboarding/seen';
import { PreviewCard } from './components/PreviewCard';
import { Spotlight, ONBOARDING_SPOTLIGHTS } from './components/Spotlight';

/**
 * WelcomeFlow - the output-first first-run sequence (ONBOARDING_FIRST_RUN).
 *
 * One orchestrator, one full-screen column, one decision per reveal:
 *
 *   picker → (real)  address → preparing → preview → identity → finishing
 *            (sample)           preparing → preview → [convert: identity] →
 *                               address → preparing → preview → finishing
 *
 * Reuse, not duplicate: the draft is minted with the SAME createInstance /
 * EMPTY_DRAFT the wizard + library use, "make it yours" writes the SAME
 * BrandSettings, and the optional publish hits the SAME publish route behind
 * the SAME required-inputs gate (so a thin draft simply lands in the cockpit as
 * a draft "awaiting your review" rather than failing). The flow ENDS by handing
 * into the live cockpit (/seller-presentation), where the minted page is
 * visible - it does not rebuild the cockpit.
 *
 * The property prepare is BEST-EFFORT: the optimistic skeleton always shows
 * first, and a thin / disabled / failed prepare still reaches the preview with
 * its empty sections framed as "awaiting your review", never an error.
 */

type Path = 'real' | 'sample';
type Step =
  | 'picker'
  | 'address'
  | 'preparing'
  | 'preview'
  | 'identity'
  | 'finishing';

interface AddressFields {
  street: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_ADDRESS: AddressFields = { street: '', city: '', state: '', zip: '' };

/** Brand-safe accent choices for "make it yours" (value, not a color theory). */
const COLOR_CHOICES = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c'];

/** Minimum skeleton beat so the "preparing" moment is always felt. */
const SKELETON_MS = 1100;

interface PrepareResult {
  bedrooms?: string;
  baths?: string;
  sqft?: string;
  comps: Comp[];
}

function composeAddress(a: AddressFields): string {
  const tail = [a.city.trim(), [a.state.trim(), a.zip.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [a.street.trim(), tail].filter(Boolean).join(', ');
}

function compToPreview(c: Comp) {
  return {
    addressLine: c.address ?? '',
    soldLine: c.soldPrice ? `Sold ${c.soldPrice}` : undefined,
    sqft: c.squareFeet,
  };
}

/** Best-effort property prepare. Never throws; null = nothing usable came back. */
async function runPrepare(address: string): Promise<PrepareResult | null> {
  try {
    const res = await fetch('/api/seller-presentation/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      property?: { bedrooms?: string; baths?: string; sqft?: string };
      comps?: Comp[];
    };
    if (!data?.ok) return null;
    return {
      bedrooms: data.property?.bedrooms,
      baths: data.property?.baths,
      sqft: data.property?.sqft,
      comps: Array.isArray(data.comps) ? data.comps : [],
    };
  } catch {
    return null;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function WelcomeFlow({
  ownerEmail,
  serverDraftsEnabled,
}: {
  ownerEmail: string | null;
  serverDraftsEnabled: boolean;
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>('picker');
  const [path, setPath] = useState<Path | null>(null);
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS);
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [preview, setPreview] = useState<PreviewModel | null>(null);
  const [firstName, setFirstName] = useState('');
  const [color, setColor] = useState<string>(COLOR_CHOICES[0]);
  const [identityCaptured, setIdentityCaptured] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // started - fire once on mount.
  useEffect(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.started);
  }, []);

  // stepEntered - powers per-step drop-off. Fires on every step change.
  useEffect(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.stepEntered, { step });
  }, [step]);

  const exitToDashboard = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.dismissed, { step });
    markOnboardingSeen();
    router.replace('/dashboard');
  }, [router, step]);

  // ── PREPARE (both paths) ────────────────────────────────────────────────
  // Always render the optimistic skeleton first, then resolve the preview.
  const prepareGuard = useRef(0);
  const beginPrepare = useCallback(
    async (chosen: Path, addr: AddressFields) => {
      const token = ++prepareGuard.current;
      setStep('preparing');

      if (chosen === 'sample') {
        await delay(SKELETON_MS);
        if (prepareGuard.current !== token) return;
        setPreview(SAMPLE_PREVIEW);
        setStep('preview');
        emitOnboardingEvent(ONBOARDING_EVENTS.previewReached, {
          path: 'sample',
          thin: false,
        });
        return;
      }

      // Real path - best-effort prepare behind the skeleton.
      const [result] = await Promise.all([
        runPrepare(composeAddress(addr)),
        delay(SKELETON_MS),
      ]);
      if (prepareGuard.current !== token) return;

      setPrepared(result);
      emitOnboardingEvent(ONBOARDING_EVENTS.prepareResolved, {
        ok: Boolean(result),
        thin: !result || result.comps.length === 0,
      });

      const draftSeed: SellerPresentationDraft = {
        ...EMPTY_DRAFT,
        propertyAddress: addr.street.trim(),
        propertyCity: addr.city.trim() || undefined,
        propertyState: addr.state.trim() || undefined,
        propertyZip: addr.zip.trim() || undefined,
        subjectBedrooms: result?.bedrooms,
        subjectBaths: result?.baths,
        subjectSqft: result?.sqft,
        comps: result?.comps ?? [],
      };
      const model = buildPreviewFromDraft(draftSeed, {
        beds: result?.bedrooms,
        baths: result?.baths,
        sqft: result?.sqft,
        comps: result?.comps.map(compToPreview),
      });
      setPreview(model);
      setStep('preview');
      emitOnboardingEvent(ONBOARDING_EVENTS.previewReached, {
        path: 'real',
        thin: !model.hasComps && !model.hasPrice,
      });
    },
    [],
  );

  // ── PATH PICKER ─────────────────────────────────────────────────────────
  const choosePath = useCallback(
    (chosen: Path) => {
      setPath(chosen);
      emitOnboardingEvent(ONBOARDING_EVENTS.pathChosen, { path: chosen });
      if (chosen === 'sample') {
        void beginPrepare('sample', EMPTY_ADDRESS);
      } else {
        setStep('address');
      }
    },
    [beginPrepare],
  );

  // ── REAL ADDRESS SUBMIT ─────────────────────────────────────────────────
  const submitAddress = useCallback(() => {
    if (!address.street.trim()) return;
    void beginPrepare('real', address);
  }, [address, beginPrepare]);

  // ── SAMPLE → REAL CONVERT (identity captured at the convert step) ───────
  const convertSample = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.sampleConverted);
    setPath('real');
    setPreview(null);
    setPrepared(null);
    setStep('identity'); // capture identity first, then collect the real address
  }, []);

  // ── FINISH: mint draft, optional publish, hand into the cockpit ─────────
  const finish = useCallback(async () => {
    setStep('finishing');
    setFinishError(null);

    const name = firstName.trim();
    const themeId = loadBrandSettings().defaultThemeId || DEFAULT_BRAND_THEME_ID;

    const draft: SellerPresentationDraft = {
      ...EMPTY_DRAFT,
      propertyAddress: address.street.trim(),
      propertyCity: address.city.trim() || undefined,
      propertyState: address.state.trim() || undefined,
      propertyZip: address.zip.trim() || undefined,
      subjectBedrooms: prepared?.bedrooms,
      subjectBaths: prepared?.baths,
      subjectSqft: prepared?.sqft,
      comps: prepared?.comps ?? [],
      preparedFor: name || undefined,
      themeId,
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
      setFinishError('We could not start your page. Please try again.');
      setStep('preview');
      return;
    }

    // Push to the server store when the keystone is on, so the cockpit shows it
    // cross-device. Best-effort: same-browser localStorage already has it.
    if (serverDraftsEnabled) {
      try {
        await putServerDraft(created);
      } catch {
        /* keep going - the local record still lands in the cockpit */
      }
    }

    // Optional publish - ONLY when the draft already clears the SAME gate the
    // wizard enforces. A first-run draft is usually thin, so this is normally
    // skipped and the page lands in the cockpit as a draft to finish. We never
    // force a half-empty page live.
    if (getMissingRequiredInputs(created.draft).length === 0) {
      try {
        const brand = loadBrandSettings();
        const res = await fetch('/api/seller-presentation/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: created.draft,
            agentContact: {
              name: brand.agentName,
              brokerage: brand.brokerage,
              phone: brand.contactPhone,
              email: brand.contactEmail,
              licenseNumber: brand.licenseNumber,
            },
            brandColors: { primaryColor: brand.primaryColor },
          }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (data?.ok) {
          emitOnboardingEvent(ONBOARDING_EVENTS.published, { path: 'real' });
        }
      } catch {
        /* publish is best-effort; the draft is already safely in the cockpit */
      }
    }

    emitOnboardingEvent(ONBOARDING_EVENTS.reachedCockpit);
    markOnboardingSeen();
    router.replace('/seller-presentation');
  }, [address, prepared, firstName, ownerEmail, serverDraftsEnabled, router]);

  // ── IDENTITY ("make it yours") ──────────────────────────────────────────
  const saveIdentity = useCallback(async () => {
    const name = firstName.trim();
    // Persist to the SAME BrandSettings the wizard + every tool read.
    try {
      const current = loadBrandSettings();
      const next = {
        ...current,
        agentName: name || current.agentName,
        primaryColor: color || current.primaryColor,
      };
      saveBrandSettings(next);
      // Best-effort server sync (no-ops when SERVER_BRAND_SETTINGS_ENABLED is off).
      void putServerBrandSettings(next, new Date().toISOString());
    } catch {
      // localStorage disabled - the flow still proceeds; nothing is lost that
      // the agent can't re-enter in Settings.
    }
    setIdentityCaptured(true);
    emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'identity' });

    // Converting sample user: now collect the real address (wow runs on it).
    if (path === 'real' && !preview) {
      setStep('address');
      return;
    }
    // Fresh real user: identity came AFTER the wow - finish into the cockpit.
    void finish();
  }, [firstName, color, path, preview, finish]);

  // ── PREVIEW primary CTA ─────────────────────────────────────────────────
  const onPreviewPrimary = useCallback(() => {
    if (path === 'sample') {
      convertSample();
      return;
    }
    // Real preview: identity already captured (converted user) → finish.
    if (identityCaptured) {
      void finish();
      return;
    }
    setStep('identity'); // make it yours AFTER the wow
  }, [path, identityCaptured, convertSample, finish]);

  /* ─────────────────────────────── RENDER ─────────────────────────────── */
  return (
    <main className="onb" data-testid="onb-root">
      <div className="onb__inner">
        <div className="onb__top">
          <span className="onb__brand">Simply Edit</span>
          <button
            type="button"
            className="onb__skip"
            data-testid="onb-skip"
            onClick={exitToDashboard}
          >
            Skip for now
          </button>
        </div>

        <div className="onb__body">
          {step === 'picker' && <PathPicker onChoose={choosePath} />}

          {step === 'address' && (
            <AddressStep
              value={address}
              onChange={setAddress}
              onSubmit={submitAddress}
              converted={identityCaptured}
            />
          )}

          {step === 'preparing' && <PreparingSkeleton />}

          {step === 'preview' && preview && (
            <PreviewStep
              model={preview}
              onPrimary={onPreviewPrimary}
              onSkip={exitToDashboard}
            />
          )}

          {step === 'identity' && (
            <IdentityStep
              firstName={firstName}
              color={color}
              onName={setFirstName}
              onColor={setColor}
              onSubmit={() => void saveIdentity()}
            />
          )}

          {step === 'finishing' && <FinishingStep error={finishError} />}
        </div>
      </div>
    </main>
  );
}

/* ───────────────────────────── STEP VIEWS ───────────────────────────── */

function PathPicker({ onChoose }: { onChoose: (p: Path) => void }) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">Welcome</p>
        <h1 className="onb__title">Let us prepare your first seller page.</h1>
        <p className="onb__sub">
          Pick where to start. You can change everything later.
        </p>
      </div>
      <div className="onb__choices">
        <button
          type="button"
          className="onb__choice"
          data-testid="onb-choice-real"
          onClick={() => onChoose('real')}
        >
          <p className="onb__choice-title">I have a listing to prep</p>
          <p className="onb__choice-desc">
            Enter the address and we will prepare a real page around it.
          </p>
        </button>
        <button
          type="button"
          className="onb__choice"
          data-testid="onb-choice-sample"
          onClick={() => onChoose('sample')}
        >
          <p className="onb__choice-title">Show me what this does</p>
          <p className="onb__choice-desc">
            Walk through a sample page first, then make one for your listing.
          </p>
        </button>
      </div>
    </>
  );
}

function AddressStep({
  value,
  onChange,
  onSubmit,
  converted,
}: {
  value: AddressFields;
  onChange: (a: AddressFields) => void;
  onSubmit: () => void;
  converted: boolean;
}) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">Your listing</p>
        <h1 className="onb__title">
          {converted ? 'Now, your real listing.' : 'What is the address?'}
        </h1>
        <p className="onb__sub">
          The street address is enough to get started. The rest is optional.
        </p>
      </div>
      <div className="onb__field">
        <label className="onb__label" htmlFor="onb-street">
          Street address
        </label>
        <input
          id="onb-street"
          className="onb__input"
          data-testid="onb-address-street"
          type="text"
          autoFocus
          value={value.street}
          placeholder="1742 Kenilworth Avenue"
          onChange={(e) => onChange({ ...value, street: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
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
      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--primary"
          data-testid="onb-address-submit"
          disabled={!value.street.trim()}
          onClick={onSubmit}
        >
          Prepare my page
        </button>
      </div>
      <Spotlight text={ONBOARDING_SPOTLIGHTS.address} testid="onb-spotlight-address" />
    </>
  );
}

function PreparingSkeleton() {
  return (
    <>
      <div>
        <p className="onb__eyebrow">Preparing</p>
        <h1 className="onb__title">Preparing your page.</h1>
        <p className="onb__sub">This takes a moment. Your review comes next.</p>
      </div>
      <div className="onb__skeleton" data-testid="onb-skeleton" aria-hidden>
        <div className="onb__sk-hero" />
        <div className="onb__sk-line mid" />
        <div className="onb__sk-line short" />
        <div className="onb__sk-line" />
        <div className="onb__sk-line mid" />
      </div>
    </>
  );
}

function PreviewStep({
  model,
  onPrimary,
  onSkip,
}: {
  model: PreviewModel;
  onPrimary: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">
          {model.isSample ? 'Sample page' : 'Prepared, awaiting your review'}
        </p>
        <h1 className="onb__title">
          {model.isSample ? 'This is what your sellers see.' : 'Here is your page.'}
        </h1>
      </div>
      <PreviewCard model={model} />
      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--primary"
          data-testid="onb-preview-primary"
          onClick={onPrimary}
        >
          {model.isSample ? 'Make one for your listing' : 'Make it yours'}
        </button>
        <button
          type="button"
          className="onb__btn onb__btn--ghost"
          data-testid="onb-preview-skip"
          onClick={onSkip}
        >
          Not now
        </button>
      </div>
      <Spotlight text={ONBOARDING_SPOTLIGHTS.preview} testid="onb-spotlight-preview" />
    </>
  );
}

function IdentityStep({
  firstName,
  color,
  onName,
  onColor,
  onSubmit,
}: {
  firstName: string;
  color: string;
  onName: (v: string) => void;
  onColor: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">Make it yours</p>
        <h1 className="onb__title">Add your name and a color.</h1>
        <p className="onb__sub">
          Set these once. Every page you make from here reuses them.
        </p>
      </div>
      <div className="onb__field">
        <label className="onb__label" htmlFor="onb-name">
          First name
        </label>
        <input
          id="onb-name"
          className="onb__input"
          data-testid="onb-identity-name"
          type="text"
          autoFocus
          value={firstName}
          placeholder="Your first name"
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
        />
      </div>
      <div className="onb__field">
        <span className="onb__label">Accent color</span>
        <div className="onb__swatches" data-testid="onb-identity-colors">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              className="onb__swatch"
              aria-label={`Use ${c}`}
              aria-pressed={c === color}
              style={{ background: c }}
              onClick={() => onColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--primary"
          data-testid="onb-identity-submit"
          onClick={onSubmit}
        >
          Save and continue
        </button>
      </div>
      <Spotlight text={ONBOARDING_SPOTLIGHTS.trust} testid="onb-spotlight-identity" />
    </>
  );
}

function FinishingStep({ error }: { error: string | null }) {
  return (
    <>
      <div>
        <p className="onb__eyebrow">{error ? 'One moment' : 'Almost there'}</p>
        <h1 className="onb__title">
          {error ? 'That did not go through.' : 'Saving your page.'}
        </h1>
        <p className="onb__sub">
          {error ?? 'Taking you to your pages, where this one is waiting.'}
        </p>
      </div>
      {!error && (
        <div className="onb__skeleton" aria-hidden>
          <div className="onb__sk-line mid" />
          <div className="onb__sk-line short" />
        </div>
      )}
    </>
  );
}
