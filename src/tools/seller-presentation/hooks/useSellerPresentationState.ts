"use client";

import { useEffect, useRef, useState } from "react";
import {
  cacheInstance,
  createInstance,
  findLatestInProgress,
  loadInstance,
  markOpened,
  markPublished,
  saveInstance,
  listInstances,
} from "@/skills/workflow-instance-storage";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import { DEFAULT_BRAND_THEME_ID, loadBrandSettings } from "@/lib/brand";
import { planDraftMigration } from "@/lib/seller-presentation/draft-migration";
import {
  fetchServerDraft,
  fetchServerDrafts,
  putServerDraft,
} from "@/tools/seller-presentation/hooks/server-draft-client";

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
 * Persistence model — TWO modes, chosen by `serverDraftsEnabled`:
 *
 *   - OFF (default, today's product, BYTE-IDENTICAL): the converged
 *     WorkflowInstance localStorage store (workflow-instance-storage.ts)
 *     keyed by a URL `?id=<workflowInstanceId>` parameter. Every effect in
 *     this mode is the exact code that shipped pre-SP-KEYSTONE.
 *
 *   - ON (SP-KEYSTONE): the SERVER draft store is the source of truth
 *     (owner-scoped KV via /api/seller-presentation/drafts). On mount the
 *     hook migrates any owned local drafts up (lossless, idempotent, never
 *     claiming a legacy un-owned draft), loads the authoritative server copy
 *     by id (cross-device "Open"), keeps an OPTIMISTIC localStorage cache
 *     for instant feel + offline/crash resilience, and autosaves via a
 *     debounced server PUT with retry. Conflict policy: last-write-wins by
 *     `updatedAt`; on open the server copy wins, the local cache is only a
 *     fallback when the server is unreachable. A draft is NEVER dropped: the
 *     local cache is retained even after a confirmed server save.
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

/** SP-KEYSTONE — debounce + retry tuning for the server autosave (ON mode). */
const AUTOSAVE_DEBOUNCE_MS = 1500;
const RETRY_BASE_DELAY_MS = 2000;
const MAX_RETRIES = 4;

/**
 * SP-KEYSTONE — the autosave status the editor can surface (ON mode only;
 * OFF mode stays `idle` and renders no indicator, so flag-off is unchanged).
 *   idle      — nothing to save / fresh load
 *   saving    — a server PUT is debounced or in flight
 *   saved     — the server acknowledged the latest write
 *   retrying  — a transient failure; backing off and trying again (work is
 *               safe in the local cache meanwhile)
 *   error     — retries exhausted; the local cache still holds the work, the
 *               next edit re-arms the save
 */
export type DraftSaveState = "idle" | "saving" | "saved" | "retrying" | "error";

export function isValidStepId(value: string | null | undefined): value is StepId {
  return Boolean(value && STEPS.some((s) => s.id === value));
}

type SPInstance = WorkflowInstance<SellerPresentationDraft>;

/**
 * The most recent in-progress SP instance from a list (server-sourced in ON
 * mode). Mirrors the localStorage `findLatestInProgress` rule:
 * `completedAt` unset, sorted by `updatedAt` descending (ISO compares
 * lexicographically == chronologically).
 */
function latestInProgressFrom(instances: SPInstance[]): SPInstance | null {
  const candidates = instances.filter(
    (i) => i.skillId === SKILL_ID && !i.timestamps.completedAt,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    b.timestamps.updatedAt.localeCompare(a.timestamps.updatedAt),
  );
  return candidates[0];
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
  /**
   * SP-KEYSTONE — the server autosave status (ON mode). Always `idle` in
   * OFF mode (no server, no indicator). Additive: existing consumers that
   * don't destructure it are unaffected.
   */
  saveState: DraftSaveState;
}

/**
 * @param ownerEmail Lowercased session email from the server page. Stamped
 *   onto every instance this hook CREATES so the library can scope drafts
 *   to the authenticated agent. Read through a ref so the once-on-mount
 *   resolve effect always sees the latest value without re-running.
 * @param serverDraftsEnabled SP-KEYSTONE flag, threaded from the server page.
 *   false (default) ⇒ today's localStorage behavior, byte-identical. true ⇒
 *   the server draft store is authoritative (migrate + load + debounced PUT +
 *   optimistic local cache). Read through a ref for the same mount-effect
 *   reason as `ownerEmail`; it is stable for the life of a page render.
 */
export function useSellerPresentationState(
  ownerEmail?: string | null,
  serverDraftsEnabled?: boolean,
): SellerPresentationState {
  const [instance, setInstance] =
    useState<WorkflowInstance<SellerPresentationDraft> | null>(null);
  const [currentStep, setCurrentStepState] = useState<StepId>("property");
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");

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

  // SP-KEYSTONE — the flag, read through a ref for the same mount-effect
  // reason. Stable per page render; never changes after mount.
  const serverDraftsRef = useRef<boolean>(Boolean(serverDraftsEnabled));
  useEffect(() => {
    serverDraftsRef.current = Boolean(serverDraftsEnabled);
  }, [serverDraftsEnabled]);

  // SP-KEYSTONE — latest instance, kept in a ref so `applyPublished` can read
  // the current instanceId without a stale closure (it fires from StepReview
  // after a deliberate publish).
  const instanceRef = useRef<SPInstance | null>(null);
  useEffect(() => {
    instanceRef.current = instance;
  }, [instance]);

  // SP-KEYSTONE — server-autosave plumbing (ON mode only).
  //   flushTimerRef        — the single debounce/backoff timer.
  //   latestPersistedRef   — the freshest locally-cached copy awaiting a
  //                          server PUT; a retry always flushes THIS (so a
  //                          new edit during backoff supersedes the old one).
  //   retryCountRef        — consecutive transient-failure count for backoff.
  const flushTimerRef = useRef<number | null>(null);
  const latestPersistedRef = useRef<SPInstance | null>(null);
  const retryCountRef = useRef(0);
  // The publishedAt we last pushed, so the publish-mirror effect fires once
  // per publish and never re-pushes an already-synced live draft on resume.
  const lastPushedPublishedAtRef = useRef<string | undefined>(undefined);

  // Push `latestPersistedRef` to the server with bounded retry. On success
  // the local cache (already written) and the server agree; on a transient
  // failure we back off and retry the FRESHEST copy; on exhaustion we surface
  // `error` but the work is never lost (it stays in the local cache, and the
  // next edit re-arms the save).
  function flushNow(): void {
    const toSave = latestPersistedRef.current;
    if (!toSave) return;
    setSaveState("saving");
    void putServerDraft(toSave).then((res) => {
      if (res.ok) {
        retryCountRef.current = 0;
        setSaveState("saved");
        return;
      }
      if (res.retryable && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        setSaveState("retrying");
        if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = window.setTimeout(
          () => flushNow(),
          RETRY_BASE_DELAY_MS * retryCountRef.current,
        );
        return;
      }
      // 4xx, or retries exhausted: stop. The local cache retains the work.
      retryCountRef.current = 0;
      setSaveState("error");
    });
  }

  function scheduleServerFlush(): void {
    setSaveState("saving");
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(
      () => flushNow(),
      AUTOSAVE_DEBOUNCE_MS,
    );
  }

  // Tidy the debounce/backoff timer on unmount.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    };
  }, []);

  // Mount: resolve which instance to open. Branches on the flag.
  //
  // OFF (byte-identical to today): three localStorage branches —
  //   (a) explicit ?id= → markOpened that one
  //   (b) no ?id= + an in-progress SP instance exists → RESUME it
  //   (c) no ?id= + nothing to resume → createInstance
  // Every branch ends by setting the URL to `?id=<currentInstanceId>`
  // via replaceState so reload + share-link are stable. Runs once.
  useEffect(() => {
    if (serverDraftsRef.current) {
      void resolveFromServer();
      return;
    }

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
    // Mount-once resolver. `resolveFromServer` and the flag/owner are read
    // through refs by design so this runs exactly once; depending on them
    // would re-run the open resolution mid-session and double-create drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SP-KEYSTONE (ON mode) — adopt a resolved instance: mirror it into the
  // local cache VERBATIM (offline fallback that matches the server), set
  // state + URL, and seed the publish-mirror ref so a resumed live draft
  // isn't needlessly re-pushed.
  function adoptFromServer(loaded: SPInstance) {
    cacheInstance(loaded);
    lastPushedPublishedAtRef.current = loaded.publishedAt;
    setInstance(loaded);
    if (isValidStepId(loaded.currentStep)) {
      setCurrentStepState(loaded.currentStep);
    } else {
      setCurrentStepState("property");
    }
    const newUrl = `${window.location.pathname}?id=${loaded.instanceId}`;
    if (window.location.search !== `?id=${loaded.instanceId}`) {
      window.history.replaceState({}, "", newUrl);
    }
  }

  // SP-KEYSTONE (ON mode) — the server resolve: migrate, then open.
  async function resolveFromServer() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const email = ownerEmailRef.current;

    // 1) Read the agent's server drafts. null ⇒ the call FAILED (offline);
    //    distinct from [] ("you own none"). We only migrate when we could
    //    read the server (so we know what's already there) — pushing blindly
    //    is still idempotent, but skipping when the server is unreachable
    //    avoids churn and keeps the offline path purely local.
    const serverList = await fetchServerDrafts();
    const serverReachable = serverList !== null;
    const effectiveServer: SPInstance[] = serverList ? [...serverList] : [];

    if (serverReachable && email) {
      const plan = planDraftMigration({
        localInstances: listInstances(),
        serverInstanceIds: effectiveServer.map((i) => i.instanceId),
        sessionEmail: email,
      });
      if (plan.toPush.length > 0) {
        const results = await Promise.all(
          plan.toPush.map((i) => putServerDraft(i as SPInstance)),
        );
        results.forEach((res, idx) => {
          if (res.ok) {
            // Migrated up. The localStorage copy is RETAINED as a fallback —
            // never deleted (gate 1).
            effectiveServer.push(res.instance ?? (plan.toPush[idx] as SPInstance));
          } else {
            // Could not push this one; it stays device-local and migration
            // re-attempts on the next load (idempotent by id).
            console.warn(
              `[sp/drafts] migration push deferred for ${plan.toPush[idx].instanceId}`,
            );
          }
        });
      }
    }

    // 2) Resolve the open target.
    // (a) explicit ?id= — server copy is authoritative.
    if (id) {
      const fromServer = await fetchServerDraft(id);
      if (fromServer) {
        adoptFromServer(fromServer);
        return;
      }
      // Server miss: fall back to the local cache so an offline reload (or a
      // just-created draft mid-migration) still opens rather than blanking.
      const local = loadInstance<SellerPresentationDraft>(id);
      if (local) {
        adoptFromServer(local);
        return;
      }
      // else fall through to resume / create.
    }

    // (b) Resume the most recent in-progress SP draft — from the SERVER list,
    //     so resume works cross-device. Offline, fall back to local resume.
    const resumed = serverReachable
      ? latestInProgressFrom(effectiveServer)
      : findLatestInProgress<SellerPresentationDraft>(SKILL_ID);
    if (resumed) {
      adoptFromServer(resumed);
      return;
    }

    // (c) Nothing to resume — create fresh (locally cached immediately) and
    //     push to the server.
    const created = createInstance<SellerPresentationDraft>({
      skillId: SKILL_ID,
      draft: { ...EMPTY_DRAFT, themeId: seedDraftThemeId() },
      currentStep: "property",
      ownerEmail: email ?? undefined,
    });
    adoptFromServer(created);
    latestPersistedRef.current = created;
    flushNow();
  }

  // SP-LIB — set true by applyPublished so the very next autosave cycle is
  // skipped. markPublished already persisted the instance with
  // publishedAt === updatedAt; letting the autosave effect run would bump
  // updatedAt past publishedAt and falsely flag a just-published page as
  // "Live · edits pending". Only that one publish-triggered cycle is
  // skipped; every real draft edit saves normally.
  const skipNextSaveRef = useRef(false);

  // Persist any change to the instance (draft or currentStep). In BOTH modes
  // the local cache write happens here via `saveInstance` (today's exact
  // behavior — bumps updatedAt; the React state's updatedAt lags by one save
  // cycle, which is fine since no consumer renders updatedAt mid-session). In
  // ON mode we additionally schedule a debounced server PUT of that freshly
  // persisted copy.
  useEffect(() => {
    if (!instance) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const persisted = saveInstance(instance);
    if (serverDraftsRef.current) {
      latestPersistedRef.current = persisted;
      scheduleServerFlush();
    }
    // Fires on every instance change; `scheduleServerFlush` is stable plumbing
    // over refs, intentionally not a dependency (mirror of the pre-keystone
    // autosave effect, which depended only on `instance`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // SP-KEYSTONE — push the fresh draft to the server immediately so it is
    // openable from another device right away.
    if (serverDraftsRef.current) {
      lastPushedPublishedAtRef.current = undefined;
      latestPersistedRef.current = created;
      flushNow();
    }
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

  // SP-KEYSTONE (ON mode) — mirror a publish to the server immediately (a
  // publish is deliberate, not debounced). Fires once per publish: it keys
  // off `publishedAt`, which markPublished bumps, and the ref is seeded on
  // adopt so resuming an already-live draft never re-pushes. The autosave
  // effect is skipped for this same state change (skipNextSaveRef), so the
  // server gets exactly this one authoritative write.
  useEffect(() => {
    if (!serverDraftsRef.current) return;
    if (!instance?.publishedAt) return;
    if (instance.publishedAt === lastPushedPublishedAtRef.current) return;
    lastPushedPublishedAtRef.current = instance.publishedAt;
    latestPersistedRef.current = instance;
    flushNow();
    // Keyed deliberately on publishedAt only: we push exactly once per publish,
    // not on every keystroke. `flushNow`/`instance` are read fresh at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.publishedAt]);

  return {
    instance,
    currentStep,
    setStep,
    setDraft,
    startNew,
    applyPublished,
    saveState,
  };
}
