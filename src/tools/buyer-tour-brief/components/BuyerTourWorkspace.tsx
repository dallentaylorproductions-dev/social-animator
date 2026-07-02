"use client";

/**
 * Buyer Tour Brief — the BUYER_TOUR_BUILDER_V2 workspace (the improved builder).
 *
 * Wraps the existing `BuyerTourBuilder` (embedded, reporting its live state up) with
 * the three friction-reducing levers:
 *
 *   • Lever 1 — LIVE PREVIEW: a debounced copy of the draft feeds `BuyerTourPreview`
 *     (the REAL buyer page). Desktop shows it side-by-side; mobile opens it full-
 *     screen from a "Preview" button. The debounce keeps typing unblocked.
 *   • Lever 2 — REOPEN + PROTECT WORK: the in-progress draft AUTOSAVES to the agent's
 *     localStorage (the app's `workflow-instance-storage` pattern, skillId
 *     "buyer-tour", owner-scoped) so a reload/crash never loses work and reopening
 *     resumes it. A "your buyer tours" drawer merges those local drafts with the
 *     agent's PUBLISHED tours (server, owner-scoped) so any tour can be reopened,
 *     edited, and re-published in place.
 *   • Lever 3/4 — the builder is handed `softWhy` + `formatNumbers`, so a tour can
 *     publish with addresses only and price/sqft format as the flagship's do.
 *
 * The auth gate (Lever 2 part 1) lives in middleware; this component assumes an
 * authenticated agent and receives their `ownerEmail` server-resolved as a prop.
 *
 * This whole component is only rendered when BUYER_TOUR_BUILDER_V2 is ON — flag-off,
 * the route renders the standalone `BuyerTourBuilder` byte-identical to today.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadBrandSettings } from "@/lib/brand";
import {
  EMPTY_BUYER_TOUR_DRAFT,
  type BuyerTourAgent,
  type BuyerTourDraft,
} from "../engine/types";
import {
  draftFromPublicPayload,
  type BuyerTourPublicPayload,
} from "../output/public-payload";
import {
  createInstance,
  findLatestInProgress,
  listInstances,
  loadInstance,
  markPublished,
  saveInstance,
} from "@/skills/workflow-instance-storage";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  BuyerTourBuilder,
  type BuyerTourBuilderState,
} from "./BuyerTourBuilder";
import { BuyerTourPreview } from "./BuyerTourPreview";

const SKILL_ID = "buyer-tour";
const PREVIEW_DEBOUNCE_MS = 250;
const SAVE_DEBOUNCE_MS = 800;

export interface BuyerTourWorkspaceProps {
  /** The authenticated agent's email (server-resolved), for owner-scoped autosave. */
  ownerEmail: string | null;
  schoolLayerAvailable: boolean;
  analyticsAvailable: boolean;
  /** BUYER_TOUR_BRIEF_V1 — the live buyer arrangement, server-resolved (preview mirrors it). */
  previewV1: boolean;
  /** `?id=` from the URL — reopen a specific local draft on first mount. */
  initialId?: string | null;
}

/** One editing session — bumping `key` remounts the builder with fresh initial state. */
interface Session {
  key: number;
  /** null until the draft has content and gets its first autosave (mint-on-write). */
  instanceId: string | null;
  initialDraft?: BuyerTourDraft;
  initialAnchor?: { label: string; address: string };
  initialSlug: string | null;
}

/** A card in the "your buyer tours" drawer (local draft and/or published tour). */
interface TourCard {
  key: string;
  label: string;
  detail: string;
  updatedAt: string;
  live: boolean;
  /** Present → reopen the local draft by id. */
  instanceId?: string;
  /** Present → the published slug (for the live link + reconstruct-on-reopen). */
  slug?: string;
}

interface ServerTour {
  slug: string;
  buyerName: string;
  tourDate: string;
  homeCount: number;
  createdAt: string;
  updatedAt: string;
}

function anchorFromDraft(
  draft?: BuyerTourDraft,
): { label: string; address: string } | undefined {
  if (!draft?.commuteAnchor) return undefined;
  return {
    label: draft.commuteAnchor.label,
    address: draft.commuteAnchor.address,
  };
}

function sessionFromInstance(
  inst: WorkflowInstance<BuyerTourDraft>,
  key: number,
): Session {
  return {
    key,
    instanceId: inst.instanceId,
    initialDraft: inst.draft,
    initialAnchor: anchorFromDraft(inst.draft),
    initialSlug: inst.publishedSlug ?? null,
  };
}

