"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  cacheInstance,
  createInstance,
  deleteInstance,
  listInstances,
  loadInstance,
  markPublished,
  setInstanceArchived,
} from "@/skills/workflow-instance-storage";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  deleteServerDraft,
  fetchServerDraft,
  fetchServerDrafts,
  putServerDraft,
} from "@/tools/seller-presentation/hooks/server-draft-client";
import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import { DEFAULT_BRAND_THEME_ID, loadBrandSettings } from "@/lib/brand";
import { brandToPublishInputs } from "@/tools/seller-presentation/components/preview/preview-payload";
import {
  buildDuplicateDraft,
  bulkActionValidity,
  filterByTab,
  isAtOrOverLiveCap,
  isCrossDeviceOnly,
  listMetaLine,
  LONG_PRESS_MS,
  mergePages,
  movedBeyond,
  resolveViewMode,
  secondaryRowActions,
  tabCounts,
  VIEW_MODE_STORAGE_KEY,
  type LibraryTab,
  type PageCard,
  type PageStatus,
  type RowAction,
  type ServerPageSummary,
  type ViewMode,
} from "@/lib/seller-presentation/pages-library";
import "./pages-library.css";

/**
 * "Your pages" — the Seller Presentation tool's library landing (SP-LIB).
 *
 * Reuses the home-dashboard card treatment (tile surface / poster / body /
 * status meta) via the scoped `.sep-library` token set in
 * pages-library.css — a literal port of the dashboard's `.tile` rules so
 * the two surfaces read as one product. No new visual language.
 *
 * Data model: the privacy-critical Live/Archived slice comes from the
 * server (`GET /api/seller-presentation/pages`, scoped by session email);
 * Drafts come from localStorage, scoped to the same agent via the
 * instance `ownerEmail`. `mergePages` reconciles them into one ordered
 * list — see src/lib/seller-presentation/pages-library.ts for the rules.
 *
 * v2 (SP-LIB-2) adds organization + management on top of that merged list,
 * all derived by pure helpers (filterByTab / tabCounts / bulkActionValidity
 * / buildDuplicateDraft) so the UI stays a thin shell:
 *   - Active / Archived tabs (archiving moves a card OUT of Active).
 *   - Duplicate on every card → always a fresh, unpublished Draft.
 *   - Delete (confirm-gated) on Draft + Archived; Live must be archived first.
 *   - Select mode + bulk archive/delete with the same validity rules.
 *
 * Animation-ready, NOT pre-animated: every card carries a semantic
 * `data-status`, the grid is a flat list of isolated `.lib-card` units,
 * select/confirm surfaces carry `data-state` hooks, and all motion is CSS
 * hover/transition only. The delight pass layers on later without
 * restructuring this tree.
 */

interface PagesResponse {
  ok: boolean;
  pages?: ServerPageSummary[];
  liveCount?: number;
  cap?: number;
  error?: string;
  code?: string;
}

const STATUS_LABEL: Record<PageStatus, string> = {
  draft: "Draft",
  live: "Live",
  "live-edits-pending": "Live · edits pending",
  archived: "Archived",
};

interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
}

function seedThemeId(): string {
  return loadBrandSettings().defaultThemeId || DEFAULT_BRAND_THEME_ID;
}

function spInstances(): WorkflowInstance<SellerPresentationDraft>[] {
  return listInstances() as WorkflowInstance<SellerPresentationDraft>[];
}

