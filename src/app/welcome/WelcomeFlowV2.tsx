'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type BrandSettings,
} from '@/lib/brand';
import { putServerBrandSettings } from '@/lib/brand-settings-client';
import { putServerDraft } from '@/tools/seller-presentation/hooks/server-draft-client';
import { sampleStateAPayload } from '@/tools/seller-presentation/components/preview/preview-payload';
import { buildOnboardingStateAPayload } from '@/lib/onboarding/state-a-payload';
import {
  withAccountEmailFallback,
  type AgentBranding,
} from '@/tools/seller-presentation/output/public-payload';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '@/lib/onboarding/funnel';
import { markOnboardingSeen } from '@/lib/onboarding/seen';
import { ONBOARDING_V2_SPOTLIGHTS } from '@/lib/onboarding/v2-spotlights';
import {
  LEAD_EMPHASIS_LABELS,
  LEAD_EMPHASIS_MORE,
  LEAD_EMPHASIS_PRIMARY,
  type LeadEmphasisKey,
} from '@/lib/seller-presentation/lead-emphasis';
import { uploadImageFile } from '@/lib/imageUpload';
import {
  StateASlice,
  type StateASection,
} from '@/tools/seller-presentation/output/flagship/StateASlice';

/**
 * WelcomeFlowV2 - the locked 9-beat real-section-reveal first-run flow
 * (ONBOARDING_FIRST_RUN_V2, Gate 3). Parallel + DARK: the shipped V1
 * WelcomeFlow is untouched; this renders only when the V2 flag is on.
 *
 * The grammar (locked arc map): one small input lights up one REAL State A
 * section. The spine is three asks - first name (BEAT 0), address (BEAT 1), one
 * exposure tap (BEAT 5). Every other input is one tap, invited at the instant
 * its payoff is visible, ghosted if skipped. Reveal beats ask nothing.
 *
 * Real-not-mock: each revealed slice is the agent's in-progress draft + brand
 * run through the SAME projection the publish route runs
 * (`buildOnboardingStateAPayload` -> `StateASlice`), so the page they are
 * building IS the page the seller receives. The flow ENDS by handing into the
 * live cockpit (/seller-presentation) - it does not rebuild it.
 *
 * Phase 3a scope: the flow shell + all nine beats as real-section reveals
 * (front-door real path + a secondary "see a sample" link, teal, single-tap,
 * honest states, end-in-cockpit, funnel events). The set-once exposure write
 * (3b), seller-name infer-confirm (3c), and the silent-confirm / contact
 * soft-gate refinements (3d) land in their own follow-up PRs; the seams are
 * marked TODO(3b/3c/3d) where they attach.
 */

type Beat =
  | 'name' // BEAT 0 - relief
  | 'address' // BEAT 1 - momentum
  | 'preparing' // the prepare fires (transient)
  | 'hero' // BEAT 2 - ownership
  | 'brief' // BEAT 3 - preparedness
  | 'valuation' // BEAT 4 - trust
  | 'campaign' // BEAT 5 - differentiation
  | 'trust' // BEAT 6 - confidence via social proof
  | 'contact' // BEAT 7 - confidence + reach
  | 'finishing'; // BEAT 8 - continuity (transient, lands in cockpit)