function freshSession(key: number): Session {
  return { key, instanceId: null, initialSlug: null };
}

/** Resolve the opening session from the URL id or the latest in-progress draft. */
function resolveInitialSession(initialId?: string | null): Session {
  if (typeof window === "undefined") return freshSession(0);
  if (initialId) {
    const inst = loadInstance<BuyerTourDraft>(initialId);
    if (inst) return sessionFromInstance(inst, 0);
  }
  const latest = findLatestInProgress<BuyerTourDraft>(SKILL_ID);
  if (latest) return sessionFromInstance(latest, 0);
  return freshSession(0);
}

/** Seed the preview from a session so it is never blank before the first report. */
function stateFromSession(session: Session): BuyerTourBuilderState {
  const draft: BuyerTourDraft =
    session.initialDraft ?? {
      ...EMPTY_BUYER_TOUR_DRAFT,
      priorities: ["schools", "commute", "parks"],
    };
  const anchor = session.initialAnchor ?? anchorFromDraft(draft);
  return {
    draft,
    anchorLabel: anchor?.label ?? "",
    anchorAddress: anchor?.address ?? "",
    publishedSlug: session.initialSlug,
  };
}

/** Read the agent's local buyer-tour drafts from storage, most-recent-first. */
function readLocalInstances(): WorkflowInstance<BuyerTourDraft>[] {
  if (typeof window === "undefined") return [];
  const list = listInstances().filter(
    (i) => i.skillId === SKILL_ID,
  ) as WorkflowInstance<BuyerTourDraft>[];
  list.sort((a, b) =>
    b.timestamps.updatedAt.localeCompare(a.timestamps.updatedAt),
  );
  return list;
}

/** Does a draft carry enough content to be worth persisting? (Avoid empty-draft clutter.) */
function hasContent(state: BuyerTourBuilderState): boolean {
  const d = state.draft;
  return (
    d.buyerName.trim().length > 0 ||
    d.tourDate.trim().length > 0 ||
    (d.agentNote?.trim().length ?? 0) > 0 ||
    state.anchorLabel.trim().length > 0 ||
    d.homes.some((h) => h.address.trim() || h.whyOnList.trim())
  );
}

function foldAnchor(state: BuyerTourBuilderState): BuyerTourDraft {
  const { draft, anchorLabel, anchorAddress } = state;
  if (!anchorLabel && !anchorAddress) return draft;
  return {
    ...draft,
    commuteAnchor: {
      label: anchorLabel,
      address: anchorAddress,
      ...(draft.commuteAnchor?.lat !== undefined &&
      draft.commuteAnchor?.lng !== undefined
        ? { lat: draft.commuteAnchor.lat, lng: draft.commuteAnchor.lng }
        : {}),
    },
  };
}

