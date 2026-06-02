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
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";

/**
 * Seller Presentation — shared wizard state (Phase A foundation).
 *
 * Lifted verbatim out of `src/app/seller-presentation/page.tsx`
 * (previously lines 104-238). This is a PURE REFACTOR — the open
 * resolution, autosave, URL-sync, and setter semantics are byte-for-
 * byte the behavior the page shipped; the only change is the address
 * (a hook instead of inline component state). Later phases consume
 * the returned `instance` / `currentStep` / setters directly so the
 * shared median (Phase B2/B3/B6) and `themeId` (Phase E) are reachable
 * without prop-drilling through every step.
 *
 * Persistence model (unchanged): the converged WorkflowInstance
 * storage (src/skills/workflow-instance-storage.ts) keyed by a URL
 * `?id=<workflowInstanceId>` parameter — NOT a per-tool *:draft
 * localStorage key.
 *
 * Open-behavior — three branches, every one ending at
 * `?id=<currentInstanceId>` via history.replaceState so reload +
 * share-link are stable:
 *   - `?id=` present → markOpened that specific instance
 *   - `?id=` absent + an in-progress SP instance exists → RESUME the
 *     most recent one (the dashboard-tile reopen flow goes here)
 *   - `?id=` absent + no in-progress SP instance → createInstance
 *
 * SSR-safe: initialize empty on server + first client render, populate
 * via useEffect post-mount. window.location + window.history are read
 * inside that effect so they never fire during SSR.
 */

/**
 * The wizard's step registry. Single source of truth for both the
 * hook (which validates a loaded instance's persisted `currentStep`)
 * and the page (which renders the indicator + nav from the labels).
 */
export const STEPS = [
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

export type StepId = (typeof STEPS)[number]["id"];

const SKILL_ID = "seller-presentation";

export function isValidStepId(value: string | null | undefined): value is StepId {
  return Boolean(value && STEPS.some((s) => s.id === value));
}

export interface SellerPresentationState {
  instance: WorkflowInstance<SellerPresentationDraft> | null;
  currentStep: StepId;
  /** Set the current step + persist it onto the instance. */
  setStep: (next: StepId) => void;
  /**
   * Update the draft. Accepts either a replacement draft or a
   * functional updater. The functional form is load-bearing for the
   * video-upload completion path: the upload completes asynchronously
   * and its onChange callback fires against whatever draft is current
   * at completion time (which may have new sibling-field edits the
   * user typed during the upload). A stale closure with the
   * pre-upload draft would clobber those edits — exactly the bug
   * Dallen hit on 2026-05-24. Passing a function instead of a value
   * means we always merge against the freshest draft.
   */
  setDraft: (
    next:
      | SellerPresentationDraft
      | ((prev: SellerPresentationDraft) => SellerPresentationDraft),
  ) => void;
  /**
   * Abandon the currently-loaded instance and start a fresh draft.
   * The old instance stays in storage (it's just no longer the
   * "most recent in-progress" one). Updates the URL so a subsequent
   * reload still resolves to this new instance.
   */
  startNew: () => void;
}

export function useSellerPresentationState(): SellerPresentationState {
  const [instance, setInstance] =
    useState<WorkflowInstance<SellerPresentationDraft> | null>(null);
  const [currentStep, setCurrentStepState] = useState<StepId>("property");

  // Mount: resolve which instance to open. Three branches:
  //   (a) explicit ?id= → markOpened that one
  //   (b) no ?id= + an in-progress SP instance exists → RESUME it
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

  const setDraft: SellerPresentationState["setDraft"] = (next) => {
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

  const setStep = (next: StepId) => {
    setCurrentStepState(next);
    setInstance((prev) => (prev ? { ...prev, currentStep: next } : prev));
  };

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

  return { instance, currentStep, setStep, setDraft, startNew };
}
