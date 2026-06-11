"use client";

import { useEffect } from "react";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  isStepPropertyComplete,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import {
  STEPS,
  useSellerPresentationState,
  type StepId,
} from "@/tools/seller-presentation/hooks/useSellerPresentationState";
import { StepProperty } from "@/tools/seller-presentation/components/StepProperty";
import { StepComps } from "@/tools/seller-presentation/components/StepComps";
import { StepStrategy } from "@/tools/seller-presentation/components/StepStrategy";
import { StepPitch } from "@/tools/seller-presentation/components/StepPitch";
import { StepEditorial } from "@/tools/seller-presentation/components/StepEditorial";
import { StepReview } from "@/tools/seller-presentation/components/StepReview";
import { StepErrorBoundary } from "@/components/StepErrorBoundary";
import { SPEntitlementProvider } from "@/tools/seller-presentation/components/SPEntitlementContext";
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

export function SellerPresentationWizard({
  ownerEmail = null,
  libraryEnabled = false,
}: {
  ownerEmail?: string | null;
  libraryEnabled?: boolean;
}) {
  const { instance, currentStep, setStep, setDraft, startNew, applyPublished } =
    useSellerPresentationState(ownerEmail);
  const setCurrentStep = setStep;

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
    <SPEntitlementProvider>
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
          {currentStep === "comps" && (
            <StepComps draft={instance.draft} setDraft={setDraft} />
          )}
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
            const idx = STEPS.findIndex((s) => s.id === currentStep);
            if (idx > 0) setCurrentStep(STEPS[idx - 1].id);
          }}
          disabled={currentStep === STEPS[0].id}
          className="ghostbtn lg"
          data-testid="wizard-prev"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isStepValid(currentStep, instance)) return;
            const idx = STEPS.findIndex((s) => s.id === currentStep);
            if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1].id);
          }}
          disabled={
            currentStep === STEPS[STEPS.length - 1].id ||
            !isStepValid(currentStep, instance)
          }
          className="mintbtn lg"
          data-testid="wizard-next"
        >
          Next →
        </button>
      </nav>

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
    </SPEntitlementProvider>
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
  currentStep,
  instance,
  onNavigate,
}: {
  currentStep: StepId;
  instance: WorkflowInstance<SellerPresentationDraft> | null;
  onNavigate: (id: StepId) => void;
}) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  // Highest index reachable via Next from the start: walk forward while each
  // step is valid. Steps at or below this index are clickable.
  let reachableMax = 0;
  while (
    reachableMax < STEPS.length - 1 &&
    isStepValid(STEPS[reachableMax].id, instance)
  ) {
    reachableMax += 1;
  }
  return (
    <ol className="rail" aria-label="Steps">
      {STEPS.map((step, idx) => {
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