export function BuyerTourWorkspace({
  ownerEmail,
  schoolLayerAvailable,
  analyticsAvailable,
  previewV1,
  initialId = null,
}: BuyerTourWorkspaceProps) {
  const [session, setSession] = useState<Session>(() =>
    resolveInitialSession(initialId),
  );
  const [previewState, setPreviewState] = useState<BuyerTourBuilderState>(() =>
    stateFromSession(resolveInitialSession(initialId)),
  );
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [serverTours, setServerTours] = useState<ServerTour[]>([]);
  // Seeded synchronously from localStorage (sync API) so the mount effect never has
  // to setState — it only kicks the async server fetch.
  const [localInstances, setLocalInstances] = useState<
    WorkflowInstance<BuyerTourDraft>[]
  >(() => readLocalInstances());

  const instanceIdRef = useRef<string | null>(session.instanceId);
  const lastPublishedSlugRef = useRef<string | null>(session.initialSlug);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Agent identity + brand accent for the preview (client-side, from Brand Settings).
  const { agent, brandAccent } = useMemo(() => {
    const b = loadBrandSettings();
    const a: BuyerTourAgent = {
      name: b.agentName || undefined,
      brokerage: b.brokerage || undefined,
      phone: b.contactPhone || undefined,
      email: b.contactEmail || undefined,
      photoUrl: b.agentPhotoUrl || undefined,
      schedulingUrl: b.schedulingUrl || undefined,
    };
    return { agent: a, brandAccent: b.brandAccent };
  }, []);

  const refreshLocal = useCallback(() => {
    setLocalInstances(readLocalInstances());
  }, []);

  const refreshServer = useCallback(async () => {
    try {
      const res = await fetch("/api/buyer-tour/tours");
      if (!res.ok) return;
      const json = (await res.json()) as
        | { ok: true; tours: ServerTour[] }
        | { ok: false };
      if (json.ok) setServerTours(json.tours);
    } catch {
      /* offline / transient — the local list still shows */
    }
  }, []);

  useEffect(() => {
    // localInstances is seeded synchronously in useState; only the server list needs
    // an async fetch on mount. Inlined (rather than calling refreshServer) so the
    // setState sits behind an await — the "sync setState in an effect" the lint rule
    // guards against never happens.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/buyer-tour/tours");
        if (!res.ok) return;
        const json = (await res.json()) as
          | { ok: true; tours: ServerTour[] }
          | { ok: false };
        if (!cancelled && json.ok) setServerTours(json.tours);
      } catch {
        /* offline / transient — the local list still shows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the in-progress draft (mint-on-first-content, then update in place).
  const persist = useCallback(
    (state: BuyerTourBuilderState) => {
      const draftToSave = foldAnchor(state);
      const id = instanceIdRef.current;
      if (id) {
        const existing = loadInstance<BuyerTourDraft>(id);
        if (existing) {
          saveInstance<BuyerTourDraft>({
            ...existing,
            draft: draftToSave,
            publishedSlug: state.publishedSlug ?? existing.publishedSlug,
          });
        }
        return;
      }
      if (!hasContent(state)) return; // don't mint an empty draft
      const created = createInstance<BuyerTourDraft>({
        skillId: SKILL_ID,
        draft: draftToSave,
        ownerEmail: ownerEmail ?? undefined,
      });
      instanceIdRef.current = created.instanceId;
      refreshLocal();
    },
    [ownerEmail, refreshLocal],
  );

  // Publish transition: stamp the slug onto the instance + refresh the tour list.
  const handlePublished = useCallback(
    (state: BuyerTourBuilderState) => {
      const slug = state.publishedSlug;
      if (!slug || slug === lastPublishedSlugRef.current) return;
      lastPublishedSlugRef.current = slug;
      // Ensure the draft is persisted so there is an instance to stamp.
      persist(state);
      if (instanceIdRef.current) {
        markPublished<BuyerTourDraft>(instanceIdRef.current, slug);
      }
      refreshLocal();
      void refreshServer();
    },
    [persist, refreshLocal, refreshServer],
  );

  const onStateChange = useCallback(
    (state: BuyerTourBuilderState) => {
      // Live preview — debounced so keystrokes never block on a re-render.
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(
        () => setPreviewState(state),
        PREVIEW_DEBOUNCE_MS,
      );
      // Autosave — debounced independently (longer).
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(state), SAVE_DEBOUNCE_MS);
      // Publish is prompt (not debounced) so the list + slug bookkeeping is immediate.
      if (
        state.publishedSlug &&
        state.publishedSlug !== lastPublishedSlugRef.current
      ) {
        handlePublished(state);
      }
    },
    [persist, handlePublished],
  );

  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const openSession = useCallback((next: Session) => {
    instanceIdRef.current = next.instanceId;
    lastPublishedSlugRef.current = next.initialSlug;
    setSession(next);
    setPreviewState(stateFromSession(next));
    setListOpen(false);
    setMobilePreviewOpen(false);
  }, []);

  const openNew = useCallback(() => {
    openSession(freshSession(session.key + 1));
  }, [openSession, session.key]);

  const openLocal = useCallback(
    (instanceId: string) => {
      const inst = loadInstance<BuyerTourDraft>(instanceId);
      if (inst) openSession(sessionFromInstance(inst, session.key + 1));
    },
    [openSession, session.key],
  );

  // Reopen a PUBLISHED tour that has no local draft: reconstruct an editable draft
  // from its public payload so it can be edited + re-published in place.
  const openPublished = useCallback(
    async (slug: string) => {
      try {
        const res = await fetch(
          `/api/buyer-tour/tours?slug=${encodeURIComponent(slug)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as
          | { ok: true; slug: string; payload: BuyerTourPublicPayload }
          | { ok: false };
        if (!json.ok) return;
        const draft = draftFromPublicPayload(json.payload);
        openSession({
          key: session.key + 1,
          instanceId: null,
          initialDraft: draft,
          initialAnchor: anchorFromDraft(draft),
          initialSlug: slug,
        });
      } catch {
        /* transient — leave the current session intact */
      }
    },
    [openSession, session.key],
  );

  // Merge local drafts + published tours into one card list (local wins on slug).
  const cards = useMemo<TourCard[]>(() => {
    const localSlugs = new Set(
      localInstances.map((i) => i.publishedSlug).filter(Boolean) as string[],
    );
    const localCards: TourCard[] = localInstances.map((i) => ({
      key: `local:${i.instanceId}`,
      label: i.draft.buyerName?.trim() || "Untitled tour",
      detail: `${i.draft.homes.length} home${
        i.draft.homes.length === 1 ? "" : "s"
      }${i.publishedSlug ? " · live" : " · draft"}`,
      updatedAt: i.timestamps.updatedAt,
      live: !!i.publishedSlug,
      instanceId: i.instanceId,
      slug: i.publishedSlug,
    }));
    const publishedOnly: TourCard[] = serverTours
      .filter((t) => !localSlugs.has(t.slug))
      .map((t) => ({
        key: `pub:${t.slug}`,
        label: t.buyerName?.trim() || "Untitled tour",
        detail: `${t.homeCount} home${t.homeCount === 1 ? "" : "s"} · live`,
        updatedAt: t.updatedAt,
        live: true,
        slug: t.slug,
      }));
    return [...localCards, ...publishedOnly].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [localInstances, serverTours]);

  const preview = (
    <BuyerTourPreview
      draft={previewState.draft}
      anchorLabel={previewState.anchorLabel}
      anchorAddress={previewState.anchorAddress}
      agent={agent}
      brandAccent={brandAccent}
      v1={previewV1}
      schoolLayerAvailable={schoolLayerAvailable}
    />
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        {/* ---- Workspace header: tour library + new tour ---- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                refreshLocal();
                void refreshServer();
                setListOpen((v) => !v);
              }}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              data-testid="btw-tours-toggle"
              aria-expanded={listOpen}
            >
              Your buyer tours{cards.length ? ` (${cards.length})` : ""}
            </button>
            <button
              type="button"
              onClick={openNew}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              data-testid="btw-new-tour"
            >
              + New tour
            </button>
          </div>
          <span className="text-xs text-neutral-500">
            Autosaves as you go · live preview
          </span>
        </div>

        {/* ---- Tour library (collapsible) ---- */}
        {listOpen && (
          <div
            className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4"
            data-testid="btw-tours-list"
          >
            {cards.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No tours yet. Start one below — it saves automatically.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {cards.map((c) => (
                  <li
                    key={c.key}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-100">
                        {c.label}
                      </p>
                      <p className="text-xs text-neutral-500">{c.detail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.slug && (
                        <a
                          href={`/tour/${c.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                        >
                          View live
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          c.instanceId
                            ? openLocal(c.instanceId)
                            : c.slug
                              ? void openPublished(c.slug)
                              : undefined
                        }
                        className="rounded border border-teal-400/60 bg-teal-400/10 px-2.5 py-1 text-xs font-medium text-teal-100 hover:bg-teal-400/20"
                        data-testid="btw-tour-open"
                      >
                        Open
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---- Side-by-side: form (left) + live preview (right, desktop) ---- */}
        <div className="mt-4 lg:grid lg:grid-cols-2 lg:gap-6">
          <div>
            <BuyerTourBuilder
              key={session.key}
              embedded
              initialDraft={session.initialDraft}
              initialAnchor={session.initialAnchor}
              initialSlug={session.initialSlug}
              onStateChange={onStateChange}
              formatNumbers
              softWhy
              schoolLayerAvailable={schoolLayerAvailable}
              analyticsAvailable={analyticsAvailable}
            />
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                Live preview — what your buyer sees
              </p>
              <div className="overflow-hidden rounded-2xl border border-neutral-800">
                <div
                  className="max-h-[calc(100vh-9rem)] overflow-y-auto bg-white"
                  data-testid="btw-preview-desktop"
                >
                  {preview}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Mobile: Preview button + full-screen overlay ---- */}
      <button
        type="button"
        onClick={() => setMobilePreviewOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-lg lg:hidden"
        data-testid="btw-preview-open-mobile"
      >
        Preview
      </button>
      {mobilePreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden"
          data-testid="btw-preview-mobile"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-950 px-4 py-3">
            <span className="text-sm font-medium text-neutral-100">
              Preview
            </span>
            <button
              type="button"
              onClick={() => setMobilePreviewOpen(false)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200"
              data-testid="btw-preview-close-mobile"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{preview}</div>
        </div>
      )}
    </main>
  );
}