export function PagesLibrary({
  ownerEmail,
  serverDraftsEnabled = false,
}: {
  ownerEmail: string | null;
  /**
   * SP-KEYSTONE — when true the DRAFT slice is sourced from the owner-scoped
   * SERVER store (so a draft created on any device appears + opens here) and
   * draft mutations (new / duplicate / update-live / archive / delete) operate
   * on the server. Default false ⇒ today's localStorage-only behavior.
   */
  serverDraftsEnabled?: boolean;
}) {
  // SP-KEYSTONE — the server's draft instances for this agent (the DRAFT slice
  // when the flag is on). null = not loaded / the fetch failed ⇒ fall back to
  // the localStorage cache so the library never blanks the drafts on a blip.
  const draftInstancesRef = useRef<
    WorkflowInstance<SellerPresentationDraft>[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverPages, setServerPages] = useState<ServerPageSummary[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [cap, setCap] = useState(0);
  const [cards, setCards] = useState<PageCard[]>([]);
  // Per-card in-flight action key (slug or instanceId) so one card's
  // button shows a pending state without freezing the whole grid.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // v2 — organization + management state.
  const [tab, setTab] = useState<LibraryTab>("active");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // v4 — the key of the card whose "created on another device" note is open
  // (SP-LIB-4). At most one at a time; tapping a cross-device page toggles it.
  const [explainKey, setExplainKey] = useState<string | null>(null);

  // v3 — Cards / List view (SP-LIB-3). Initialize to a STABLE constant so the
  // server and first client render agree (this repo has been bitten by SSR
  // hydration mismatches). The real choice — a saved preference, else the
  // viewport default — is read + applied in the effect below, after mount.
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  // Client-only "now" for the List rows' relative-time meta ("Started 2 days
  // ago"). Snapshotted in the mount effect (not read during render) so the
  // server and first client render agree and render stays pure.
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    } catch {
      // storage disabled / private mode — fall through to the viewport default
    }
    setViewMode(resolveViewMode(saved, window.innerWidth));
    setNowMs(Date.now());
  }, []);

  function chooseView(next: ViewMode) {
    setViewMode(next);
    // Persist the explicit choice so it wins over the viewport default next time.
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
      // ignore quota / storage-disabled
    }
  }

  // The DRAFT slice feeding mergePages. Server-sourced when the flag is on
  // (cross-device); else the localStorage cache. On a failed server fetch the
  // ref is null and we fall back to the cache so drafts never vanish.
  const draftSlice = useCallback((): WorkflowInstance<SellerPresentationDraft>[] => {
    if (serverDraftsEnabled) return draftInstancesRef.current ?? spInstances();
    return spInstances();
  }, [serverDraftsEnabled]);

  const rebuildCards = useCallback(
    (pages: ServerPageSummary[]) => {
      setCards(
        mergePages({
          serverPages: pages,
          instances: draftSlice(),
          sessionEmail: ownerEmail,
        }),
      );
    },
    [ownerEmail, draftSlice],
  );

  // SP-KEYSTONE — refresh the server draft slice. Mirrors each server record
  // into the localStorage cache (offline fallback) and stores it in the ref.
  // On failure leaves the ref null so `draftSlice` falls back to the cache.
  const refreshServerDrafts = useCallback(async () => {
    if (!serverDraftsEnabled) return;
    const drafts = await fetchServerDrafts();
    if (drafts) {
      for (const d of drafts) cacheInstance(d);
      draftInstancesRef.current = drafts;
    } else {
      draftInstancesRef.current = null;
    }
  }, [serverDraftsEnabled]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Pull the server draft slice first (when on) so the cards built below
      // reconcile the freshest cross-device drafts with the published pages.
      await refreshServerDrafts();
      const res = await fetch("/api/seller-presentation/pages", {
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => ({}))) as PagesResponse;
      if (!res.ok || !body.ok) {
        setLoadError(body.error ?? `Could not load your pages (${res.status})`);
        // Still show drafts even if the published slice failed.
        setServerPages([]);
        rebuildCards([]);
        return;
      }
      const pages = body.pages ?? [];
      setServerPages(pages);
      setLiveCount(body.liveCount ?? 0);
      setCap(body.cap ?? 0);
      rebuildCards(pages);
    } catch {
      setLoadError("Could not reach the server. Showing local drafts only.");
      setServerPages([]);
      rebuildCards([]);
    } finally {
      setLoading(false);
    }
  }, [rebuildCards, refreshServerDrafts]);

  useEffect(() => {
    load();
  }, [load]);

  const atLimit = useMemo(
    () => cap > 0 && isAtOrOverLiveCap(liveCount, cap),
    [liveCount, cap],
  );

  const counts = useMemo(() => tabCounts(cards), [cards]);
  const visibleCards = useMemo(() => filterByTab(cards, tab), [cards, tab]);
  const selectedCards = useMemo(
    () => visibleCards.filter((c) => selected.has(c.key)),
    [visibleCards, selected],
  );
  const validity = useMemo(
    () => bulkActionValidity(selectedCards),
    [selectedCards],
  );

  function switchTab(next: LibraryTab) {
    if (next === tab) return;
    setTab(next);
    // Selection is per-view; a tab switch always clears it (packet).
    setSelected(new Set());
    setExplainKey(null);
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Long-press entry (SP-LIB-4): enter select mode AND select the pressed item
  // in one motion, from either layout. Any open cross-device note is dismissed
  // so the surfaces never stack.
  function beginSelectFrom(key: string) {
    setExplainKey(null);
    setSelectMode(true);
    setSelected(new Set([key]));
  }

  // Toggle the cross-device explanation for a card (tapping its disabled primary
  // a second time closes it). Only one note is ever open.
  function toggleExplain(key: string) {
    setExplainKey((k) => (k === key ? null : key));
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function goToInstance(instanceId: string) {
    window.location.assign(`/seller-presentation?id=${instanceId}`);
  }

  async function newPage() {
    const created = createInstance<SellerPresentationDraft>({
      skillId: "seller-presentation",
      draft: { ...EMPTY_DRAFT, themeId: seedThemeId() },
      currentStep: "property",
      ownerEmail: ownerEmail ?? undefined,
    });
    // SP-KEYSTONE — push the fresh draft to the server before navigating so it
    // is openable from any device immediately (not only after the first edit).
    // A failed push is non-fatal: the wizard pushes again on first autosave.
    if (serverDraftsEnabled) await putServerDraft(created);
    goToInstance(created.instanceId);
  }

  async function duplicate(card: PageCard) {
    if (!card.instanceId) return;
    setActionError(null);
    setBusyKey(card.key);
    try {
      // SP-KEYSTONE — the source draft may live only on the server (it was
      // built on another device), so fetch it from there first; the local
      // cache is the offline fallback.
      let source = serverDraftsEnabled
        ? await fetchServerDraft(card.instanceId)
        : null;
      if (!source) source = loadInstance<SellerPresentationDraft>(card.instanceId);
      if (!source) {
        setActionError("That draft could not be loaded.");
        return;
      }
      // Deep-clone + rename via the pure helper. A duplicate is ALWAYS a fresh
      // Draft: createInstance never sets publishedSlug/publishedAt, so the copy
      // has no live link and the original's published page is untouched.
      const clonedDraft = buildDuplicateDraft(source.draft);
      const copy = createInstance<SellerPresentationDraft>({
        skillId: "seller-presentation",
        draft: clonedDraft,
        currentStep: "property",
        ownerEmail: ownerEmail ?? undefined,
      });
      if (serverDraftsEnabled) {
        await putServerDraft(copy);
        await refreshServerDrafts();
      }
      // Stay in the library and surface the new Draft (it lives in Active).
      setTab("active");
      rebuildCards(serverPages);
    } finally {
      setBusyKey(null);
    }
  }

  async function copyLink(card: PageCard) {
    if (!card.publicUrl) return;
    const url = `${window.location.origin}${card.publicUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(card.key);
      window.setTimeout(
        () => setCopiedKey((k) => (k === card.key ? null : k)),
        1800,
      );
    } catch {
      setActionError("Could not copy the link.");
    }
  }

  function viewLive(card: PageCard) {
    if (!card.publicUrl) return;
    window.open(card.publicUrl, "_blank", "noopener,noreferrer");
  }

  // ── single-card primitives (return success; no reload — caller reloads) ──

  async function archiveOne(card: PageCard, archived: boolean): Promise<boolean> {
    if (card.slug) {
      // Published page: server-side archive/restore (frees / uses a slot).
      const res = await fetch("/api/seller-presentation/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: card.slug,
          action: archived ? "archive" : "restore",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setActionError(body.error ?? "Archive failed.");
        return false;
      }
      return true;
    }
    if (card.instanceId) {
      // Draft archive/restore. SP-KEYSTONE — when server drafts are on, flip
      // the flag on the SERVER record (so it reflects cross-device); the local
      // cache mirrors it. The flag does NOT bump updatedAt (mirror of
      // setInstanceArchived) so an archive never trips edits-pending.
      if (serverDraftsEnabled) {
        const inst =
          (await fetchServerDraft(card.instanceId)) ??
          loadInstance<SellerPresentationDraft>(card.instanceId);
        if (!inst) {
          setActionError("That draft could not be loaded.");
          return false;
        }
        const next: WorkflowInstance<SellerPresentationDraft> = {
          ...inst,
          archivedAt: archived ? new Date().toISOString() : undefined,
        };
        const res = await putServerDraft(next);
        cacheInstance(res.ok && res.instance ? res.instance : next);
        if (!res.ok) {
          setActionError("Archive failed.");
          return false;
        }
        return true;
      }
      // Local draft: flip the instance's local archive flag.
      setInstanceArchived(card.instanceId, archived);
      return true;
    }
    return false;
  }

  async function deleteOne(card: PageCard): Promise<boolean> {
    if (card.slug) {
      // Published/archived page: purge the server record (owner-checked,
      // live-blocked server-side as a second gate).
      const res = await fetch("/api/seller-presentation/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: card.slug }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setActionError(body.error ?? "Delete failed.");
        return false;
      }
    }
    if (card.instanceId) {
      // SP-KEYSTONE — purge the SERVER draft too (owner-checked), then clear
      // the local cache copy. A failed server delete is surfaced so the agent
      // never thinks a draft is gone when it still exists on the server.
      if (serverDraftsEnabled) {
        const ok = await deleteServerDraft(card.instanceId);
        if (!ok) {
          setActionError("Delete failed.");
          return false;
        }
      }
      deleteInstance(card.instanceId);
    }
    return true;
  }

  // ── single-card actions ──

  async function setArchived(card: PageCard, archived: boolean) {
    setActionError(null);
    setBusyKey(card.key);
    try {
      const ok = await archiveOne(card, archived);
      if (ok) await load();
    } catch {
      setActionError("Archive failed. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  function requestDelete(card: PageCard) {
    setConfirm({
      title: "Delete this page?",
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setActionError(null);
        setBusyKey(card.key);
        try {
          const ok = await deleteOne(card);
          if (ok) await load();
        } catch {
          setActionError("Delete failed. Please try again.");
        } finally {
          setBusyKey(null);
        }
      },
    });
  }

  async function updateLive(card: PageCard) {
    if (!card.instanceId || !card.slug) return;
    setActionError(null);
    setBusyKey(card.key);
    try {
      // SP-KEYSTONE — the working draft may live only on the server (built /
      // edited on another device), which is exactly what makes "Update live
      // page" work cross-device. Fetch from the server first; fall back to the
      // local cache offline.
      const instance =
        (serverDraftsEnabled
          ? await fetchServerDraft(card.instanceId)
          : null) ?? loadInstance<SellerPresentationDraft>(card.instanceId);
      if (!instance) {
        setActionError("That draft could not be loaded.");
        return;
      }
      const { agentContact, brandReviews, brandColors, brandWhyUs } =
        brandToPublishInputs(loadBrandSettings());
      const res = await fetch("/api/seller-presentation/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: instance.draft,
          agentContact,
          brandReviews,
          brandColors,
          brandWhyUs,
          slug: card.slug, // re-publish into the SAME page (stable link)
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        slug?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.slug) {
        setActionError(body.error ?? "Update failed.");
        return;
      }
      // Reset publishedAt so the card drops back to plain "Live".
      // markPublished returns the stamped instance; persist it server-side so
      // the Live/edits-pending state is correct on every device (not just this
      // one). It bumps from the local cache copy; mirror the freshest draft
      // first so the stamp lands on the right content.
      cacheInstance(instance);
      const stamped = markPublished<SellerPresentationDraft>(
        card.instanceId,
        body.slug,
      );
      if (serverDraftsEnabled && stamped) await putServerDraft(stamped);
      await load();
    } catch {
      setActionError("Update failed. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  // ── bulk actions (one confirm for the whole selection) ──

  async function runBulk(
    targets: PageCard[],
    op: (card: PageCard) => Promise<boolean>,
  ) {
    setActionError(null);
    setBulkBusy(true);
    let failures = 0;
    try {
      for (const card of targets) {
        // setActionError inside op already surfaces the last failure reason.
        const ok = await op(card);
        if (!ok) failures += 1;
      }
      await load();
      if (failures === 0) exitSelect();
    } catch {
      setActionError("Some pages could not be updated. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  function requestBulkArchive() {
    if (!validity.canArchive || selectedCards.length === 0) return;
    const targets = [...selectedCards];
    const n = targets.length;
    setConfirm({
      title: `Archive ${n} ${n === 1 ? "page" : "pages"}?`,
      body: "Archived pages go offline and free a slot. You can restore them anytime.",
      confirmLabel: "Archive",
      onConfirm: () => runBulk(targets, (c) => archiveOne(c, true)),
    });
  }

  function requestBulkDelete() {
    if (!validity.canDelete || selectedCards.length === 0) return;
    const targets = [...selectedCards];
    const n = targets.length;
    setConfirm({
      title: `Delete ${n} ${n === 1 ? "page" : "pages"}?`,
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => runBulk(targets, (c) => deleteOne(c)),
    });
  }

  const anyAction = busyKey !== null || bulkBusy;

  // One wiring, two layouts: Cards and List render from the SAME prop bundle so
  // a row can never drift from a card (identical handlers, identical validity).
  function rowProps(card: PageCard): PageItemProps {
    return {
      card,
      nowMs,
      serverDraftsEnabled,
      busy: busyKey === card.key || bulkBusy,
      copied: copiedKey === card.key,
      selectMode,
      checked: selected.has(card.key),
      explainOpen: explainKey === card.key,
      onToggleSelect: () => toggleSelected(card.key),
      onLongPressSelect: () => beginSelectFrom(card.key),
      onExplain: () => toggleExplain(card.key),
      onContinue: () => card.instanceId && goToInstance(card.instanceId),
      onUpdateLive: () => updateLive(card),
      onViewLive: () => viewLive(card),
      onCopyLink: () => copyLink(card),
      onArchive: () => setArchived(card, true),
      onRestore: () => setArchived(card, false),
      onDuplicate: () => duplicate(card),
      onDelete: () => requestDelete(card),
    };
  }

  return (
    <div className="sep-library" data-testid="seller-pages-library">
      <div className="lib-shell">
        <header className="lib-head">
          <a href="/dashboard" className="lib-back">
            ← Dashboard
          </a>
          <div className="lib-head-row">
            <div className="lib-head-titles">
              <div className="lib-eyebrow">
                <span className="lib-eyebrow-dot" />
                SEP Studio
              </div>
              <h1 className="lib-title">Your pages</h1>
              <p className="lib-subtitle">
                Every seller page you have built, in one place.
              </p>
            </div>
            <div className="lib-head-actions">
              {cap > 0 && (
                <span
                  className="lib-meter"
                  data-at-limit={atLimit ? "true" : undefined}
                  data-testid="lib-usage-meter"
                  title="Only live pages count toward your limit. Drafts and archived pages are free."
                >
                  {liveCount} of {cap} live
                </span>
              )}
              <button
                type="button"
                className="lib-newbtn"
                onClick={newPage}
                data-testid="lib-new-page"
              >
                + New page
              </button>
            </div>
          </div>
        </header>

        {atLimit && (
          <div className="lib-banner" role="status" data-testid="lib-at-limit">
            All {cap} pages are live. Archive a closed listing to free a slot,
            or add room when you are ready. You can still create and publish in
            the meantime.
          </div>
        )}

        {actionError && (
          <div className="lib-banner lib-banner-warn" role="alert">
            {actionError}
          </div>
        )}
        {loadError && (
          <div className="lib-banner lib-banner-warn" role="alert">
            {loadError}
          </div>
        )}

        {/* tabs + select toggle */}
        <div className="lib-toolbar">
          <div
            className="lib-tabs"
            role="tablist"
            aria-label="Filter pages"
            data-testid="lib-tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "active"}
              className="lib-tab"
              data-active={tab === "active" ? "true" : undefined}
              onClick={() => switchTab("active")}
              data-testid="lib-tab-active"
            >
              Active <span className="lib-tab-count">{counts.active}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "archived"}
              className="lib-tab"
              data-active={tab === "archived" ? "true" : undefined}
              onClick={() => switchTab("archived")}
              data-testid="lib-tab-archived"
            >
              Archived <span className="lib-tab-count">{counts.archived}</span>
            </button>
          </div>

          <div className="lib-toolbar-right">
            <div
              className="lib-viewtoggle"
              role="group"
              aria-label="Choose layout"
              data-testid="lib-view-toggle"
            >
              <button
                type="button"
                className="lib-tab lib-viewbtn"
                aria-pressed={viewMode === "cards"}
                data-active={viewMode === "cards" ? "true" : undefined}
                onClick={() => chooseView("cards")}
                data-testid="lib-view-cards"
              >
                Cards
              </button>
              <button
                type="button"
                className="lib-tab lib-viewbtn"
                aria-pressed={viewMode === "list"}
                data-active={viewMode === "list" ? "true" : undefined}
                onClick={() => chooseView("list")}
                data-testid="lib-view-list"
              >
                List
              </button>
            </div>

            {!loading && cards.length > 0 && (
              <button
                type="button"
                className="lib-btn lib-select-toggle"
                data-active={selectMode ? "true" : undefined}
                onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                data-testid="lib-select-toggle"
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="lib-loading" data-testid="lib-loading">
            Loading your pages…
          </div>
        ) : cards.length === 0 ? (
          <EmptyState onCreate={newPage} />
        ) : visibleCards.length === 0 ? (
          <TabEmpty tab={tab} />
        ) : viewMode === "list" ? (
          <div className="lib-list" data-testid="lib-list">
            {visibleCards.map((card) => (
              <PageRowView key={card.key} {...rowProps(card)} />
            ))}
          </div>
        ) : (
          <div className="lib-grid" data-testid="lib-grid">
            {visibleCards.map((card) => (
              <PageCardView key={card.key} {...rowProps(card)} />
            ))}
          </div>
        )}
      </div>

      {/* bulk action bar (select mode) */}
      {selectMode && (
        <div className="lib-bulkbar" role="region" aria-label="Bulk actions" data-testid="lib-bulkbar">
          <span className="lib-bulk-count" data-testid="lib-bulk-count">
            {selectedCards.length > 0 ? (
              `${selectedCards.length} selected`
            ) : (
              <span className="lib-bulk-hint">Tap pages to select</span>
            )}
          </span>
          <div className="lib-bulk-actions">
            <button
              type="button"
              className="lib-btn"
              disabled={!validity.canArchive || bulkBusy}
              title={validity.archiveReason}
              onClick={requestBulkArchive}
              data-testid="lib-bulk-archive"
            >
              Archive
            </button>
            <button
              type="button"
              className="lib-btn lib-btn-danger"
              disabled={!validity.canDelete || bulkBusy}
              title={validity.deleteReason}
              onClick={requestBulkDelete}
              data-testid="lib-bulk-delete"
            >
              Delete
            </button>
            <button
              type="button"
              className="lib-btn lib-btn-quiet"
              onClick={exitSelect}
              disabled={bulkBusy}
              data-testid="lib-bulk-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* confirm dialog (delete + bulk) */}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          busy={anyAction}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const run = confirm.onConfirm;
            setConfirm(null);
            await run();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="lib-empty" data-testid="lib-empty">
      <div className="lib-empty-art" aria-hidden="true">
        ◆
      </div>
      <h2 className="lib-empty-title">Build your first seller page</h2>
      <p className="lib-empty-body">
        A premium, shareable page for your next listing appointment: the comps,
        your pricing story, and your pitch, all in your brand. It takes a few
        minutes.
      </p>
      <button
        type="button"
        className="lib-newbtn lib-empty-cta"
        onClick={onCreate}
        data-testid="lib-empty-create"
      >
        + New page
      </button>
    </div>
  );
}

function TabEmpty({ tab }: { tab: LibraryTab }) {
  return (
    <div className="lib-tabempty" data-testid="lib-tabempty">
      {tab === "active"
        ? "No active pages. Create a new page, or restore one from Archived."
        : "No archived pages. Archive a closed listing to free a slot."}
    </div>
  );
}

function ConfirmDialog({
  state,
  busy,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="lib-confirm-overlay"
      data-state="open"
      role="dialog"
      aria-modal="true"
      aria-label={state.title}
      data-testid="lib-confirm"
      onClick={onCancel}
    >
      <div
        className="lib-confirm"
        data-danger={state.danger ? "true" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="lib-confirm-title">{state.title}</h3>
        <p className="lib-confirm-body">{state.body}</p>
        <div className="lib-confirm-actions">
          <button
            type="button"
            className="lib-btn lib-btn-quiet"
            onClick={onCancel}
            disabled={busy}
            data-testid="lib-confirm-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className={
              state.danger ? "lib-btn lib-btn-danger-solid" : "lib-btn lib-btn-primary"
            }
            onClick={onConfirm}
            disabled={busy}
            data-testid="lib-confirm-go"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The shared per-item wiring. Cards and List rows both render from this exact
 * bundle (see `rowProps`) so the two layouts can never enforce different action
 * rules — there is one set of handlers, projected two ways.
 */
interface PageItemProps {
  card: PageCard;
  /** Client snapshot of Date.now() for relative-time meta (List rows only). */
  nowMs: number;
  /** SP-KEYSTONE — server drafts on ⇒ the cross-device note copy is honest. */
  serverDraftsEnabled: boolean;
  busy: boolean;
  copied: boolean;
  selectMode: boolean;
  checked: boolean;
  /** Is this card's "created on another device" note currently open? */
  explainOpen: boolean;
  onToggleSelect: () => void;
  /** Long-press → enter select mode AND select this item (both layouts). */
  onLongPressSelect: () => void;
  /** Tap on a cross-device-only page's primary → toggle its explanation. */
  onExplain: () => void;
  onContinue: () => void;
  onUpdateLive: () => void;
  onViewLive: () => void;
  onCopyLink: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * The select-mode checkmark. A rendered SVG (the same stroked check the comps
 * step uses) shown inside a filled box, driven directly by the item's selected
 * state — NOT a CSS `input:checked` sibling rule, which only ever reached the
 * Cards checkbox and left every List-row box stuck empty.
 */
function CheckGlyph() {
  return (
    <svg
      className="lib-check-glyph"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * Quiet haptic on long-press where the platform supports it. Android fires a
 * short buzz; iOS Safari has no Vibration API, so this is a guarded no-op there
 * (the visual lift into select mode is the feedback on iPhone). Never throws.
 */
function tryVibrate(ms: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(ms);
  } catch {
    // some browsers throw if called outside a user gesture — ignore
  }
}

interface LongPressApi {
  handlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
  /**
   * Call at the top of the trailing onClick: if a long-press just fired, the
   * click is its synthetic tail and must be swallowed (returns true, once).
   */
  consumeIfFired: () => boolean;
}

/**
 * Long-press-to-select (SP-LIB-4). After LONG_PRESS_MS of a stationary touch,
 * fire `onLongPress` (+ a guarded haptic). A drag past LONG_PRESS_MOVE_CANCEL_PX
 * cancels it so scrolling never trips select mode; a quick tap leaves it unfired
 * so the normal click (primary action) runs. Mouse is excluded — desktop uses
 * the explicit Select button — so this is purely a touch/pen affordance.
 *
 * Animation-ready, not pre-animated: this only flips state; the lift is CSS that
 * keys off `data-checked` later.
 */
function useLongPress(
  onLongPress: () => void,
  enabled: boolean,
): LongPressApi {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  // Tidy any pending timer if the item unmounts mid-press.
  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // Any fresh press clears a stale "fired" flag (e.g. a long-press whose
      // synthetic click never landed because the DOM changed under it), so the
      // next real tap is never wrongly swallowed.
      firedRef.current = false;
      if (!enabled) return;
      // Mouse has the Select button; reserve long-press for touch/pen.
      if (e.pointerType === "mouse") return;
      // A press that begins on a discrete control (the ⋯ menu, the card's
      // action buttons, the checkbox) is that control's press, not the item's.
      if ((e.target as HTMLElement).closest("[data-no-longpress]")) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        firedRef.current = true;
        tryVibrate(15);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [enabled, onLongPress],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (movedBeyond(start.x, start.y, e.clientX, e.clientY)) {
      // a scroll/drag — not a press; cancel without firing
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startRef.current = null;
    }
  }, []);

  const consumeIfFired = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clearTimer,
      onPointerLeave: clearTimer,
      onPointerCancel: clearTimer,
    },
    consumeIfFired,
  };
}

/**
 * The calm "created on another device" note (SP-LIB-4). Shown when a page's
 * primary tap has nowhere to go because it was published from another device
 * (no local draft to resume). Explains the limit and, when asked, surfaces the
 * actions that DO work; the card already shows those buttons, so it passes
 * `withActions={false}`, while the List row (whose actions hide in the menu)
 * passes `true`.
 */
function ExplainNote({
  copied,
  withActions,
  serverDraftsEnabled,
  onViewLive,
  onCopyLink,
}: {
  copied: boolean;
  withActions: boolean;
  /** When server drafts are on, this published page simply has no saved draft. */
  serverDraftsEnabled: boolean;
  onViewLive: () => void;
  onCopyLink: () => void;
}) {
  return (
    <div
      className="lib-explain"
      data-state="open"
      data-no-longpress="true"
      data-testid="lib-explain"
    >
      <p className="lib-explain-text">
        {serverDraftsEnabled
          ? "This published page has no saved draft to edit. You can still view it or copy its link."
          : "This page was created on another device. Editing from any device is coming soon."}
      </p>
      {withActions && (
        <div className="lib-explain-actions">
          <button
            type="button"
            className="lib-btn"
            onClick={onViewLive}
            data-testid="lib-explain-view"
          >
            View live page
          </button>
          <button
            type="button"
            className="lib-btn"
            onClick={onCopyLink}
            data-testid="lib-explain-copy"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}

function PageCardView({
  card,
  serverDraftsEnabled,
  busy,
  copied,
  selectMode,
  checked,
  explainOpen,
  onToggleSelect,
  onLongPressSelect,
  onExplain,
  onContinue,
  onUpdateLive,
  onViewLive,
  onCopyLink,
  onArchive,
  onRestore,
  onDuplicate,
  onDelete,
}: PageItemProps) {
  const isArchived = card.status === "archived";
  const isLive = card.status === "live" || card.status === "live-edits-pending";
  const isDraft = card.status === "draft";
  const isPending = card.status === "live-edits-pending";
  const canResume = !!card.instanceId;
  // Delete is valid on Draft + Archived only (never Live) — same rule the
  // bulk path enforces. A published archived card carries a slug + maybe an
  // instance; a draft (archived or not) carries only an instance.
  const canDelete = isDraft || isArchived;
  // A page published from another device has no local draft to resume, so its
  // primary (Open) is disabled. Tapping the card explains that instead of a
  // silent no-op (SP-LIB-4).
  const crossDevice = isCrossDeviceOnly(card);

  // Primary action by status (packet): Draft → Continue, Live → Open,
  // Archived → Restore.
  const primary = isArchived
    ? { label: busy ? "Restoring…" : "Restore", onClick: onRestore }
    : isDraft
      ? { label: "Continue", onClick: onContinue }
      : { label: "Open", onClick: onContinue };
  const primaryDisabled = busy || (primary.label !== "Restore" && !canResume);

  const longPress = useLongPress(onLongPressSelect, !selectMode);

  // The whole card is the primary tap target (packet). Inner controls
  // (buttons / the checkbox) self-handle, so a click that bubbled up from one
  // is ignored here; a long-press just fired swallows its trailing click.
  function onCardClick(e: ReactMouseEvent) {
    if (longPress.consumeIfFired()) return;
    if ((e.target as HTMLElement).closest("button, a, label, input")) return;
    if (selectMode) {
      onToggleSelect();
      return;
    }
    if (busy) return;
    if (crossDevice) {
      onExplain();
      return;
    }
    if (!primaryDisabled) primary.onClick();
  }

  return (
    <article
      className="lib-card"
      data-status={card.status}
      data-testid="lib-card"
      data-slug={card.slug}
      data-selectable={selectMode ? "true" : undefined}
      data-checked={selectMode && checked ? "true" : undefined}
      data-cross-device={crossDevice ? "true" : undefined}
      onClick={onCardClick}
      {...longPress.handlers}
    >
      {selectMode && (
        <label
          className="lib-check"
          data-no-longpress="true"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleSelect}
            aria-label={`Select ${card.propertyLine}`}
            data-testid="lib-card-check"
          />
          <span
            className="lib-check-box"
            data-checked={checked ? "true" : undefined}
            aria-hidden="true"
          >
            {checked && <CheckGlyph />}
          </span>
        </label>
      )}

      <div className="lib-poster">
        {card.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lib-poster-img" src={card.cover} alt="" />
        ) : (
          <div className="lib-poster-empty" aria-hidden="true">
            <span>◇</span>
          </div>
        )}
        <span className="lib-chip" data-status={card.status}>
          {STATUS_LABEL[card.status]}
        </span>
      </div>

      <div className="lib-body">
        <h3 className="lib-card-title">{card.propertyLine}</h3>
        {card.sellerLine && <p className="lib-card-sub">{card.sellerLine}</p>}
        {typeof card.viewCount === "number" && (
          <p className="lib-card-views">{card.viewCount} views</p>
        )}

        {isPending && (
          <p className="lib-pending-note">
            Your seller still sees the last published version. Update the live
            page to push your edits.
          </p>
        )}

        {!selectMode && explainOpen && crossDevice && (
          <ExplainNote
            copied={copied}
            withActions={false}
            serverDraftsEnabled={serverDraftsEnabled}
            onViewLive={onViewLive}
            onCopyLink={onCopyLink}
          />
        )}

        {!selectMode && (
          <div className="lib-actions" data-no-longpress="true">
            <button
              type="button"
              className="lib-btn lib-btn-primary"
              onClick={primary.onClick}
              disabled={primaryDisabled}
              data-testid="lib-action-primary"
            >
              {primary.label}
            </button>

            {isPending && canResume && (
              <button
                type="button"
                className="lib-btn lib-btn-accent"
                onClick={onUpdateLive}
                disabled={busy}
                data-testid="lib-action-update"
              >
                {busy ? "Updating…" : "Update live page"}
              </button>
            )}

            {isLive && (
              <>
                <button
                  type="button"
                  className="lib-btn"
                  onClick={onViewLive}
                  data-testid="lib-action-view"
                >
                  View live page
                </button>
                <button
                  type="button"
                  className="lib-btn"
                  onClick={onCopyLink}
                  data-testid="lib-action-copy"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </>
            )}

            {!isArchived && (
              <button
                type="button"
                className="lib-btn lib-btn-quiet"
                onClick={onArchive}
                disabled={busy}
                data-testid="lib-action-archive"
              >
                Archive
              </button>
            )}

            {canResume && (
              <button
                type="button"
                className="lib-btn lib-btn-quiet"
                onClick={onDuplicate}
                disabled={busy}
                data-testid="lib-action-duplicate"
              >
                Duplicate
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                className="lib-btn lib-btn-danger"
                onClick={onDelete}
                disabled={busy}
                data-testid="lib-action-delete"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The List-view row (SP-LIB-3) — the same card, compacted for scanning many
 * pages on a small screen. It renders from the SAME `PageItemProps` bundle as
 * `PageCardView`, so the behavior can never diverge:
 *   - Tapping the row IS the primary action (Open / Continue / Restore), the
 *     exact `onClick`/disabled rule the card's primary button uses.
 *   - The "⋯" menu holds precisely the card's remaining (secondary) actions,
 *     in the order `secondaryRowActions` derives — never a second rule set.
 *   - Select mode swaps the tap for a checkbox toggle and hides the menu, just
 *     like the card.
 */
function PageRowView({
  card,
  nowMs,
  serverDraftsEnabled,
  busy,
  copied,
  selectMode,
  checked,
  explainOpen,
  onToggleSelect,
  onLongPressSelect,
  onExplain,
  onContinue,
  onUpdateLive,
  onViewLive,
  onCopyLink,
  onArchive,
  onRestore,
  onDuplicate,
  onDelete,
}: PageItemProps) {
  const isArchived = card.status === "archived";
  const canResume = !!card.instanceId;
  // Same primary mapping + disabled rule as the card's primary button: Draft →
  // Continue, Live → Open, Archived → Restore; disabled when busy or (for a
  // non-archived standalone page) there is no local draft to resume.
  const primaryAction = isArchived ? onRestore : onContinue;
  const primaryDisabled = busy || (!isArchived && !canResume);
  // The disabled case that isn't just "busy": a page published from another
  // device. A tap explains that rather than silently no-op-ing (SP-LIB-4).
  const crossDevice = isCrossDeviceOnly(card);
  const actions = secondaryRowActions(card);

  const longPress = useLongPress(onLongPressSelect, !selectMode);

  // The whole row is the tap target (packet). The ⋯ menu + checkbox carry
  // data-no-longpress and sit outside the hit button, so they never reach here.
  function onRowClick() {
    if (longPress.consumeIfFired()) return;
    if (selectMode) {
      onToggleSelect();
      return;
    }
    if (busy) return;
    if (crossDevice) {
      onExplain();
      return;
    }
    if (!primaryDisabled) primaryAction();
  }

  return (
    <div
      className="lib-row"
      data-status={card.status}
      data-testid="lib-row"
      data-slug={card.slug}
      data-selectable={selectMode ? "true" : undefined}
      data-checked={selectMode && checked ? "true" : undefined}
      data-cross-device={crossDevice ? "true" : undefined}
      {...longPress.handlers}
    >
      <div className="lib-row-line">
        {selectMode && (
          <label className="lib-row-check" data-no-longpress="true">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggleSelect}
              aria-label={`Select ${card.propertyLine}`}
              data-testid="lib-row-check"
            />
            <span
              className="lib-check-box"
              data-checked={checked ? "true" : undefined}
              aria-hidden="true"
            >
              {checked && <CheckGlyph />}
            </span>
          </label>
        )}

        <button
          type="button"
          className="lib-row-hit"
          onClick={onRowClick}
          // Enabled even when the primary is cross-device-disabled, so the tap
          // can surface the explanation; a true busy state still blocks it.
          disabled={!selectMode && busy}
          data-disabled={!selectMode && crossDevice ? "true" : undefined}
          aria-label={`${primaryActionLabel(card)} ${card.propertyLine}`}
          data-testid="lib-row-hit"
        >
          <span className="lib-row-thumb" aria-hidden="true">
            {card.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lib-row-thumb-img" src={card.cover} alt="" />
            ) : (
              <span className="lib-row-thumb-empty">◇</span>
            )}
          </span>
          <span className="lib-row-main">
            <span className="lib-row-title">{card.propertyLine}</span>
            <span className="lib-row-meta">{listMetaLine(card, nowMs)}</span>
          </span>
          <span className="lib-chip lib-row-chip" data-status={card.status}>
            {STATUS_LABEL[card.status]}
          </span>
        </button>

        {!selectMode && (
          <RowMenu
            card={card}
            actions={actions}
            busy={busy}
            copied={copied}
            onUpdateLive={onUpdateLive}
            onViewLive={onViewLive}
            onCopyLink={onCopyLink}
            onArchive={onArchive}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )}
      </div>

      {!selectMode && explainOpen && crossDevice && (
        <ExplainNote
          copied={copied}
          withActions
          serverDraftsEnabled={serverDraftsEnabled}
          onViewLive={onViewLive}
          onCopyLink={onCopyLink}
        />
      )}
    </div>
  );
}

/** The verb a row's primary tap performs, for the hit button's accessible name. */
function primaryActionLabel(card: PageCard): string {
  if (card.status === "archived") return "Restore";
  if (card.status === "draft") return "Continue";
  return "Open";
}

const ROW_ACTION_LABEL: Record<RowAction, string> = {
  "update-live": "Update live page",
  "view-live": "View live page",
  "copy-link": "Copy link",
  archive: "Archive",
  duplicate: "Duplicate",
  delete: "Delete",
};

// View + copy are read-only and stay live while a mutating action is in flight,
// exactly as on the card; everything else disables until the action settles.
const ROW_ACTION_BLOCKS_ON_BUSY: Record<RowAction, boolean> = {
  "update-live": true,
  "view-live": false,
  "copy-link": false,
  archive: true,
  duplicate: true,
  delete: true,
};

/**
 * The row's "⋯" overflow menu. Keyboard-accessible (Escape closes and returns
 * focus to the trigger; the first item is focused on open) and CSS-positioned
 * (absolute, never `position: fixed`). It only ever renders the actions
 * `secondaryRowActions` deemed valid, and each item calls the SAME shared
 * handler the card uses.
 */
function RowMenu({
  card,
  actions,
  busy,
  copied,
  onUpdateLive,
  onViewLive,
  onCopyLink,
  onArchive,
  onDuplicate,
  onDelete,
}: {
  card: PageCard;
  actions: RowAction[];
  busy: boolean;
  copied: boolean;
  onUpdateLive: () => void;
  onViewLive: () => void;
  onCopyLink: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handlerFor: Record<RowAction, () => void> = {
    "update-live": onUpdateLive,
    "view-live": onViewLive,
    "copy-link": onCopyLink,
    archive: onArchive,
    duplicate: onDuplicate,
    delete: onDelete,
  };

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    // Move focus into the menu so keyboard users land on an action.
    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="lib-row-menu" ref={wrapRef} data-no-longpress="true">
      <button
        ref={btnRef}
        type="button"
        className="lib-row-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${card.propertyLine}`}
        onClick={() => setOpen((o) => !o)}
        data-testid="lib-row-menu-btn"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="lib-menu" role="menu" ref={menuRef} data-testid="lib-row-menu">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              className={
                action === "delete"
                  ? "lib-menu-item lib-menu-item-danger"
                  : "lib-menu-item"
              }
              disabled={ROW_ACTION_BLOCKS_ON_BUSY[action] && busy}
              onClick={() => run(handlerFor[action])}
              data-testid={`lib-row-action-${action}`}
            >
              {action === "copy-link" && copied ? "Copied" : ROW_ACTION_LABEL[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