interface AddressFields {
  street: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_ADDRESS: AddressFields = { street: '', city: '', state: '', zip: '' };

/** Minimum prepare beat so the "preparing" moment is always felt. */
const SKELETON_MS = 1100;

interface PrepareResult {
  bedrooms?: string;
  baths?: string;
  sqft?: string;
  comps: Comp[];
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

function fullAddress(a: AddressFields): string {
  const tail = [a.city.trim(), [a.state.trim(), a.zip.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [a.street.trim(), tail].filter(Boolean).join(', ');
}

export function WelcomeFlowV2({
  ownerEmail,
  serverDraftsEnabled,
}: {
  ownerEmail: string | null;
  serverDraftsEnabled: boolean;
}) {
  const router = useRouter();

  const [beat, setBeat] = useState<Beat>('name');
  const [isSample, setIsSample] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS);
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  // Seller name (BEAT 2). NEVER inferred / auto-asserted: there is no reliable
  // owner-name source (RentCast drops owner data), so the hero opens with a
  // neutral byline and this stays empty until the agent OPTIONALLY taps "who's
  // this for?" and types it. Per-page (the draft's preparedFor), not a brand
  // constant.
  const [sellerName, setSellerName] = useState('');
  const [exposure, setExposure] = useState<LeadEmphasisKey | null>(null);
  const [appointmentAt, setAppointmentAt] = useState('');
  const [finishError, setFinishError] = useState<string | null>(null);

  // Brand is read lazily and SSR-safe: null on the server, loaded from
  // localStorage on the client's first render. BEAT 0 (the only render before
  // the client initializer runs) never reads brand, so server and client agree
  // and there is no hydration mismatch; brand is in hand well before BEAT 2.
  const [brand, setBrand] = useState<BrandSettings | null>(() =>
    typeof window === 'undefined' ? null : loadBrandSettings(),
  );

  // started - once on mount.
  useEffect(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.started);
  }, []);
  // per-beat drop-off.
  useEffect(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.stepEntered, { step: beat });
  }, [beat]);

  /** Persist a brand patch the set-once way every tool reads, best-effort. */
  const patchBrand = useCallback((patch: Partial<BrandSettings>) => {
    setBrand((prev) => {
      const base = prev ?? loadBrandSettings();
      const next = { ...base, ...patch };
      try {
        saveBrandSettings(next);
        void putServerBrandSettings(next, new Date().toISOString());
      } catch {
        /* localStorage disabled - the flow still proceeds */
      }
      return next;
    });
  }, []);

  // The in-progress draft seed, in the prepared-invitation State A status so the
  // slices resolve to the before-the-appointment dossier.
  const draftSeed: SellerPresentationDraft = useMemo(
    () => ({
      ...EMPTY_DRAFT,
      propertyAddress: address.street.trim(),
      propertyCity: address.city.trim() || undefined,
      propertyState: address.state.trim() || undefined,
      propertyZip: address.zip.trim() || undefined,
      subjectBedrooms: prepared?.bedrooms,
      subjectBaths: prepared?.baths,
      subjectSqft: prepared?.sqft,
      comps: prepared?.comps ?? [],
      valuationStatus: 'preparing_for_walkthrough',
      appointmentAt: appointmentAt.trim() || undefined,
      // preparedFor (the seller's name) is empty by default -> StateAHero renders
      // its neutral byline. It is set ONLY when the agent optionally types it at
      // BEAT 2; never inferred, never auto-asserted (a wrong name is worse than a
      // ghost), so a page never publishes a guessed seller name.
      preparedFor: sellerName.trim() || undefined,
    }),
    [address, prepared, appointmentAt, sellerName],
  );

  // The live payload the real slices render. Sample path swaps in the fixture.
  const payload = useMemo(() => {
    if (!brand) return null;
    if (isSample) return sampleStateAPayload(brand);
    return buildOnboardingStateAPayload(draftSeed, brand, ownerEmail ?? '');
  }, [brand, isSample, draftSeed, ownerEmail]);

  const exitToDashboard = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.dismissed, { step: beat });
    markOnboardingSeen();
    router.replace('/dashboard');
  }, [router, beat]);

  // ── PREPARE (real path) ─────────────────────────────────────────────────
  const prepareGuard = useRef(0);
  const beginPrepare = useCallback(async (addr: AddressFields) => {
    const token = ++prepareGuard.current;
    setBeat('preparing');
    const [result] = await Promise.all([
      runPrepare(fullAddress(addr)),
      delay(SKELETON_MS),
    ]);
    if (prepareGuard.current !== token) return;
    setPrepared(result);
    emitOnboardingEvent(ONBOARDING_EVENTS.prepareResolved, {
      ok: Boolean(result),
      thin: !result || result.comps.length === 0,
    });
    setBeat('hero');
    emitOnboardingEvent(ONBOARDING_EVENTS.previewReached, {
      path: 'real',
      thin: !result || result.comps.length === 0,
    });
  }, []);

  // ── BEAT 0 -> 1 ─────────────────────────────────────────────────────────
  const submitName = useCallback(() => {
    const name = firstName.trim().split(/\s+/)[0] ?? '';
    // SPINE 1: set-once "what sellers call you" -> the agent name every page reuses.
    if (name) patchBrand({ agentName: name });
    emitOnboardingEvent(ONBOARDING_EVENTS.pathChosen, { path: 'real' });
    setBeat('address');
  }, [firstName, patchBrand]);

  const submitAddress = useCallback(() => {
    if (!address.street.trim()) return;
    void beginPrepare(address);
  }, [address, beginPrepare]);

  // ── BEAT 2 headshot (the one true invite) ───────────────────────────────
  const [headshotBusy, setHeadshotBusy] = useState(false);
  const [headshotError, setHeadshotError] = useState<string | null>(null);
  const onHeadshotFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setHeadshotBusy(true);
      setHeadshotError(null);
      try {
        const url = await uploadImageFile(file, 'agent');
        patchBrand({ agentPhotoUrl: url });
        emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, {
          kind: 'headshot',
        });
      } catch {
        setHeadshotError('That photo did not upload. You can add it later.');
      } finally {
        setHeadshotBusy(false);
      }
    },
    [patchBrand],
  );

  // ── BEAT 5 exposure tap (SPINE 3) ───────────────────────────────────────
  const chooseExposure = useCallback(
    (key: LeadEmphasisKey) => {
      setExposure(key);
      // Locked Q7(b): write the set-once BrandSettings.leadEmphasis (reused across
      // every future page); CampaignSpread's headline honors it. We do NOT advance
      // here - the payload rebuilds and the chosen lever lights up the real
      // section headline IN PLACE, so the "one tap lights one section" payoff is
      // actually seen at the climax beat. The agent taps Continue to move on.
      patchBrand({ leadEmphasis: key });
      emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'exposure' });
    },
    [patchBrand],
  );

  // ── BEAT 2 optional seller name ("who's this for?") ─────────────────────
  const commitSellerName = useCallback((value: string) => {
    const v = value.trim();
    setSellerName(v);
    if (v) emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'seller-name' });
  }, []);

  // ── BEAT 6 one review ───────────────────────────────────────────────────
  const addReview = useCallback(
    (body: string, name: string) => {
      const b = body.trim();
      const n = name.trim();
      if (!b) return;
      patchBrand({ agentReviews: [{ body: b, attributionName: n || 'A recent seller' }] });
      emitOnboardingEvent(ONBOARDING_EVENTS.trustSignalAdded, { kind: 'review' });
    },
    [patchBrand],
  );

  // ── BEAT 7 contact + finish ─────────────────────────────────────────────
  const saveContact = useCallback(
    (email: string, phone: string) => {
      const patch: Partial<BrandSettings> = {};
      if (email.trim()) patch.contactEmail = email.trim();
      if (phone.trim()) patch.contactPhone = phone.trim();
      if (Object.keys(patch).length) patchBrand(patch);
    },
    [patchBrand],
  );

  const finish = useCallback(async () => {
    setBeat('finishing');
    setFinishError(null);
    const current = brand ?? loadBrandSettings();

    const draft: SellerPresentationDraft = {
      ...draftSeed,
      themeId: current.defaultThemeId || undefined,
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
      setFinishError('We could not save your page. Please try again.');
      setBeat('contact');
      return;
    }

    if (serverDraftsEnabled) {
      try {
        await putServerDraft(created);
      } catch {
        /* the local record still lands in the cockpit */
      }
    }

    // Optional publish - ONLY when the draft already clears the SAME gate the
    // wizard enforces (an invitation gates on address + appointment). A first-run
    // page usually lands as a draft "ready to review" instead.
    if (getMissingRequiredInputs(created.draft).length === 0) {
      try {
        // Q4 reach fallback: a LIVE seller page is never unreachable. The agent's
        // chosen contact wins; if they set neither email nor phone, the account
        // email becomes the contact of last resort so ConfirmTime always renders
        // a way to reach them. (The SP publish route does not apply this, so we
        // fold it in here with the shared helper.)
        const baseContact: AgentBranding = {
          name: current.agentName,
          brokerage: current.brokerage,
          phone: current.contactPhone,
          email: current.contactEmail,
          licenseNumber: current.licenseNumber,
        };
        const agentContact = withAccountEmailFallback(
          baseContact,
          ownerEmail ?? '',
        );
        const res = await fetch('/api/seller-presentation/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: created.draft,
            agentContact,
            brandColors: { primaryColor: current.primaryColor },
          }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (data?.ok) emitOnboardingEvent(ONBOARDING_EVENTS.published, { path: 'real' });
      } catch {
        /* publish is best-effort; the draft is already safely in the cockpit */
      }
    }

    emitOnboardingEvent(ONBOARDING_EVENTS.reachedCockpit);
    markOnboardingSeen();
    await delay(900); // let the "~4 minutes" micro-beat land before the cockpit
    router.replace('/seller-presentation');
  }, [brand, draftSeed, ownerEmail, serverDraftsEnabled, router]);

  // ── SAMPLE (secondary link) ─────────────────────────────────────────────
  const openSample = useCallback(() => {
    setIsSample(true);
    emitOnboardingEvent(ONBOARDING_EVENTS.pathChosen, { path: 'sample' });
    emitOnboardingEvent(ONBOARDING_EVENTS.previewReached, { path: 'sample' });
  }, []);
  const convertSample = useCallback(() => {
    emitOnboardingEvent(ONBOARDING_EVENTS.sampleConverted);
    setIsSample(false);
    setBeat('name');
  }, []);

  /* ─────────────────────────────── RENDER ─────────────────────────────── */
  return (
    <main className="onbv2" data-testid="onbv2-root">
      <div className="onbv2__inner">
        <div className="onbv2__top">
          <span className="onbv2__brand">Simply Edit</span>
          <button
            type="button"
            className="onbv2__skip"
            data-testid="onbv2-skip"
            onClick={exitToDashboard}
          >
            Skip for now
          </button>
        </div>

        <div className="onbv2__body">
          {isSample ? (
            <SampleBeat payload={payload} onConvert={convertSample} />
          ) : (
            <RealBeats
              beat={beat}
              firstName={firstName}
              setFirstName={setFirstName}
              onSubmitName={submitName}
              onSeeSample={openSample}
              address={address}
              setAddress={setAddress}
              onSubmitAddress={submitAddress}
              payload={payload}
              hasHeadshot={Boolean(brand?.agentPhotoUrl)}
              headshotBusy={headshotBusy}
              headshotError={headshotError}
              onHeadshotFile={onHeadshotFile}
              sellerName={sellerName}
              onSellerName={commitSellerName}
              prepared={prepared}
              exposure={exposure}
              onChooseExposure={chooseExposure}
              onAddReview={addReview}
              hasReview={Boolean(brand?.agentReviews?.length)}
              appointmentAt={appointmentAt}
              setAppointmentAt={setAppointmentAt}
              onSaveContact={saveContact}
              hasContact={Boolean(
                brand?.contactEmail?.trim() || brand?.contactPhone?.trim(),
              )}
              contactSummary={
                brand?.contactEmail?.trim() || brand?.contactPhone?.trim() || ''
              }
              willPublish={getMissingRequiredInputs(draftSeed).length === 0}
              onAdvance={setBeat}
              onFinish={() => void finish()}
              finishError={finishError}
            />
          )}
        </div>
      </div>
    </main>
  );
}

