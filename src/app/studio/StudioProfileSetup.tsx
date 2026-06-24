"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrandSettings, extractPhoneDigits, formatPhone } from "@/lib/brand";
import type { BrandSettings } from "@/lib/brand";
import { type WhyUs, defaultWhyUs } from "@/lib/whyus";
import { recentListingsToPublishInput } from "@/lib/seller-presentation/recent-listings";
import type { PublicRecentListing } from "@/tools/seller-presentation/output/public-payload";
import {
  LEAD_EMPHASIS_LABELS,
  LEAD_EMPHASIS_PRIMARY,
  type LeadEmphasisKey,
} from "@/lib/seller-presentation/lead-emphasis";
import { HeadshotField } from "@/app/settings/HeadshotField";
import type { HeadshotCropValue } from "@/app/settings/HeadshotCropEditor";
import { RecentListingsEditor } from "@/app/settings/RecentListingsEditor";
import { PhoneInput } from "@/components/inputs/PhoneInput";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUploadField } from "@/components/VideoUploadField";
import { buildSamplePreviewPayload } from "@/lib/onboarding/sample-listing-draft";
import { emitStudioEvent, STUDIO_EVENTS } from "@/lib/studio-profile/funnel";
import {
  completedSegments,
  isClientReady,
  isFullyComplete,
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
 * StudioProfileSetup — the complete guided activation (Studio Profile).
 *
 * The full 6-step flow: intro → You → Reach → Proof → (client-ready continue
 * beat) → How you sell → Recent work → Brand → launch. Desktop renders a
 * three-panel console (rail · capture · live asset-preview); mobile stacks
 * (progress · field · preview beneath).
 *
 * MOMENTUM (the core revision): there is NO mid-flow exit. "I'll do this later"
 * lives ONLY on the intro. Client-ready is a brief calm CONTINUE beat (one
 * forward action), never a fork — the sparse-page off-ramp is gone. A constant
 * reassurance line keeps the "set once, reused everywhere" frame present at every
 * step. The ONLY "Create your first seller page" CTA is at TRUE completion (after
 * Brand) — the launch moment.
 *
 * Save model: each field edits a LOCAL overlay that feeds the live preview;
 * "Save & continue" is the reward COMMIT — it writes the brand record via
 * useBrandSettings().update, plays the save animation + the reuse-teaching
 * confirmation + the rail check, then advances. A quiet background buffer
 * (socanim_studio_setup) holds the unsaved overlay for crash-safety only.
 */

type Screen = "intro" | SegmentKey | "clientready" | "launch";
const STEP_ORDER: SegmentKey[] = ["you", "reach", "proof", "sell", "work", "brand"];
const SAVE_ANIM_MS = 1100;

/** Where each step advances after its commit. */
const NEXT_SCREEN: Record<SegmentKey, Screen> = {
  you: "reach",
  reach: "proof",
  proof: "clientready", // the calm continue beat, not a fork
  sell: "work",
  work: "brand",
  brand: "launch", // true completion → the launch moment
};

/** Where "Back" returns to (so a saved step can be revisited to fix a typo). */
const PREV_SCREEN: Record<SegmentKey, Screen> = {
  you: "intro",
  reach: "you",
  proof: "reach",
  sell: "clientready",
  work: "sell",
  brand: "work",
};

/** The reuse-teaching confirmation per step (the "thankful" moment). */
const SAVE_TOAST: Record<SegmentKey, string> = {
  you: "Saved. Your pages will now open with your face and name.",
  reach: "Saved. Every page now has a clear way to reach you.",
  proof: "Saved. Studio will reuse this on every seller page and follow-up.",
  sell: "Studio can now explain how you get homes seen.",
  work: "Your showcase now shows real reach.",
  brand: "Your brand color now carries every page.",
};

const STEP_FRAME: Record<
  SegmentKey,
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
  sell: {
    eyebrow: "How you sell",
    title: "Show how you get homes seen.",
    sub: "Your marketing approach and edge — reused in every page's marketing section.",
  },
  work: {
    eyebrow: "Recent work",
    title: "Prove your reach.",
    sub: "Recent listings with real view counts power your showcase coverflow.",
  },
  brand: {
    eyebrow: "Brand",
    title: "Make it unmistakably yours.",
    sub: "Your signature color carries across every page, promo, and follow-up.",
  },
};

