"use client";

import { useEffect } from "react";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  isInvitationStatus,
  isStepPropertyComplete,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import {
  STEPS,
  visibleSteps,
  useSellerPresentationState,
  type DraftSaveState,
  type StepId,
} from "@/tools/seller-presentation/hooks/useSellerPresentationState";
import { StepProperty } from "@/tools/seller-presentation/components/StepProperty";
import { StepComps } from "@/tools/seller-presentation/components/StepComps";
import { StepNearbySales } from "@/tools/seller-presentation/components/StepNearbySales";
import { StepStrategy } from "@/tools/seller-presentation/components/StepStrategy";
import { StepPitch } from "@/tools/seller-presentation/components/StepPitch";
import { StepEditorial } from "@/tools/seller-presentation/components/StepEditorial";
import { StepReview } from "@/tools/seller-presentation/components/StepReview";
import { StepErrorBoundary } from "@/components/StepErrorBoundary";
import {
  SPEntitlementProvider,
  useSPEntitlement,
} from "@/tools/seller-presentation/components/SPEntitlementContext";
import { WizardPreview } from "@/tools/seller-presentation/components/WizardPreview";
import "./sep-wizard.css";

/**
 * Seller Presentation — 5-step wizard shell.
 *
 * Phase A: all WorkflowInstance open/save/URL-sync/setter logic lives
 * in `useSellerPresentationState()` (src/tools/seller-presentation/
 * hooks/useSellerPresentationState.ts). This component is now a thin
 * view: it calls the hook, renders the step body + nav, and owns only
 * view concerns (the per-step scroll-to-top, the Next-gating predicate).
 * The step registry (`STEPS` / `StepId`) is exported from the hook —
 * the single source of truth both this view and the hook read.
 *
 * SP-LIB: this is the SAME wizard that has always been the tool's
 * landing — it was lifted verbatim out of the route's `page.tsx` so a
 * thin server gate can choose between it and the "Your pages" library.
 * Two ADDITIVE props thread the library in without changing any
 * flag-off behavior:
 *   - `ownerEmail` stamps instances this wizard creates (draft scoping).
 *   - `libraryEnabled` reveals a "Your pages" back-link + records each
 *     publish onto the instance (Live / edits-pending). When false (the
 *     flag-off path) the render is byte-identical to the pre-SP-LIB tool.
 *
 * Cross-component primitive read: StepProperty owns the
 * useListingProfile call and mirrors (propertyId, address, city)
 * into the draft so this shell can gate Step 1's Next on draft
 * fields alone (single source of truth — see StepProperty's
 * comment for the rationale).
 */

function isStepValid(
  stepId: StepId,
  instance: WorkflowInstance<SellerPresentationDraft> | null,
): boolean {
  if (!instance) return false;
  if (stepId === "property") return isStepPropertyComplete(instance.draft);
  // Stubs always pass; A5b adds per-step gating as each form lands.
  return true;
}

export function SellerPresentationWizard(props: {
  ownerEmail?: string | null;
  libraryEnabled?: boolean;
  /**
   * SP-KEYSTONE — when true, the wizard's drafts live in the owner-scoped
   * server store (cross-device edit + republish) instead of per-device
   * localStorage, with a debounced autosave whose status this shell surfaces.
   * Default false ⇒ today's localStorage behavior, byte-identical.
   */
  serverDraftsEnabled?: boolean;
}) {
  // The entitlement provider now wraps the whole body (not just the inner
  // markup) so `WizardBody` can read the SELLER_STATE_A flag and collapse the
  // stepper to the lean invitation set. SPEntitlementProvider renders no DOM of
  // its own, so flag-off output is byte-identical to before.
  return (
    <SPEntitlementProvider>
      <WizardBody {...props} />
    </SPEntitlementProvider>
  );
}