/* ───────────────────────────── BEAT CHROME ──────────────────────────── */

function BeatHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="onbv2__eyebrow">{eyebrow}</p>
      <h1 className="onbv2__title">{title}</h1>
    </div>
  );
}

function Spotlight({ text }: { text: string }) {
  return (
    <p className="onbv2__spotlight" data-testid="onbv2-spotlight">
      <span className="onbv2__spotlight-dot" aria-hidden /> {text}
    </p>
  );
}

/** The cropped real slice + a calm fade frame. */
function SliceFrame({
  payload,
  section,
  testid,
}: {
  payload: ReturnType<typeof buildOnboardingStateAPayload> | null;
  section: StateASection;
  testid: string;
}) {
  if (!payload) return null;
  return (
    <div className="onbv2__slice" data-testid={testid}>
      <StateASlice payload={payload} section={section} />
    </div>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
  testid,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <button
      type="button"
      className="onbv2__btn onbv2__btn--primary"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

/* ───────────────────────────── REAL BEATS ──────────────────────────── */

interface RealBeatsProps {
  beat: Beat;
  firstName: string;
  setFirstName: (v: string) => void;
  onSubmitName: () => void;
  onSeeSample: () => void;
  address: AddressFields;
  setAddress: (a: AddressFields) => void;
  onSubmitAddress: () => void;
  payload: ReturnType<typeof buildOnboardingStateAPayload> | null;
  hasHeadshot: boolean;
  headshotBusy: boolean;
  headshotError: string | null;
  onHeadshotFile: (f: File | null) => void;
  sellerName: string;
  onSellerName: (v: string) => void;
  prepared: PrepareResult | null;
  exposure: LeadEmphasisKey | null;
  onChooseExposure: (key: LeadEmphasisKey) => void;
  onAddReview: (body: string, name: string) => void;
  hasReview: boolean;
  appointmentAt: string;
  setAppointmentAt: (v: string) => void;
  onSaveContact: (email: string, phone: string) => void;
  hasContact: boolean;
  contactSummary: string;
  willPublish: boolean;
  onAdvance: (b: Beat) => void;
  onFinish: () => void;
  finishError: string | null;
}

function RealBeats(p: RealBeatsProps) {
  switch (p.beat) {
    case 'name':
      return <NameBeat {...p} />;
    case 'address':
      return <AddressBeat {...p} />;
    case 'preparing':
      return <PreparingBeat firstName={p.firstName} />;
    case 'hero':
      return <HeroBeat {...p} />;
    case 'brief':
      return <BriefBeat {...p} />;
    case 'valuation':
      return <ValuationBeat {...p} />;
    case 'campaign':
      return <CampaignBeat {...p} />;
    case 'trust':
      return <TrustBeat {...p} />;
    case 'contact':
      return <ContactBeat {...p} />;
    case 'finishing':
      return <FinishingBeat error={p.finishError} />;
  }
}

// BEAT 0 -------------------------------------------------------------------
function NameBeat(p: RealBeatsProps) {
  return (
    <>
      <BeatHead eyebrow="Welcome" title="What should sellers call you?" />
      <div className="onbv2__field">
        <label className="onbv2__label" htmlFor="onbv2-name">
          First name
        </label>
        <input
          id="onbv2-name"
          className="onbv2__input"
          data-testid="onbv2-name-input"
          type="text"
          autoFocus
          value={p.firstName}
          placeholder="Your first name"
          onChange={(e) => p.setFirstName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') p.onSubmitName();
          }}
        />
      </div>
      <div className="onbv2__actions">
        <PrimaryBtn onClick={p.onSubmitName} testid="onbv2-name-submit">
          Start
        </PrimaryBtn>
        <button
          type="button"
          className="onbv2__link"
          data-testid="onbv2-see-sample"
          onClick={p.onSeeSample}
        >
          Just looking? See a sample
        </button>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.name} />
    </>
  );
}

