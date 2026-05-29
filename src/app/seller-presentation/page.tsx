"use client";

import { useEffect, useState } from "react";
import {
  createInstance,
  findLatestInProgress,
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
import { StepEditorial } from "@/tools/seller-presentation/components/StepEditorial";
import { StepReview } from "@/tools/seller-presentation/components/StepReview";
import { StepErrorBoundary } from "@/components/StepErrorBoundary";
import { SPEntitlementProvider } from "@/tools/seller-presentation/components/SPEntitlementContext";
import {
  COHORT_EXAMPLE_URL,
  COHORT_EXAMPLE_LABEL,
} from "@/lib/config/cohort-example";

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
 * localStorage key.
 *
 * Open-behavior (A6.1 — Dallen's smoke surfaced a continuity bug
 * in the original A5a flow):
 *   - `?id=` present → markOpened that specific instance
 *   - `?id=` absent + an in-progress SP instance exists → RESUME the
 *     most recent one (the dashboard-tile reopen flow goes here)
 *   - `?id=` absent + no in-progress SP instance → createInstance
 *   In all three cases the URL ends up at `?id=<currentInstanceId>`
 *   via history.replaceState, so reload + share-link are stable.
 *
 * "Start a new presentation" affordance (also A6.1): the agent can
 * always abandon the current draft and begin a fresh one without
 * touching localStorage by hand. Rendered when an instance is
 * loaded — it's both the "I want a new one" path AND the visible
 * proof that an existing draft was resumed (without it, the agent
 * has no way to know a resume happened vs. starting fresh).
 *
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
  // A7d — fully optional editorial step. Inserted between Pitch and
  // Review so a publish-ready agent (steps 1–4 satisfied) can either
  // skip it or fill any subset before reaching Review. No gating; the
  // shell's `isStepValid` defaults to true for stub-style steps.
  { id: "editorial", label: "Editorial" },
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

  // Mount: resolve which instance to open. Three branches:
  //   (a) explicit ?id= → markOpened that one (A5a behavior, unchanged)
  //   (b) no ?id= + an in-progress SP instance exists → RESUME it
  //       (A6.1 fix — was previously branch (c), losing draft state on
  //       a dashboard-tile reopen)
  //   (c) no ?id= + nothing to resume → createInstance
  // Every branch ends by setting the URL to `?id=<currentInstanceId>`
  // via replaceState so reload + share-link are stable. Runs once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    // (a) explicit ?id= takes precedence.
    if (id) {
      const opened = markOpened<SellerPresentationDraft>(id);
      if (opened) {
        adoptInstance(opened);
        return;
      }
      // Fall through if the id was nuked / never existed — treat as
      // (b) or (c).
    }

    // (b) Resume the most recent in-progress SP draft.
    const resumed = findLatestInProgress<SellerPresentationDraft>(SKILL_ID);
    if (resumed) {
      const reopened = markOpened<SellerPresentationDraft>(resumed.instanceId);
      adoptInstance(reopened ?? resumed);
      return;
    }

    // (c) Nothing to resume — start fresh.
    const created = createInstance<SellerPresentationDraft>({
      skillId: SKILL_ID,
      draft: { ...EMPTY_DRAFT },
      currentStep: "property",
    });
    adoptInstance(created);

    // Helper hoisted into the effect so it can read setState directly
    // and stay synchronous; the URL replaceState happens after both
    // state setters fire so all three branches share the same exit.
    function adoptInstance(loaded: WorkflowInstance<SellerPresentationDraft>) {
      setInstance(loaded);
      if (isValidStepId(loaded.currentStep)) {
        setCurrentStepState(loaded.currentStep);
      } else {
        setCurrentStepState("property");
      }
      const newUrl = `${window.location.pathname}?id=${loaded.instanceId}`;
      if (window.location.search !== `?id=${loaded.instanceId}`) {
        // replaceState (not pushState) — back button still leaves the
        // wizard to wherever the agent came from.
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, []);

  // Persist any change to the instance (draft or currentStep). saveInstance
  // bumps updatedAt server-side; the React state's updatedAt lags by one
  // save cycle, which is fine — no consumer renders updatedAt mid-session.
  useEffect(() => {
    if (!instance) return;
    saveInstance(instance);
  }, [instance]);

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

  // A7d.11 — `setDraft` accepts either a replacement draft or a
  // functional updater. The functional form is load-bearing for the
  // video-upload completion path: the upload completes asynchronously
  // and its onChange callback fires against whatever draft is current
  // at completion time (which may have new sibling-field edits the
  // user typed during the upload). A stale closure with the
  // pre-upload draft would clobber those edits — exactly the bug
  // Dallen hit on 2026-05-24. Passing a function instead of a value
  // means we always merge against the freshest draft.
  const setDraft = (
    next:
      | SellerPresentationDraft
      | ((prev: SellerPresentationDraft) => SellerPresentationDraft),
  ) => {
    setInstance((prev) => {
      if (!prev) return prev;
      const nextDraft =
        typeof next === "function"
          ? (next as (p: SellerPresentationDraft) => SellerPresentationDraft)(
              prev.draft,
            )
          : next;
      return { ...prev, draft: nextDraft };
    });
  };

  const setCurrentStep = (next: StepId) => {
    setCurrentStepState(next);
    setInstance((prev) => (prev ? { ...prev, currentStep: next } : prev));
  };

  /**
   * Abandon the currently-loaded instance and start a fresh draft.
   * The old instance stays in storage (it's just no longer the
   * "most recent in-progress" one — A7's dashboard polish surfaces
   * the full list). Updates the URL so a subsequent reload still
   * resolves to this new instance.
   */
  const startNew = () => {
    const created = createInstance<SellerPresentationDraft>({
      skillId: SKILL_ID,
      draft: { ...EMPTY_DRAFT },
      currentStep: "property",
    });
    setInstance(created);
    setCurrentStepState("property");
    const newUrl = `${window.location.pathname}?id=${created.instanceId}`;
    window.history.replaceState({}, "", newUrl);
  };

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