function WizardBody({
  ownerEmail = null,
  libraryEnabled = false,
  serverDraftsEnabled = false,
}: {
  ownerEmail?: string | null;
  libraryEnabled?: boolean;
  serverDraftsEnabled?: boolean;
}) {
  const { sellerStateAEnabled } = useSPEntitlement();
  const {
    instance,
    currentStep,
    setStep,
    setDraft,
    startNew,
    applyPublished,
    saveState,
  } = useSellerPresentationState(ownerEmail, serverDraftsEnabled);
  const setCurrentStep = setStep;

  // Seller State A — the page type drives which steps exist. Full presentation
  // (revealed / absent, or the flag off) is always the complete six-step flow,
  // byte-identical to today; an invitation status with the flag on collapses to
  // the lean set. Read off the live draft so toggling the page type on Step 1
  // re-shapes the stepper immediately.
  const stateAOn = sellerStateAEnabled === true;
  const status = instance?.draft.valuationStatus;
  const invitation = stateAOn && isInvitationStatus(status);
  const steps = visibleSteps(stateAOn, status);

  // If the visible set ever stops containing the current step (e.g. the agent
  // switches a draft parked on Strategy back to an invitation, or a persisted
  // draft loads onto a now-hidden step), fall back to the nearest still-visible
  // step at or before it so the body never renders a hidden step. Runs after the
  // step list settles; a no-op whenever the current step is already visible
  // (the overwhelming common case, including every flag-off render).
  useEffect(() => {
    if (!instance) return;
    if (steps.some((s) => s.id === currentStep)) return;
    const fullIdx = STEPS.findIndex((s) => s.id === currentStep);
    const fallback =
      [...steps]
        .reverse()
        .find((s) => STEPS.findIndex((x) => x.id === s.id) <= fullIdx) ??
      steps[0];
    setStep(fallback.id);
    // `steps` identity changes whenever the page type does; that plus
    // currentStep is the full trigger set. setStep is stable plumbing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, currentStep, instance]);

  // A7c.9 — reset window scroll to the top on every step transition so
  // the new step opens with its first field in view. Without this, a
  // long previous step (Comps, in particular) carries its scroll
  // position over and the next step opens scrolled to the bottom — on
  // mobile this hid the Strategy step's recommended-price + rationale
  // fields above the fold, so an agent moving quickly never saw them.
  // Runs after React commits the new step's DOM. Instant jump
  // (behavior:'auto') is reduced-motion-safe and avoids smooth-scroll
  // jitter on iOS WebKit. The wizard renders directly under <body> with
  // no inner scroll container, so resetting the window is sufficient
  // here — if a future layout wraps it in a scroll region, reset that
  // container's scrollTop as well.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [currentStep]);

  if (!instance) {
    return (
      <div className="sep-wizard-loading" data-testid="wizard-loading">
        Loading…
      </div>
    );
  }

  return (
    <div className="sep-wizard" data-testid="seller-presentation-wizard">
    <div className="sep-shell">
    <div className="sep-container">
      <header>
        <div className="topnav">
          {/* "Start a new presentation" — A6.1. Always rendered (an
              instance is always loaded by the time this returns).
              Without this affordance, an agent could never start a
              second presentation once the resume-on-open behavior was
              in place.

              SP-LIB: when the library is on, the left link returns to
              "Your pages" (the library landing) instead of straight to
              the dashboard. Flag-off keeps the original "← Dashboard"
              link byte-for-byte. */}
          {libraryEnabled ? (
            <a
              href="/seller-presentation"
              className="topnav-l"
              data-testid="wizard-back-library"
            >
              ← Your pages
            </a>
          ) : (
            <a href="/dashboard" className="topnav-l">
              ← Dashboard
            </a>
          )}
          <button
            type="button"
            onClick={startNew}
            data-testid="wizard-start-new"
            className="topnav-r"
          >
            + Start a new presentation
          </button>
        </div>

        {/* SP-KEYSTONE — autosave status. Rendered ONLY when the server draft
            store is on, so the flag-off wizard is byte-identical (no new
            node). It reflects the SERVER acknowledgement: "Saving…" while a
            write is debounced/in flight, "Saved automatically" on ack,
            "Reconnecting…" while retrying a transient failure, and a calm
            "Saved on this device" if retries are exhausted (the work is still
            safe in the local cache and the next edit re-arms the save). */}
        {serverDraftsEnabled && <SaveStatus state={saveState} />}

        <div className="brandhead">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            SEP Studio
          </div>
          <h1 className="sep-title">Seller Presentation</h1>
          <p className="subtitle">
            Listing-appointment prep + premium seller-facing page
          </p>
          {/* The static "See an example" link is retired (capstone): the live
              preview panel IS the example — it shows the fully-filled sample in
              the agent's brand color until the draft has something to show. */}
        </div>
      </header>

      <StepRail
        steps={steps}
        currentStep={currentStep}
        instance={instance}
        onNavigate={setCurrentStep}
      />

      {/* StepErrorBoundary (A7c.4.1): scoped to the step body so a
          field that throws during render degrades to an inline
          fallback and leaves the surrounding wizard nav clickable.
          Replaces the previous behavior where one bad field froze
          every button on the page (Dallen's A7c.4 phone smoke).
          `resetKey={currentStep}` clears the caught error when the
          agent navigates away from the broken step so re-entering
          it after a code fix or storage clear is clean. */}
      <section className="min-h-[400px]">
        <StepErrorBoundary
          resetKey={currentStep}
          stepLabel={STEPS.find((s) => s.id === currentStep)?.label}
        >
          {currentStep === "property" && (
            <StepProperty draft={instance.draft} setDraft={setDraft} />
          )}
          {currentStep === "comps" &&
            (invitation ? (
              // Invitation mode — the lean, address-only nearby-sales input.
              // The full StepComps (pricing analysis) is Stage 2 only.
              <StepNearbySales draft={instance.draft} setDraft={setDraft} />
            ) : (
              <StepComps draft={instance.draft} setDraft={setDraft} />
            ))}
          {currentStep === "strategy" && (
            <StepStrategy draft={instance.draft} setDraft={setDraft} />
          )}
          {currentStep === "pitch" && (
            <StepPitch draft={instance.draft} setDraft={setDraft} />
          )}
          {currentStep === "editorial" && (
            <StepEditorial draft={instance.draft} setDraft={setDraft} />
          )}
          {currentStep === "review" && (
            <StepReview
              draft={instance.draft}
              goToStep={setCurrentStep}
              // SP-LIB — wire publish linkage only when the library is on,
              // so the flag-off publish path is byte-identical to today.
              publishedSlug={
                libraryEnabled ? instance.publishedSlug : undefined
              }
              onPublished={libraryEnabled ? applyPublished : undefined}
            />
          )}
        </StepErrorBoundary>
      </section>

      <nav className="footer">
        <button
          type="button"
          onClick={() => {
            const idx = steps.findIndex((s) => s.id === currentStep);
            if (idx > 0) setCurrentStep(steps[idx - 1].id);
          }}
          disabled={currentStep === steps[0].id}
          className="ghostbtn lg"
          data-testid="wizard-prev"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isStepValid(currentStep, instance)) return;
            const idx = steps.findIndex((s) => s.id === currentStep);
            if (idx < steps.length - 1) setCurrentStep(steps[idx + 1].id);
          }}
          disabled={
            currentStep === steps[steps.length - 1].id ||
            !isStepValid(currentStep, instance)
          }
          className="mintbtn lg"
          data-testid="wizard-next"
        >
          Next →
        </button>
      </nav>

      {/* Seller State A — the A→B "evolve the same link" path. On the
          invitation's final step, a calm affordance turns this exact draft into
          the full presentation (Stage 2): it flips the page type to revealed
          (revealing the Strategy + Pitch steps + the full Comps step) and lands
          the agent on Comps to start the real pricing work. Same slug, same
          seller link; it just grows into the complete page after the
          walkthrough. Invitation-only, so the full presentation is unchanged. */}
      {invitation && currentStep === "review" && (
        <section
          className="sep-complete-full"
          data-testid="wizard-complete-full"
        >
          <div className="sep-complete-full__copy">
            <h3 className="sep-complete-full__title">
              Already walked the home?
            </h3>
            <p className="sep-complete-full__sub">
              Turn this same invitation into the full presentation, with your
              recommended price and the comps behind it. Your seller&apos;s link
              stays the same. It just grows into the complete page.
            </p>
          </div>
          <button
            type="button"
            className="mintbtn lg"
            onClick={() => {
              setDraft((prev) => ({ ...prev, valuationStatus: "revealed" }));
              setCurrentStep("comps");
            }}
            data-testid="wizard-complete-full-btn"
          >
            Complete the full presentation →
          </button>
        </section>
      )}

      {currentStep === "review" && (
        <div className="review-foot">
          <a
            href={libraryEnabled ? "/seller-presentation" : "/dashboard"}
            className="example-link"
          >
            {libraryEnabled
              ? "Done. Back to your pages →"
              : "Done. Back to dashboard →"}
          </a>
        </div>
      )}
    </div>
    {/* Live seller-page preview — docked beside the form on desktop, a floating
        "Preview ↗" button on mobile. Renders the agent's draft (or the badged
        sample when sparse) from the same draft state the wizard autosaves. */}
    <WizardPreview draft={instance.draft} currentStep={currentStep} />
    </div>
    </div>
  );
}

