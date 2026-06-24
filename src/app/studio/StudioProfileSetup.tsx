"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrandSettings, extractPhoneDigits, formatPhone } from "@/lib/brand";
import type { BrandSettings } from "@/lib/brand";
import type { WhyUs } from "@/lib/whyus";
import { HeadshotField } from "@/app/settings/HeadshotField";
import type { HeadshotCropValue } from "@/app/settings/HeadshotCropEditor";
import { PhoneInput } from "@/components/inputs/PhoneInput";
import { buildSamplePreviewPayload } from "@/lib/onboarding/sample-listing-draft";
import { emitStudioEvent, STUDIO_EVENTS } from "@/lib/studio-profile/funnel";
import {
  completedSegments,
  isClientReady,
  isProofDone,
  EMPTY_WHYUS,
  type SegmentKey,
} from "@/lib/studio-profile/setup-state";
import {
  clearStudioBuffer,
  loadStudioBuffer,
  saveStudioBuffer,
} from "@/lib/studio-profile/setup-storage";
import { SegmentedProgress } from "./SegmentedProgress";
import { AssetPreviewFrame } from "./AssetPreviewFrame";
import "./studio.css";

/**
 * StudioProfileSetup — the guided one-time activation (Studio Profile, Slice 1).
 *
 * Phase 1 only: intro → You → Reach → Proof → client-ready checkpoint, with the
 * live asset-preview stage for the three steps. Desktop renders a three-panel
 * console (rail · capture · preview); mobile stacks (progress · field · preview
 * beneath). Phase 2 steps are stubbed as upcoming in the rail; "Finish setup"
 * routes to a Phase-2 placeholder.
 *
 * Save model (the agreed shape): each field edits a LOCAL overlay that feeds the
 * live preview (calm updates while typing); "Save & continue" is the reward
 * COMMIT — it writes the brand record via useBrandSettings().update, then plays
 * the dedicated save animation + the reuse-teaching confirmation + the rail
 * check, then advances. A quiet background buffer (socanim_studio_setup) holds
 * the unsaved overlay for crash-safety only; there is no ambient "saves
 * automatically" label that could swallow the save moment.
 */

type Screen = "intro" | "you" | "reach" | "proof" | "checkpoint" | "phase2";
/** The three Phase-1 step screens, in order (a subset of both Screen and SegmentKey). */
type StepScreen = "you" | "reach" | "proof";
const STEP_ORDER: StepScreen[] = ["you", "reach", "proof"];
const SAVE_ANIM_MS = 1100;

/** The reuse-teaching confirmation per step (the "thankful" moment). */
const SAVE_TOAST: Record<SegmentKey, string> = {
  you: "Saved. Your pages will now open with your face and name.",
  reach: "Saved. Every page now has a clear way to reach you.",
  proof: "Saved. Studio will reuse this on every seller page and follow-up.",
  sell: "Saved.",
  work: "Saved.",
  brand: "Saved.",
};

const STEP_FRAME: Record<
  "you" | "reach" | "proof",
  { eyebrow: string; title: string; sub: string }
> = {
  you: {
    eyebrow: "You",
    title: "Make your pages feel like you.",
    sub: "Your name, face, and brokerage open every seller page you send.",
  },
  reach: {
    eyebrow: "Reach",
    title: "Give sellers one clear way to reach you.",
    sub: "Email or phone is enough. Add a scheduling link if you use one.",
  },
  proof: {
    eyebrow: "Proof",
    title: "Add one piece of proof sellers can trust.",
    sub: "A review is best. If you can't paste one, a credential still makes the page read credible.",
  },
};