const REASSURANCE =
  "Your one-time Studio setup · saved once, reused on every page, promo & follow-up.";

export function StudioProfileSetup({ ownerEmail }: { ownerEmail: string | null }) {
  const router = useRouter();
  const { settings, update } = useBrandSettings();

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

  // One-time hydrate from the crash-safety buffer, then announce start.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const buf = loadStudioBuffer();
    if (buf?.overlay) setOverlay(buf.overlay);
    if (buf?.screen) setScreen(buf.screen as Screen);
    startedAtRef.current = buf?.startedAt ?? Date.now();
    emitStudioEvent(STUDIO_EVENTS.setupStarted);
  }, []);

  // Quiet background safety net (debounced) — NOT the commit.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const id = window.setTimeout(() => {
      saveStudioBuffer({ screen, overlay, startedAt: startedAtRef.current });
    }, 800);
    return () => window.clearTimeout(id);
  }, [screen, overlay]);

  const activeStep: SegmentKey | null = (STEP_ORDER as string[]).includes(screen)
    ? (screen as SegmentKey)
    : null;

  // Per-step entry instrumentation.
  useEffect(() => {
    if (activeStep) emitStudioEvent(STUDIO_EVENTS.stepEntered, { step: activeStep });
  }, [activeStep]);

  const setField = (patch: Partial<BrandSettings>) =>
    setOverlay((o) => ({ ...o, ...patch }));

  const elapsed = () => Math.max(0, Date.now() - startedAtRef.current);

  const done = useMemo(
    () => new Set<SegmentKey>(completedSegments(effective)),
    [effective],
  );

  // Live preview payload. marketingZoneRedesign=true so the How-you-sell preview
  // shows the v1.7 redesigned marketing zone; for the Recent-work step, overlay
  // the agent's OWN listings (the sample seeds the rest so nothing is empty).
  const basePayload = useMemo(
    () => buildSamplePreviewPayload(effective, ownerEmail ?? "", true),
    [effective, ownerEmail],
  );
  const previewPayload = useMemo(() => {
    // Carry the logo so the Brand-step AgentBand preview shows it in the global
    // logo slot. Studio-preview-only: the publish path never sets brandLogoUrl,
    // so published pages stay byte-identical (wordmark).
    const logo = effective.logoDataUrl || undefined;
    let payload = logo ? { ...basePayload, brandLogoUrl: logo } : basePayload;
    if (activeStep === "work") {
      // Preview-only: the agent's own listings as the public shape (the publish
      // projector remains the real clamp/cap boundary; this mapper's objects
      // match PublicRecentListing structurally — address + optional fields).
      const own = recentListingsToPublishInput(effective.recentListings ?? []) as
        | PublicRecentListing[]
        | undefined;
      if (own?.length) payload = { ...payload, recentListings: own };
    }
    return payload;
  }, [basePayload, activeStep, effective.recentListings, effective.logoDataUrl]);

  // Pre-populate the How-you-sell preview: the moment the step opens, seed the
  // default "Why us" content (marketing approach etc.) so the preview renders a
  // full marketing zone immediately — never blank-until-touched. Matches the
  // Settings "arrives done" pattern; the agent edits rather than starts empty.
  useEffect(() => {
    if (screen === "sell" && !settings.whyUs && !overlay.whyUs) {
      setOverlay((o) => ({ ...o, whyUs: defaultWhyUs() }));
    }
  }, [screen, settings.whyUs, overlay.whyUs]);

  const commitAndAdvance = (step: SegmentKey) => {
    const wasReady = isClientReady(settings);
    const merged = { ...settings, ...overlay };
    // Normalize the proof review at commit: trim the raw-stored text and apply
    // the empty-name default (kept raw during editing so spaces type normally).
    if (step === "proof" && merged.agentReviews?.[0]) {
      const r = merged.agentReviews[0];
      const body = r.body.trim();
      merged.agentReviews = body
        ? [{ ...r, body, attributionName: r.attributionName.trim() || "A recent seller" }]
        : undefined;
    }
    update(merged); // the reward commit → brand record (+ server autosave)
    setOverlay({});
    emitStudioEvent(STUDIO_EVENTS.stepSaved, { step });
    if (!wasReady && isClientReady(merged)) {
      emitStudioEvent(STUDIO_EVENTS.clientReadyReached, { ms: elapsed() });
    }
    if (step === "brand" && isFullyComplete(merged)) {
      emitStudioEvent(STUDIO_EVENTS.fullSetupCompleted, { ms: elapsed() });
    }
    setSavedAsset(step);
    setToast(SAVE_TOAST[step]);
    window.setTimeout(
      () => {
        setSavedAsset(null);
        setToast(null);
        setScreen(NEXT_SCREEN[step]);
      },
      reducedMotion ? 60 : SAVE_ANIM_MS,
    );
  };

  // Re-edit navigation: Back returns to the previous screen; the rail lets the
  // agent jump back into any step they've already reached. Overlay edits are
  // never cleared on navigation (only an explicit commit clears them) and
  // committed values live in `settings`, so no entered data is lost going back.
  const goTo = (next: Screen) => {
    if (savedAsset) return; // ignore mid-save-animation
    setScreen(next);
  };

  const onLater = () => {
    // The ONLY defer/exit — intro screen only. Keep the buffer so a return resumes.
    router.push("/dashboard");
  };
  const onCreatePage = () => {
    emitStudioEvent(STUDIO_EVENTS.createPageClicked, { from: "launch" });
    clearStudioBuffer();
    router.push("/dashboard");
  };
  const onReview = () => {
    clearStudioBuffer();
    router.push("/settings");
  };

  /* ───────────────────────── intro / continue / launch ───────────────────── */

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
            onClick={onLater}
          >
            I&rsquo;ll do this later
          </button>
        </div>
      </CenteredScreen>
    );
  }

  if (screen === "clientready") {
    // A brief calm CONTINUE beat — ONE forward action, no fork, no off-ramp.
    return (
      <CenteredScreen testid="sp-clientready">
        <p className="sp-eyebrow">You&rsquo;re client-ready</p>
        <h1 className="sp-title">Nice — you&rsquo;re client-ready.</h1>
        <p className="sp-sub">
          Now let&rsquo;s make every page stronger. Three quick steps add your
          marketing approach, recent work, and brand — the parts that fill a
          page&rsquo;s biggest sections.
        </p>
        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-clientready-continue"
            onClick={() => setScreen("sell")}
          >
            Keep going
          </button>
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-clientready-back"
            onClick={() => goTo("proof")}
          >
            Back
          </button>
        </div>
        <p className="sp-reassure">{REASSURANCE}</p>
      </CenteredScreen>
    );
  }

  if (screen === "launch") {
    return (
      <CenteredScreen testid="sp-launch">
        <p className="sp-eyebrow">You&rsquo;re set</p>
        <h1 className="sp-title">Your seller page is ready.</h1>
        <p className="sp-sub">
          Studio will carry your identity, proof, marketing, recent work, and
          brand into every page you create. Extras for your full presentation and
          pre-listing page live in Settings whenever you want.
        </p>
        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-launch-create"
            onClick={onCreatePage}
          >
            Create your first seller page
          </button>
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-launch-review"
            onClick={onReview}
          >
            Review my Studio Profile
          </button>
        </div>
      </CenteredScreen>
    );
  }

  /* ─────────────────────────── the step console ──────────────────────────── */

  const step = activeStep as SegmentKey;
  const frame = STEP_FRAME[step];
  // Phase-1 essentials gate to client-ready (required, no skip); Phase-2
  // enrichment can always continue (encouraged via reassurance, never forced).
  const canSave =
    step === "you"
      ? !!effective.agentName?.trim()
      : step === "reach"
        ? !!(effective.contactEmail?.trim() || effective.contactPhone?.trim())
        : step === "proof"
          ? isProofDone(effective)
          : true;
  // Any step at or before the current one is reachable for re-editing via the
  // rail (jump back to fix a typo); forward jumps stay gated behind Save.
  const curIdx = STEP_ORDER.indexOf(step);
  const reachable = new Set<SegmentKey>(
    STEP_ORDER.filter((_, i) => i <= curIdx),
  );

  return (
    <div className="sp" data-testid="sp-console">
      <aside className="sp__rail">
        <SegmentedProgress
          done={done}
          active={step}
          layout="rail"
          selectable={reachable}
          onSelect={goTo}
        />
        <p className="sp-reassure" data-testid="sp-reassure">
          {REASSURANCE}
        </p>
      </aside>

      <div className="sp__bar">
        <SegmentedProgress
          done={done}
          active={step}
          layout="bar"
          selectable={reachable}
          onSelect={goTo}
        />
        <p className="sp-reassure sp-reassure--bar">{REASSURANCE}</p>
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
          {step === "sell" && <SellFields effective={effective} setField={setField} />}
          {step === "work" && <WorkFields effective={effective} setField={setField} />}
          {step === "brand" && <BrandFields effective={effective} setField={setField} />}
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
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-back"
            disabled={savedAsset !== null}
            onClick={() => goTo(PREV_SCREEN[step])}
          >
            Back
          </button>
        </div>
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
  // Store the text RAW (no trim) so the controlled inputs don't strip the space
  // at the caret on every keystroke (the "can't type spaces" bug). Trimming +
  // the empty-name default are applied once at commit (see commitAndAdvance).
  const setReview = (b: string, n: string) =>
    setField({
      agentReviews: b.trim() ? [{ body: b, attributionName: n }] : undefined,
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

const MARKETING_CAP = 3;

function SellFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  // Narrow step: ONLY what the State-A marketing-zone preview renders — the lead
  // emphasis (→ the zone headline) and the marketing approach points (→ the
  // "What's included" cards), hard-capped at 3. Differentiators / how-we-work /
  // guarantee / stats stay editable in Settings (they power the full-presentation
  // & pre-listing WhyUs), so "done" here is honest about the preview.
  const whyUs = effective.whyUs ?? defaultWhyUs();
  const points = whyUs.marketingApproach.slice(0, MARKETING_CAP);
  const writePoints = (next: typeof points) =>
    setField({ whyUs: { ...whyUs, marketingApproach: next } });

  return (
    <>
      <div className="sp-field">
        <span className="sp-label">What gets buyers in?</span>
        <p className="sp-hint">
          Pick the angle you lead with — it becomes your page&rsquo;s
          &ldquo;How I&rsquo;ll get your home seen&rdquo; headline.
        </p>
        <div className="sp-levers" data-testid="sp-levers">
          {LEAD_EMPHASIS_PRIMARY.map((k) => (
            <button
              key={k}
              type="button"
              className={`sp-lever${effective.leadEmphasis === k ? " sp-lever--active" : ""}`}
              data-testid={`sp-lever-${k}`}
              onClick={() => setField({ leadEmphasis: k as LeadEmphasisKey })}
            >
              {LEAD_EMPHASIS_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-field" data-testid="sp-marketing">
        {/* Label matches the prominent eyebrow the preview renders. */}
        <span className="sp-label">How I&rsquo;ll get your home seen</span>
        <p className="sp-hint">
          Your {MARKETING_CAP} strongest marketing points — they appear under
          &ldquo;What&rsquo;s included&rdquo; on your page.
        </p>
        {points.map((p, i) => (
          <div className="sp-mkt-point" key={i} data-testid={`sp-mkt-point-${i}`}>
            <input
              className="sp-input"
              type="text"
              value={p.title}
              placeholder="Professional photography & video"
              data-testid={`sp-mkt-title-${i}`}
              onChange={(e) =>
                writePoints(
                  points.map((q, j) =>
                    j === i ? { ...q, title: e.target.value } : q,
                  ),
                )
              }
            />
            <textarea
              className="sp-input sp-textarea"
              rows={2}
              value={p.detail ?? ""}
              placeholder="Every listing, shot by a pro."
              data-testid={`sp-mkt-detail-${i}`}
              onChange={(e) =>
                writePoints(
                  points.map((q, j) =>
                    j === i ? { ...q, detail: e.target.value } : q,
                  ),
                )
              }
            />
            {points.length > 1 && (
              <button
                type="button"
                className="sp-mkt-remove"
                data-testid={`sp-mkt-remove-${i}`}
                onClick={() => writePoints(points.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {points.length < MARKETING_CAP ? (
          <button
            type="button"
            className="sp-mkt-add"
            data-testid="sp-mkt-add"
            onClick={() => writePoints([...points, { title: "", detail: "" }])}
          >
            + Add a point
          </button>
        ) : (
          <p className="sp-hint">
            That&rsquo;s your {MARKETING_CAP} strongest — your page shows three.
          </p>
        )}
      </div>
    </>
  );
}

function WorkFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  return (
    <>
      <div className="sp-field">
        <span className="sp-label">Sample listing photo (optional)</span>
        <p className="sp-hint">
          Your best listing photography — it leads your &ldquo;How I&rsquo;ll get
          your home seen&rdquo; showcase.
        </p>
        <ImageUploadField
          label="Sample photo"
          value={effective.sampleListingPhotoUrl ?? ""}
          onChange={(url) => setField({ sampleListingPhotoUrl: url || undefined })}
          folder="agent-sample-photo"
          testIdPrefix="sp-sample-photo"
          previewAspect="aspect-[4/3]"
        />
      </div>

      <div className="sp-field">
        <span className="sp-label">Sample video tour (optional)</span>
        <p className="sp-hint">A recent tour you produced — shown in the showcase.</p>
        <VideoUploadField
          label="Sample video"
          value={effective.sampleVideoUrl ?? ""}
          onChange={(url) => setField({ sampleVideoUrl: url || undefined })}
          folder="agent-sample-video"
          testIdPrefix="sp-sample-video"
          currentPosterUrl={effective.sampleVideoPosterUrl}
          onPosterChange={(url) =>
            setField({ sampleVideoPosterUrl: url || undefined })
          }
        />
      </div>

      <div className="sp-embed" data-testid="sp-recent-listings">
        <RecentListingsEditor
          listings={effective.recentListings ?? []}
          onChange={(next) => setField({ recentListings: next })}
          enablePhotoPosition
        />
      </div>
    </>
  );
}

function BrandFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  const accent = effective.brandAccent ?? "#037290";
  return (
    <>
      <div className="sp-field">
        <span className="sp-label">Signature color</span>
        <p className="sp-hint">Carries across every page, promo, and follow-up.</p>
        <div className="sp-color">
          <input
            type="color"
            className="sp-color__swatch"
            data-testid="sp-input-brand-color"
            value={accent}
            aria-label="Signature color"
            onChange={(e) => setField({ brandAccent: e.target.value })}
          />
          <input
            type="text"
            className="sp-input sp-color__hex"
            value={accent}
            aria-label="Signature color hex"
            onChange={(e) => setField({ brandAccent: e.target.value })}
          />
        </div>
      </div>
      <div className="sp-field">
        <span className="sp-label">Logo (optional)</span>
        <ImageUploadField
          label="Logo"
          value={effective.logoDataUrl ?? ""}
          onChange={(url) => setField({ logoDataUrl: url || null })}
          folder="brand-logo"
          testIdPrefix="sp-logo"
          previewAspect="aspect-[5/1]"
          previewFit="contain"
        />
        <p className="sp-hint">Shown at its true size on your pages — never cropped.</p>
      </div>
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