/**
 * SP-KEYSTONE — the autosave status chip (server-drafts mode only). A quiet,
 * non-interactive `role="status"` line so a screen reader announces save
 * progress without stealing focus. Hidden entirely when idle (e.g. right
 * after a fresh load) so it never adds noise. The "error" copy is
 * deliberately reassuring, not alarming: the work is safe on the device.
 */
const SAVE_STATUS_LABEL: Record<DraftSaveState, string | null> = {
  idle: null,
  saving: "Saving…",
  saved: "Saved automatically",
  retrying: "Reconnecting…",
  error: "Saved on this device",
};

function SaveStatus({ state }: { state: DraftSaveState }) {
  const label = SAVE_STATUS_LABEL[state];
  if (!label) return null;
  return (
    <div
      className="sep-savestatus"
      data-state={state}
      role="status"
      aria-live="polite"
      data-testid="wizard-save-status"
    >
      {label}
    </div>
  );
}

/**
 * Step rail (Phase B1) — six equal columns with the redesign's todo / done /
 * active states (a 2px underline that goes hairline → mint-line →
 * solid-mint-glow as the agent advances). Mobile collapses to 3 columns via
 * the scoped CSS.
 *
 * Each item is a real button that jumps to its step via the SAME `setStep`
 * Previous/Next drive (so the scroll-to-step-top effect and the live preview's
 * step→section sync both follow rail jumps with no extra wiring). Rail
 * navigation REUSES the wizard's existing gating — it never loosens it: a
 * step is clickable only if every step before it is valid (mirroring the
 * linear Next-gating). Today only `property` gates; the loop below is written
 * generally so any future per-step gate governs the rail automatically. A
 * gated step renders `aria-disabled` (muted, default cursor) and ignores
 * clicks/keys; the active step carries `aria-current="step"`.
 */