// BEAT 1 -------------------------------------------------------------------
function AddressBeat(p: RealBeatsProps) {
  const name = p.firstName.trim().split(/\s+/)[0];
  return (
    <>
      <BeatHead
        eyebrow="Your listing"
        title={name ? `Okay ${name} - what's the address?` : "What's the address?"}
      />
      <div className="onbv2__field">
        <label className="onbv2__label" htmlFor="onbv2-street">
          Street address
        </label>
        <input
          id="onbv2-street"
          className="onbv2__input"
          data-testid="onbv2-address-street"
          type="text"
          autoFocus
          value={p.address.street}
          placeholder="1742 Kenilworth Avenue"
          onChange={(e) => p.setAddress({ ...p.address, street: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') p.onSubmitAddress();
          }}
        />
      </div>
      <div className="onbv2__row">
        <input
          className="onbv2__input"
          aria-label="City"
          type="text"
          value={p.address.city}
          placeholder="City"
          onChange={(e) => p.setAddress({ ...p.address, city: e.target.value })}
        />
        <input
          className="onbv2__input"
          aria-label="State"
          type="text"
          value={p.address.state}
          placeholder="ST"
          onChange={(e) => p.setAddress({ ...p.address, state: e.target.value })}
        />
        <input
          className="onbv2__input"
          aria-label="ZIP"
          type="text"
          value={p.address.zip}
          placeholder="ZIP"
          onChange={(e) => p.setAddress({ ...p.address, zip: e.target.value })}
        />
      </div>
      <div className="onbv2__actions">
        <PrimaryBtn
          onClick={p.onSubmitAddress}
          disabled={!p.address.street.trim()}
          testid="onbv2-address-submit"
        >
          Prepare my page
        </PrimaryBtn>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.address} />
    </>
  );
}

