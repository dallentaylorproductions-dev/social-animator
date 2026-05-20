"use client";

import { useEffect, useState } from "react";
import {
  createInstance,
  loadInstance,
  markOpened,
  saveInstance,
} from "@/skills/workflow-instance-storage";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  EMPTY_DRAFT,
  isStepPropertyComplete,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import { StepProperty } from "@/tools/seller-presentation/components/StepProperty";
import { StepComps } from "@/tools/seller-presentation/components/StepComps";
import { StepStrategy } from "@/tools/seller-presentation/components/StepStrategy";
import { StepPitch } from "@/tools/seller-presentation/components/StepPitch";
import { StepReview } from "@/tools/seller-presentation/components/StepReview";

/**
 * Seller Presentation — 5-step wizard shell (v1.47 / A5a).
 *
 * Spine + shell + Step 1 LIVE; steps 2–5 are minimal stubs that
 * traverse but don't write. A5b fills the stubs in.
 *
 * Distinguishing feature vs. the existing wizard shells (SIR / OH
 * Prep): persistence flows through the CONVERGED WorkflowInstance
 * storage (src/skills/workflow-instance-storage.ts) keyed by a URL
 * `?id=<workflowInstanceId>` parameter — NOT a per-tool *:draft
 * localStorage key. On fresh entry: createInstance + replaceState
 * the URL so reload restores. On entry with ?id=: markOpened + load.
 * On every draft / step change: saveInstance (which bumps updatedAt).
 *
 * SSR-safe per Substrate §9.7: initialize empty on server + first
 * client render, populate via useEffect post-mount. window.location
 * + window.history.replaceState are inside that effect so they
 * never fire during SSR.
 *
 * Cross-component primitive read: StepProperty owns the
 * useListingProfile call and mirrors (propertyId, address, city)
 * into the draft so this shell can gate Step 1's Next on draft
 * fields alone (single source of truth — see StepProperty's
 * comment for the rationale).
 */

const STEPS = [
  { id: "property", label: "The home" },
  { id: "comps", label: "Comps" },
  { id: "strategy", label: "Strategy" },
  { id: "pitch", label: "Your pitch" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const SKILL_ID = "seller-presentation";

function isStepValid(
  stepId: StepId,
  instance: WorkflowInstance<SellerPresentationDraft> | null,
): boolean {
  if (!instance) return false;
  if (stepId === "property") return isStepPropertyComplete(instance.draft);
  // Stubs always pass; A5b adds per-step gating as each form lands.
  return true;
}

function isValidStepId(value: string | null | undefined): value is StepId {
  return Boolean(value && STEPS.some((s) => s.id === value));
}

export default function SellerPresentationPage() {
  const [instance, setInstance] =
    useState<WorkflowInstance<SellerPresentationDraft> | null>(null);
  const [currentStep, setCurrentStepState] = useState<StepId>("property");

  // Mount: load existing instance from ?id=, else create a fresh one
  // and replace the URL so reload restores. Run once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (id) {
      // markOpened stamps lastOpenedAt + returns the loaded instance,
      // or null if the id was nuked / never existed.
      const opened = markOpened<SellerPresentationDraft>(id);
      if (opened) {
        setInstance(opened);
        if (isValidStepId(opened.currentStep)) {
          setCurrentStepState(opened.currentStep);
        }
        return;
      }
    }

    const created = createInstance<SellerPresentationDraft>({
      skillId: SKILL_ID,
      draft: { ...EMPTY_DRAFT },
      currentStep: "property",
    });
    setInstance(created);
    // replaceState (not pushState) — back button still leaves the wizard.
    const newUrl = `${window.location.pathname}?id=${created.instanceId}`;
    window.history.replaceState({}, "", newUrl);
  }, []);

  // Persist any change to the instance (draft or currentStep). saveInstance
  // bumps updatedAt server-side; the React state's updatedAt lags by one
  // save cycle, which is fine — no consumer renders updatedAt mid-session.
  useEffect(() => {
    if (!instance) return;
    saveInstance(instance);
  }, [instance]);

  const setDraft = (next: SellerPresentationDraft) => {
    setInstance((prev) => (prev ? { ...prev, draft: next } : prev));
  };

  const setCurrentStep = (next: StepId) => {
    setCurrentStepState(next);
    setInstance((prev) => (prev ? { ...prev, currentStep: next } : prev));
  };

  if (!instance) {
    return (
      <div className="p-8 text-sm text-gray-400" data-testid="wizard-loading">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8" data-testid="seller-presentation-wizard">
      <header className="mb-8">
        <a
          href="/dashboard"
          className="mb-4 inline-flex items-center text-xs uppercase tracking-[0.18em] text-neutral-500 transition-colors hover:text-mint"
        >
          ← Dashboard
        </a>
        <h1 className="text-2xl font-semibold">Seller Presentation</h1>
        <p className="mt-1 text-sm text-gray-400">
          Listing-appointment prep + premium seller-facing page. Step{" "}
          {STEPS.findIndex((s) => s.id === currentStep) + 1} of {STEPS.length}.
        </p>
      </header>

      <StepIndicator currentStep={currentStep} />

      <section className="mt-8 min-h-[400px]">
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
        {currentStep === "review" && (
          <StepReview draft={instance.draft} goToStep={setCurrentStep} />
        )}
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
            Done — back to dashboard →
          </a>
        </div>
      )}
    </div>
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