export function StudioProfileSetup({ ownerEmail }: { ownerEmail: string | null }) {
  const router = useRouter();
  const { settings, update } = useBrandSettings();

  // Unsaved edits overlay the live brand record; the preview + done-gates read
  // the EFFECTIVE merge, so async server brand loads flow in naturally and the
  // overlay only ever holds what the agent has typed-but-not-committed.
  const [overlay, setOverlay] = useState<Partial<BrandSettings>>({});
  const effective = useMemo<BrandSettings>(
    () => ({ ...settings, ...overlay }),
    [settings, overlay],
  );

  const [screen, setScreen] = useState<Screen>("intro");
  const [savedAsset, setSavedAsset] = useState<SegmentKey | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const startedAtRef = useRef<number>(0);
  const hydratedRef = useRef(false);

  // One-time hydrate: restore an unsaved overlay + screen + start time from the
  // crash-safety buffer, then announce the flow started.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const buf = loadStudioBuffer();
    if (buf?.overlay) setOverlay(buf.overlay);
    if (buf?.screen) setScreen(buf.screen as Screen);
    startedAtRef.current = buf?.startedAt ?? Date.now();
    emitStudioEvent(STUDIO_EVENTS.setupStarted);
  }, []);

  // Quiet background safety net (debounced). NOT the commit — just so a refresh
  // mid-typing doesn't lose work.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const id = window.setTimeout(() => {
      saveStudioBuffer({ screen, overlay, startedAt: startedAtRef.current });
    }, 800);
    return () => window.clearTimeout(id);
  }, [screen, overlay]);

  // Per-step entry instrumentation.
  useEffect(() => {
    if (screen === "you" || screen === "reach" || screen === "proof") {
      emitStudioEvent(STUDIO_EVENTS.stepEntered, { step: screen });
    }
  }, [screen]);

  const setField = (patch: Partial<BrandSettings>) =>
    setOverlay((o) => ({ ...o, ...patch }));

  const elapsed = () => Math.max(0, Date.now() - startedAtRef.current);

  const done = useMemo(
    () => new Set<SegmentKey>(completedSegments(effective)),
    [effective],
  );

  const previewPayload = useMemo(
    () => buildSamplePreviewPayload(effective, ownerEmail ?? ""),
    [effective, ownerEmail],
  );

  const goNext = (step: StepScreen) => {
    const i = STEP_ORDER.indexOf(step);
    if (i >= 0 && i < STEP_ORDER.length - 1) setScreen(STEP_ORDER[i + 1]);
    else setScreen("checkpoint");
  };

  const commitAndAdvance = (step: StepScreen) => {
    const wasReady = isClientReady(settings);
    const merged = { ...settings, ...overlay };
    update(merged); // the reward commit → brand record (+ server autosave)
    setOverlay({});
    emitStudioEvent(STUDIO_EVENTS.stepSaved, { step });
    if (!wasReady && isClientReady(merged)) {
      emitStudioEvent(STUDIO_EVENTS.clientReadyReached, { ms: elapsed() });
    }
    // Reward: play the dedicated save animation + reuse confirmation, then advance.
    setSavedAsset(step);
    setToast(SAVE_TOAST[step]);
    window.setTimeout(
      () => {
        setSavedAsset(null);
        setToast(null);
        goNext(step);
      },
      reducedMotion ? 60 : SAVE_ANIM_MS,
    );
  };

  const skip = (step: StepScreen) => {
    emitStudioEvent(STUDIO_EVENTS.stepSkipped, { step });
    goNext(step);
  };

  const onCreatePage = (from: "checkpoint" | "intro") => {
    emitStudioEvent(STUDIO_EVENTS.createPageClicked, { from });
    clearStudioBuffer();
    router.push("/dashboard");
  };

  const onFinishSetup = () => {
    emitStudioEvent(STUDIO_EVENTS.finishSetupClicked);
    setScreen("phase2");
  };

  /* ───────────────────────── intro / checkpoint / phase2 ──────────────────── */

  if (screen === "intro") {
    return (
      <CenteredScreen testid="sp-intro">
        <p className="sp-eyebrow">Studio Profile</p>
        <h1 className="sp-title">Set up Studio once.</h1>
        <p className="sp-sub">
          Most agents finish in 5–8 minutes. Studio reuses these details across
          your seller pages, listing promos, follow-ups, and every new tool you
          create later — so you never rebuild them per page.
        </p>
        <ol className="sp-map" data-testid="sp-intro-map">
          {["You", "Reach", "Proof", "How you sell", "Recent work", "Brand"].map(
            (label, i) => (
              <li className="sp-map__item" key={label}>
                <span className="sp-map__num">{i + 1}</span>
                {label}
              </li>
            ),
          )}
        </ol>
        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-intro-start"
            onClick={() => setScreen("you")}
          >
            Start setup
          </button>
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-intro-later"
            onClick={() => onCreatePage("intro")}
          >
            I&rsquo;ll do this later
          </button>
        </div>
      </CenteredScreen>
    );
  }

  if (screen === "checkpoint") {
    return (
      <CenteredScreen testid="sp-checkpoint">
        <p className="sp-eyebrow">Phase 1 complete</p>
        <h1 className="sp-title">You&rsquo;re client-ready.</h1>
        <p className="sp-sub">
          Your first seller page will have you, a way to reach you, and proof
          sellers can trust. Finish the next 3 steps so every tool starts richer.
        </p>
        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-checkpoint-finish"
            onClick={onFinishSetup}
          >
            Finish setup
            <span className="sp-btn__hint">about 3 min left</span>
          </button>
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-checkpoint-create"
            onClick={() => onCreatePage("checkpoint")}
          >
            Create a seller page now
          </button>
        </div>
      </CenteredScreen>
    );
  }

  if (screen === "phase2") {
    return (
      <CenteredScreen testid="sp-phase2">
        <p className="sp-eyebrow">Phase 2 · Finish your reusable profile</p>
        <h1 className="sp-title">Coming next.</h1>
        <p className="sp-sub">
          How you sell, your recent work, and your brand round out the profile so
          every tool — not just seller pages — starts richer. We&rsquo;re putting
          the finishing touches on these steps.
        </p>
        <ul className="sp-upcoming" data-testid="sp-phase2-list">
          <li>How you sell — your marketing approach</li>
          <li>Recent work — listings with real reach</li>
          <li>Brand — your signature color &amp; logo</li>
        </ul>
        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-phase2-dashboard"
            onClick={() => onCreatePage("checkpoint")}
          >
            Go to your dashboard
          </button>
        </div>
      </CenteredScreen>
    );
  }

  /* ─────────────────────────── the step console ──────────────────────────── */

  const step = screen; // "you" | "reach" | "proof"
  const frame = STEP_FRAME[step];
  const canSave =
    step === "you"
      ? !!effective.agentName?.trim()
      : step === "reach"
        ? !!(effective.contactEmail?.trim() || effective.contactPhone?.trim())
        : isProofDone(effective);
  const canSkip = step === "reach" || step === "proof";

  return (
    <div className="sp" data-testid="sp-console">
      <aside className="sp__rail">
        <SegmentedProgress done={done} active={step} layout="rail" />
      </aside>

      <div className="sp__bar">
        <SegmentedProgress done={done} active={step} layout="bar" />
      </div>

      <main className="sp__center" data-testid={`sp-step-${step}`}>
        <p className="sp-eyebrow">{frame.eyebrow}</p>
        <h1 className="sp-step-title">{frame.title}</h1>
        <p className="sp-sub">{frame.sub}</p>

        <div className="sp-fields">
          {step === "you" && <YouFields effective={effective} setField={setField} />}
          {step === "reach" && (
            <ReachFields effective={effective} setField={setField} />
          )}
          {step === "proof" && (
            <ProofFields effective={effective} setField={setField} />
          )}
        </div>

        {toast && (
          <p className="sp-toast" data-testid="sp-toast" role="status">
            {toast}
          </p>
        )}

        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-save-continue"
            disabled={!canSave || savedAsset !== null}
            onClick={() => commitAndAdvance(step)}
          >
            Save &amp; continue
          </button>
          {canSkip && (
            <button
              type="button"
              className="sp-btn sp-btn--ghost"
              data-testid="sp-skip"
              disabled={savedAsset !== null}
              onClick={() => skip(step)}
            >
              I&rsquo;ll add this later
            </button>
          )}
        </div>
        {canSkip && (
          <p className="sp-skip-note" data-testid="sp-skip-note">
            Studio will keep this section simple until you add it.
          </p>
        )}
      </main>

      <section className="sp__preview" data-testid="sp-preview">
        <AssetPreviewFrame
          payload={previewPayload}
          asset={step}
          saved={savedAsset === step}
          reducedMotion={reducedMotion}
        />
        <div className="sp-dest" data-testid="sp-destinations" aria-hidden="true">
          <span className="sp-dest__chip sp-dest__chip--active">Seller page</span>
          <span className="sp-dest__chip">Follow-up</span>
          <span className="sp-dest__chip">Pre-listing</span>
        </div>
        <p className="sp-dest__note">One input, reused everywhere you show up.</p>
      </section>
    </div>
  );
}