// PREPARING ----------------------------------------------------------------
function PreparingBeat({ firstName }: { firstName: string }) {
  const name = firstName.trim().split(/\s+/)[0];
  return (
    <>
      <BeatHead
        eyebrow="Preparing"
        title={name ? `Preparing this for you, ${name}.` : 'Preparing your page.'}
      />
      <div className="onbv2__skeleton" data-testid="onbv2-skeleton" aria-hidden>
        <div className="onbv2__sk-hero" />
        <div className="onbv2__sk-line mid" />
        <div className="onbv2__sk-line short" />
        <div className="onbv2__sk-line" />
      </div>
    </>
  );
}

// BEAT 2 -------------------------------------------------------------------
function HeroBeat(p: RealBeatsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <BeatHead eyebrow="Your page" title="This one is yours. Add your face." />
      <SliceFrame payload={p.payload} section="hero" testid="onbv2-slice-hero" />
      {/* Secondary, visually-quiet seller-name affordance. The PRIMARY action is
          the headshot below; this never reads as "confirm a name, then upload".
          Optional + never inferred: the hero opens neutral until the agent taps. */}
      <SellerNameChip name={p.sellerName} onCommit={p.onSellerName} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="onbv2-headshot-input"
        onChange={(e) => p.onHeadshotFile(e.target.files?.[0] ?? null)}
      />
      {/* Q3 silent confirm: an account that already carries a headshot shows the
          face in the hero above and a quiet confirmation here - never a redundant
          "add your photo" invite. */}
      {p.hasHeadshot && (
        <p className="onbv2__confirm" data-testid="onbv2-headshot-confirm">
          Using the photo from your profile.
        </p>
      )}
      <div className="onbv2__actions">
        {!p.hasHeadshot && (
          <PrimaryBtn
            onClick={() => fileRef.current?.click()}
            disabled={p.headshotBusy}
            testid="onbv2-headshot-add"
          >
            {p.headshotBusy ? 'Adding your photo...' : 'Add your photo'}
          </PrimaryBtn>
        )}
        <button
          type="button"
          className={
            p.hasHeadshot
              ? 'onbv2__btn onbv2__btn--primary'
              : 'onbv2__btn onbv2__btn--ghost'
          }
          data-testid="onbv2-hero-continue"
          onClick={() => p.onAdvance('brief')}
        >
          Continue
        </button>
      </div>
      {p.headshotError && (
        <p className="onbv2__note" data-testid="onbv2-headshot-error">
          {p.headshotError}
        </p>
      )}
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.hero} />
    </>
  );
}