function StepRail({
  steps,
  currentStep,
  instance,
  onNavigate,
}: {
  /** The visible step set — the lean invitation subset or the full six. */
  steps: ReadonlyArray<{ id: StepId; label: string }>;
  currentStep: StepId;
  instance: WorkflowInstance<SellerPresentationDraft> | null;
  onNavigate: (id: StepId) => void;
}) {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);
  // Highest index reachable via Next from the start: walk forward while each
  // step is valid. Steps at or below this index are clickable.
  let reachableMax = 0;
  while (
    reachableMax < steps.length - 1 &&
    isStepValid(steps[reachableMax].id, instance)
  ) {
    reachableMax += 1;
  }
  // Only the lean invitation set (≠ the full six) gets the modifier, so the
  // full presentation + every flag-off render keeps the original `.rail` markup
  // byte-for-byte.
  const lean = steps.length !== STEPS.length;
  return (
    <ol className={`rail${lean ? " rail--lean" : ""}`} aria-label="Steps">
      {steps.map((step, idx) => {
        const state =
          idx < currentIdx ? "done" : idx === currentIdx ? "active" : "todo";
        const reachable = idx <= reachableMax;
        const isCurrent = idx === currentIdx;
        return (
          <li key={step.id} className={`rail-item ${state}`}>
            <button
              type="button"
              className="rail-btn"
              data-testid={`rail-step-${step.id}`}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={reachable ? undefined : true}
              onClick={() => {
                if (!reachable || isCurrent) return;
                onNavigate(step.id);
              }}
            >
              <span className="rail-num">{idx + 1}.</span>
              <span className="rail-label">{step.label}</span>
              <span className="rail-bar" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
