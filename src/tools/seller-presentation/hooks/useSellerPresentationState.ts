"use client";

import { useEffect, useRef, useState } from "react";
import {
  createInstance,
  findLatestInProgress,
  markOpened,
  markPublished,
  saveInstance,
} from "@/skills/workflow-instance-storage";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import { DEFAULT_BRAND_THEME_ID, loadBrandSettings } from "@/lib/brand";

/**
 * E.0 — seed a fresh draft's `themeId` from the brand-level default
 * layout. Read synchronously from localStorage (NOT via the async
 * useBrandSettings hook) so the value is available at creation time
 * inside the mount effect / startNew handler. Falls back to "editorial"
 * when unset — existing in-flight drafts keep their own themeId (or
 * undefined → editorial at render), so this only affects NEW drafts.
 */
function seedDraftThemeId(): string {
  return loadBrandSettings().defaultThemeId || DEFAULT_BRAND_THEME_ID;
}

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
  /**
   * SP-LIB — record a successful publish onto the current instance so
   * the "Your pages" library can mark it Live and, on the next edit,
   * "Live · edits pending". Stamps `publishedSlug` + `publishedAt` (via
   * `markPublished`) and mirrors the bumped record into local state.
   * No-op when no instance is loaded.
   */
  applyPublished: (slug: string) => void;
}

/**
 * @param ownerEmail Lowercased session email from the server page. Stamped
 *   onto every instance this hook CREATES so the library can scope drafts
 *   to the authenticated agent. Read through a ref so the once-on-mount
 *   resolve effect always sees the latest value without re-running.
 */
export function useSellerPresentationState(
  ownerEmail?: string | null,
): SellerPresentationState {
  const [instance, setInstance] =
    useState<WorkflowInstance<SellerPresentationDraft> | null>(null);
  const [currentStep, setCurrentStepState] = useState<StepId>("property");

  // Keep the latest ownerEmail reachable from the mount-only resolve
  // effect (which intentionally has an empty dep array) without making
  // that effect re-run on prop identity changes. The ref is seeded with
  // the first-render prop (already the correct server value, so the
  // mount effect reads it correctly on first run) and kept in sync via
  // an effect — never reassigned during render.
  const ownerEmailRef = useRef<string | null>(ownerEmail ?? null);
  useEffect(() => {
    ownerEmailRef.current = ownerEmail ?? null;
  }, [ownerEmail]);

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
      draft: { ...EMPTY_DRAFT, themeId: seedDraftThemeId() },
      currentStep: "property",
      ownerEmail: ownerEmailRef.current ?? undefined,
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

  // SP-LIB — set true by applyPublished so the very next autosave cycle is
  // skipped. markPublished already persisted the instance with
  // publishedAt === updatedAt; letting the autosave effect run would bump
  // updatedAt past publishedAt and falsely flag a just-published page as
  // "Live · edits pending". Only that one publish-triggered cycle is
  // skipped; every real draft edit saves normally.
  const skipNextSaveRef = useRef(false);

  // Persist any change to the instance (draft or currentStep). saveInstance
  // bumps updatedAt server-side; the React state's updatedAt lags by one
  // save cycle, which is fine — no consumer renders updatedAt mid-session.
  useEffect(() => {
    if (!instance) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
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
      draft: { ...EMPTY_DRAFT, themeId: seedDraftThemeId() },
      currentStep: "property",
      ownerEmail: ownerEmailRef.current ?? undefined,
    });
    setInstance(created);
    setCurrentStepState("property");
    const newUrl = `${window.location.pathname}?id=${created.instanceId}`;
    window.history.replaceState({}, "", newUrl);
  };

  const applyPublished = (slug: string) => {
    // Skip the autosave cycle this state change triggers — markPublished
    // already persisted with publishedAt === updatedAt.
    skipNextSaveRef.current = true;
    setInstance((prev) => {
      if (!prev) {
        skipNextSaveRef.current = false;
        return prev;
      }
      // markPublished writes localStorage + returns the stamped record;
      // mirror it into state so the wizard's autosave effect doesn't
      // clobber the publishedSlug/publishedAt on its next run.
      const stamped = markPublished<SellerPresentationDraft>(
        prev.instanceId,
        slug,
      );
      return stamped ?? prev;
    });
  };

  return { instance, currentStep, setStep, setDraft, startNew, applyPublished };
}
