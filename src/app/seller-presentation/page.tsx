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
import {
  COHORT_EXAMPLE_URL,
  COHORT_EXAMPLE_LABEL,
} from "@/lib/config/cohort-example";

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

export default function SellerPresentationPage() {
  const { instance, currentStep, setStep, setDraft, startNew } =
    useSellerPresentationState();
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
      <div className="p-8 text-sm text-gray-400" data-testid="wizard-loading">
        Loading…
      </div>
    );
  }

  return (
    <SPEntitlementProvider>
    <div className="mx-auto max-w-3xl px-4 py-8" data-testid="seller-presentation-wizard">
      <header className="mb-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <a
            href="/dashboard"
            className="inline-flex items-center text-xs uppercase tracking-[0.18em] text-neutral-500 transition-colors hover:text-mint"
          >
            ← Dashboard
          </a>
          {/* "Start a new presentation" — A6.1. Always rendered (an
              instance is always loaded by the time this returns).
              Without this affordance, an agent could never start a
              second presentation once the resume-on-open behavior was
              in place. */}
          <button
            type="button"
            onClick={startNew}
            data-testid="wizard-start-new"
            className="inline-flex items-center text-xs uppercase tracking-[0.18em] text-neutral-500 transition-colors hover:text-mint"
          >
            + Start a new presentation
          </button>
        </div>
        <h1 className="text-2xl font-semibold">Seller Presentation</h1>
        <p className="mt-1 text-sm text-gray-400">
          Listing-appointment prep + premium seller-facing page. Step{" "}
          {STEPS.findIndex((s) => s.id === currentStep) + 1} of {STEPS.length}.
        </p>
        {/* Anticipation Layer (v1.47) — a calm, always-available link to
            the canonical cohort example seller page. Lives in the header
            so it renders on every step (the chore-dread hits mid-flow, so
            the polished destination needs to be one tap away throughout,
            not only at the start). target="_blank" so clicking never
            costs the agent their in-progress draft. URL routes through the
            single swappable constant in @/lib/config/cohort-example. */}
        <a
          href={COHORT_EXAMPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="cohort-example-link"
          className="mt-3 inline-flex items-center text-sm text-neutral-400 transition-colors hover:text-mint"
        >
          {COHORT_EXAMPLE_LABEL} →
        </a>
      </header>

      <StepIndicator currentStep={currentStep} />

      {/* StepErrorBoundary (A7c.4.1): scoped to the step body so a
          field that throws during render degrades to an inline
          fallback and leaves the surrounding wizard nav clickable.
          Replaces the previous behavior where one bad field froze
          every button on the page (Dallen's A7c.4 phone smoke).
          `resetKey={currentStep}` clears the caught error when the
          agent navigates away from the broken step so re-entering
          it after a code fix or storage clear is clean. */}
      <section className="mt-8 min-h-[400px]">
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
            <StepReview draft={instance.draft} goToStep={setCurrentStep} />
          )}
        </StepErrorBoundary>
      </section>

      <nav className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === currentStep);
            if (idx > 0) setCurrentStep(STEPS[idx - 1].id);
          }}
          disabled={currentStep === STEPS[0].id}
          className="rounded border border-gray-700 px-4 py-2 text-sm disabled:opacity-50"
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
          className="rounded bg-mint px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="wizard-next"
        >
          Next →
        </button>
      </nav>

      {currentStep === "review" && (
        <div className="mt-8 border-t border-neutral-800 pt-6">
          <a
            href="/dashboard"
            className="inline-flex items-center text-sm text-neutral-400 transition-colors hover:text-mint"
          >
            Done. Back to dashboard →
          </a>
        </div>
      )}
    </div>
    </SPEntitlementProvider>
  );
}

function StepIndicator({ currentStep }: { currentStep: StepId }) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  return (
    <ol className="flex gap-2 text-xs">
      {STEPS.map((step, idx) => (
        <li
          key={step.id}
          className={`flex-1 border-b-2 pb-2 ${
            idx <= currentIdx
              ? "border-mint text-white"
              : "border-gray-700 text-gray-500"
          }`}
        >
          {idx + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}