/* ───────────────────────────── step field groups ───────────────────────────── */

function YouFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  return (
    <>
      <label className="sp-field">
        <span className="sp-label">Your name</span>
        <input
          className="sp-input"
          data-testid="sp-input-name"
          type="text"
          autoFocus
          value={effective.agentName ?? ""}
          placeholder="Aaron Thomas"
          onChange={(e) => setField({ agentName: e.target.value })}
        />
      </label>

      <div className="sp-field">
        <span className="sp-label">Your headshot</span>
        <p className="sp-hint">Clean initials work beautifully until you add one.</p>
        <HeadshotField
          photoUrl={effective.agentPhotoUrl}
          focalX={effective.agentHeadshotFocalX ?? 50}
          focalY={effective.agentHeadshotFocalY ?? 50}
          scale={effective.agentHeadshotScale ?? 1}
          monogramName={effective.agentName ?? ""}
          onPhotoChange={(url) =>
            setField({
              agentPhotoUrl: url || undefined,
              agentHeadshotFocalX: undefined,
              agentHeadshotFocalY: undefined,
              agentHeadshotScale: undefined,
            })
          }
          onCropChange={({ focalX, focalY, scale }: HeadshotCropValue) => {
            const centered = focalX === 50 && focalY === 50 && scale === 1;
            setField({
              agentHeadshotFocalX: centered ? undefined : focalX,
              agentHeadshotFocalY: centered ? undefined : focalY,
              agentHeadshotScale: centered ? undefined : scale,
            });
          }}
        />
      </div>

      <label className="sp-field">
        <span className="sp-label">Brokerage</span>
        <input
          className="sp-input"
          data-testid="sp-input-brokerage"
          type="text"
          value={effective.brokerage ?? ""}
          placeholder="Windermere · Tacoma"
          onChange={(e) => setField({ brokerage: e.target.value })}
        />
      </label>
    </>
  );
}

function ReachFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  return (
    <>
      <label className="sp-field">
        <span className="sp-label">Email</span>
        <input
          className="sp-input"
          data-testid="sp-input-email"
          type="email"
          inputMode="email"
          value={effective.contactEmail ?? ""}
          placeholder="you@brokerage.com"
          onChange={(e) => setField({ contactEmail: e.target.value })}
        />
      </label>

      <label className="sp-field">
        <span className="sp-label">Phone</span>
        <PhoneInput
          className="sp-input"
          value={formatPhone(effective.contactPhone ?? "")}
          onChange={(formatted) =>
            setField({ contactPhone: extractPhoneDigits(formatted) })
          }
          placeholder="(253) 555-0188"
          aria-label="Phone"
        />
      </label>

      <label className="sp-field">
        <span className="sp-label">Scheduling link (optional)</span>
        <input
          className="sp-input"
          data-testid="sp-input-scheduling"
          type="url"
          inputMode="url"
          value={effective.schedulingUrl ?? ""}
          placeholder="calendly.com/your-handle"
          onChange={(e) => setField({ schedulingUrl: e.target.value })}
        />
      </label>
    </>
  );
}

function ProofFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  const review = effective.agentReviews?.[0];
  const body = review?.body ?? "";
  const name = review?.attributionName ?? "";
  const setReview = (b: string, n: string) =>
    setField({
      agentReviews: b.trim()
        ? [{ body: b.trim(), attributionName: n.trim() || "A recent seller" }]
        : undefined,
    });
  const base = effective.whyUs ?? (EMPTY_WHYUS as unknown as WhyUs);
  const proofPoint = base.differentiators?.[0] ?? "";
  const setProofPoint = (v: string) =>
    setField({
      whyUs: {
        ...base,
        differentiators: v.trim()
          ? [v.trim(), ...base.differentiators.slice(1)]
          : base.differentiators.slice(1),
      },
    });

  return (
    <>
      <div className="sp-field">
        <span className="sp-label">Paste a review</span>
        <p className="sp-hint">A few words a past seller gave you.</p>
        <textarea
          className="sp-input sp-textarea"
          data-testid="sp-input-review-body"
          rows={3}
          value={body}
          placeholder="They made the whole sale feel easy…"
          onChange={(e) => setReview(e.target.value, name)}
        />
        <input
          className="sp-input"
          data-testid="sp-input-review-name"
          type="text"
          value={name}
          placeholder="Who said it (e.g. J. Mendoza)"
          onChange={(e) => setReview(body, e.target.value)}
        />
        <input
          className="sp-input"
          data-testid="sp-input-review-outlink"
          type="url"
          inputMode="url"
          value={effective.reviewsOutlinkUrl ?? ""}
          placeholder="Link to all your reviews (e.g. Zillow profile)"
          onChange={(e) => setField({ reviewsOutlinkUrl: e.target.value })}
        />
      </div>

      <details className="sp-fallback" data-testid="sp-proof-fallbacks">
        <summary>Can&rsquo;t paste a review? Add one of these instead.</summary>
        <label className="sp-field">
          <span className="sp-label">Years of experience</span>
          <input
            className="sp-input"
            data-testid="sp-input-years"
            type="text"
            inputMode="numeric"
            value={effective.agentYearsInArea ?? ""}
            placeholder="11"
            onChange={(e) =>
              setField({ agentYearsInArea: e.target.value.replace(/\D/g, "") })
            }
          />
        </label>
        <label className="sp-field">
          <span className="sp-label">One proof point</span>
          <input
            className="sp-input"
            data-testid="sp-input-proofpoint"
            type="text"
            value={proofPoint}
            placeholder="Sold 30+ homes in North Tacoma"
            onChange={(e) => setProofPoint(e.target.value)}
          />
        </label>
      </details>
    </>
  );
}

/* ───────────────────────────── shared chrome ───────────────────────────── */

function CenteredScreen({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div className="sp sp--centered" data-testid={testid}>
      <div className="sp-card">{children}</div>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