/**
 * BEAT 2 seller-name chip - the optional "who's this for?" affordance, the
 * locked fallback for the missing inference source. Three small states, all
 * visually secondary to the headshot:
 *   - no name      -> a quiet ghost link "Who's this page for?"
 *   - editing      -> one optional field (Enter / Add commits, never required)
 *   - name set     -> a confirm chip "Prepared for {name}" with a Change tap
 * The committed value drives the REAL hero byline (draft.preparedFor); a wrong
 * guess never publishes because nothing is ever prefilled or inferred.
 */
function SellerNameChip({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);

  if (name && !open) {
    return (
      <div className="onbv2__seller" data-testid="onbv2-seller-confirm">
        <span className="onbv2__seller-label">Prepared for {name}</span>
        <button
          type="button"
          className="onbv2__seller-edit"
          data-testid="onbv2-seller-edit"
          onClick={() => {
            setValue(name);
            setOpen(true);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="onbv2__seller-ghost"
        data-testid="onbv2-seller-open"
        onClick={() => {
          setValue(name);
          setOpen(true);
        }}
      >
        Who&apos;s this page for?
      </button>
    );
  }

  const commit = () => {
    onCommit(value);
    setOpen(false);
  };
  return (
    <div className="onbv2__seller-input" data-testid="onbv2-seller-input">
      <input
        className="onbv2__input"
        type="text"
        autoFocus
        value={value}
        placeholder="The Johnson family"
        aria-label="Who this page is for"
        data-testid="onbv2-seller-field"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      <div className="onbv2__seller-row">
        <button
          type="button"
          className="onbv2__btn onbv2__btn--ghost onbv2__btn--slim"
          data-testid="onbv2-seller-save"
          onClick={commit}
        >
          Add
        </button>
        {name && (
          <button
            type="button"
            className="onbv2__seller-edit"
            data-testid="onbv2-seller-clear"
            onClick={() => {
              onCommit('');
              setValue('');
              setOpen(false);
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// BEAT 3 -------------------------------------------------------------------
function BriefBeat(p: RealBeatsProps) {
  // Honest, event-driven reportage: a line shows ONLY for work that actually
  // returned. Un-run / empty categories are omitted, never shown-then-faked.
  const lines: string[] = [];
  if (p.prepared?.bedrooms || p.prepared?.baths || p.prepared?.sqft) {
    lines.push('Pulled property context');
  }
  if ((p.prepared?.comps.length ?? 0) > 0) lines.push('Found nearby sales');
  return (
    <>
      <BeatHead eyebrow="Prepared" title="It already did your homework." />
      {lines.length > 0 && (
        <ul className="onbv2__checklist" data-testid="onbv2-brief-checklist">
          {lines.map((l) => (
            <li key={l}>
              <span className="onbv2__check" aria-hidden>
                ✓
              </span>
              {l}
            </li>
          ))}
        </ul>
      )}
      {lines.length === 0 && (
        <p className="onbv2__note" data-testid="onbv2-brief-thin">
          Still gathering details for this address. You can review and add
          context before anything goes live.
        </p>
      )}
      <SliceFrame payload={p.payload} section="brief" testid="onbv2-slice-brief" />
      <div className="onbv2__actions">
        <PrimaryBtn onClick={() => p.onAdvance('valuation')} testid="onbv2-brief-continue">
          Continue
        </PrimaryBtn>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.brief} />
    </>
  );
}

// BEAT 4 -------------------------------------------------------------------
function ValuationBeat(p: RealBeatsProps) {
  return (
    <>
      <BeatHead eyebrow="The number" title="Careful with the number that matters." />
      <SliceFrame
        payload={p.payload}
        section="valuation"
        testid="onbv2-slice-valuation"
      />
      <div className="onbv2__actions">
        <PrimaryBtn
          onClick={() => p.onAdvance('campaign')}
          testid="onbv2-valuation-continue"
        >
          Continue
        </PrimaryBtn>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.valuation} />
    </>
  );
}

// BEAT 5 -------------------------------------------------------------------
function CampaignBeat(p: RealBeatsProps) {
  const [showMore, setShowMore] = useState(false);
  return (
    <>
      <BeatHead eyebrow="Your edge" title="How will you get this home seen?" />
      <SliceFrame
        payload={p.payload}
        section="campaign"
        testid="onbv2-slice-campaign"
      />
      <div className="onbv2__levers" data-testid="onbv2-exposure-levers">
        {LEAD_EMPHASIS_PRIMARY.map((key) => (
          <button
            key={key}
            type="button"
            className={`onbv2__lever${exposureActive(p.exposure, key)}`}
            data-testid={`onbv2-lever-${key}`}
            onClick={() => p.onChooseExposure(key)}
          >
            {LEAD_EMPHASIS_LABELS[key]}
          </button>
        ))}
        {showMore &&
          LEAD_EMPHASIS_MORE.map((key) => (
            <button
              key={key}
              type="button"
              className={`onbv2__lever${exposureActive(p.exposure, key)}`}
              data-testid={`onbv2-lever-${key}`}
              onClick={() => p.onChooseExposure(key)}
            >
              {LEAD_EMPHASIS_LABELS[key]}
            </button>
          ))}
      </div>
      {!showMore && !p.exposure && (
        <button
          type="button"
          className="onbv2__link"
          data-testid="onbv2-exposure-more"
          onClick={() => setShowMore(true)}
        >
          More ways
        </button>
      )}
      {/* The chosen lever has lit up the real headline in the slice above; only
          NOW does Continue appear, so the climax payoff is actually seen. */}
      {p.exposure && (
        <div className="onbv2__actions">
          <PrimaryBtn
            onClick={() => p.onAdvance('trust')}
            testid="onbv2-campaign-continue"
          >
            Continue
          </PrimaryBtn>
        </div>
      )}
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.campaign} />
    </>
  );
}

function exposureActive(current: string | null, key: string): string {
  return current === key ? ' onbv2__lever--active' : '';
}

// BEAT 6 -------------------------------------------------------------------
function TrustBeat(p: RealBeatsProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  return (
    <>
      <BeatHead eyebrow="Proof" title="Let the page vouch for you." />
      <SliceFrame payload={p.payload} section="trust" testid="onbv2-slice-trust" />
      {!p.hasReview && !open && (
        <div className="onbv2__actions">
          <button
            type="button"
            className="onbv2__btn onbv2__btn--ghost"
            data-testid="onbv2-review-open"
            onClick={() => setOpen(true)}
          >
            Add one review
          </button>
        </div>
      )}
      {open && !p.hasReview && (
        <div className="onbv2__field" data-testid="onbv2-review-form">
          <label className="onbv2__label" htmlFor="onbv2-review-body">
            What a recent seller said
          </label>
          <textarea
            id="onbv2-review-body"
            className="onbv2__input onbv2__textarea"
            rows={3}
            value={body}
            placeholder="They made the whole sale feel easy."
            onChange={(e) => setBody(e.target.value)}
          />
          <input
            className="onbv2__input"
            aria-label="Who said it"
            type="text"
            value={name}
            placeholder="Who said it (optional)"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="onbv2__btn onbv2__btn--ghost"
            data-testid="onbv2-review-save"
            disabled={!body.trim()}
            onClick={() => p.onAddReview(body, name)}
          >
            Add it
          </button>
        </div>
      )}
      <div className="onbv2__actions">
        <PrimaryBtn onClick={() => p.onAdvance('contact')} testid="onbv2-trust-continue">
          Continue
        </PrimaryBtn>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.trust} />
    </>
  );
}

// BEAT 7 -------------------------------------------------------------------
function ContactBeat(p: RealBeatsProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showAppt, setShowAppt] = useState(false);

  const proceed = () => {
    p.onSaveContact(email, phone);
    p.onFinish();
  };

  // Q4 framing: a complete page (address + appointment) saves live; otherwise it
  // lands in the cockpit as a draft. The wording tracks what will actually happen
  // and never normalizes a contactless send; the account-email fallback (applied
  // at save) keeps any live page reachable.
  const primaryLabel = p.willPublish ? 'Save to my pages' : 'Save as draft';

  return (
    <>
      <BeatHead eyebrow="Reachable" title="So they can actually reach you." />
      <SliceFrame payload={p.payload} section="meeting" testid="onbv2-slice-meeting" />
      <SliceFrame payload={p.payload} section="agent" testid="onbv2-slice-agent" />

      {p.hasContact ? (
        /* Q3 silent confirm: an account that already carries a reach method shows
           a quiet confirmation, never a redundant contact invite. */
        <p className="onbv2__confirm" data-testid="onbv2-contact-confirm">
          Sellers can reach you at {p.contactSummary}.
        </p>
      ) : (
        <>
          <div className="onbv2__field" data-testid="onbv2-contact-fields">
            <label className="onbv2__label" htmlFor="onbv2-contact-email">
              Best email
            </label>
            <input
              id="onbv2-contact-email"
              className="onbv2__input"
              data-testid="onbv2-contact-email"
              type="email"
              value={email}
              placeholder="you@brokerage.com"
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="onbv2__input"
              aria-label="Best phone"
              type="tel"
              value={phone}
              placeholder="Phone (optional)"
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {/* Q4 soft fallback: skipping is fine, and a live page is never
              unreachable - the account email stays on it until a direct line is
              added. The copy never normalizes a contactless send. */}
          <p className="onbv2__note" data-testid="onbv2-contact-fallback">
            You can add a direct line later. Until then, sellers can still reach
            you at your account email.
          </p>
        </>
      )}

      {/* Appointment is a ghosted, optional row - never a CTA (locked Gate-3). */}
      {!showAppt ? (
        <button
          type="button"
          className="onbv2__ghostrow"
          data-testid="onbv2-appt-open"
          onClick={() => setShowAppt(true)}
        >
          + Add the appointment time (optional)
        </button>
      ) : (
        <div className="onbv2__field" data-testid="onbv2-appt-field">
          <label className="onbv2__label" htmlFor="onbv2-appt">
            Appointment
          </label>
          <input
            id="onbv2-appt"
            className="onbv2__input"
            type="datetime-local"
            value={p.appointmentAt}
            onChange={(e) => p.setAppointmentAt(e.target.value)}
          />
        </div>
      )}

      <div className="onbv2__actions">
        <PrimaryBtn onClick={proceed} testid="onbv2-finish">
          {primaryLabel}
        </PrimaryBtn>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.contact} />
    </>
  );
}

// BEAT 8 -------------------------------------------------------------------
function FinishingBeat({ error }: { error: string | null }) {
  return (
    <>
      <BeatHead
        eyebrow={error ? 'One moment' : 'Saved'}
        title={error ? 'That did not go through.' : 'About 4 minutes. Ready for the next seller?'}
      />
      <p className="onbv2__sub">
        {error ?? 'Taking you to your pages, where this one is waiting.'}
      </p>
      {!error && (
        <div className="onbv2__skeleton" aria-hidden>
          <div className="onbv2__sk-line mid" />
          <div className="onbv2__sk-line short" />
        </div>
      )}
    </>
  );
}

/* ───────────────────────────── SAMPLE ──────────────────────────────── */

function SampleBeat({
  payload,
  onConvert,
}: {
  payload: ReturnType<typeof buildOnboardingStateAPayload> | null;
  onConvert: () => void;
}) {
  return (
    <>
      <BeatHead eyebrow="Sample" title="This is what your sellers see." />
      <div className="onbv2__sample-badge" data-testid="onbv2-sample-badge">
        Sample
      </div>
      <SliceFrame payload={payload} section="brief" testid="onbv2-sample-brief" />
      <SliceFrame payload={payload} section="campaign" testid="onbv2-sample-campaign" />
      <div className="onbv2__actions">
        <PrimaryBtn onClick={onConvert} testid="onbv2-sample-convert">
          Make one for your listing
        </PrimaryBtn>
      </div>
      <Spotlight text={ONBOARDING_V2_SPOTLIGHTS.sample} />
    </>
  );
}
