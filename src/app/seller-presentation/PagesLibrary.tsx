"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createInstance,
  deleteInstance,
  listInstances,
  loadInstance,
  markPublished,
  setInstanceArchived,
} from "@/skills/workflow-instance-storage";
import type { WorkflowInstance } from "@/skills/workflow-instance";
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
  mergePages,
  tabCounts,
  type LibraryTab,
  type PageCard,
  type PageStatus,
  type ServerPageSummary,
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

export function PagesLibrary({ ownerEmail }: { ownerEmail: string | null }) {
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

  const rebuildCards = useCallback(
    (pages: ServerPageSummary[]) => {
      setCards(
        mergePages({
          serverPages: pages,
          instances: spInstances(),
          sessionEmail: ownerEmail,
        }),
      );
    },
    [ownerEmail],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/seller-presentation/pages", {
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => ({}))) as PagesResponse;
      if (!res.ok || !body.ok) {
        setLoadError(body.error ?? `Could not load your pages (${res.status})`);
        // Still show local drafts even if the server slice failed.
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
  }, [rebuildCards]);

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
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
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

  function newPage() {
    const created = createInstance<SellerPresentationDraft>({
      skillId: "seller-presentation",
      draft: { ...EMPTY_DRAFT, themeId: seedThemeId() },
      currentStep: "property",
      ownerEmail: ownerEmail ?? undefined,
    });
    goToInstance(created.instanceId);
  }

  function duplicate(card: PageCard) {
    if (!card.instanceId) return;
    const source = loadInstance<SellerPresentationDraft>(card.instanceId);
    if (!source) {
      setActionError("That draft is no longer on this device.");
      return;
    }
    // Deep-clone + rename via the pure helper. A duplicate is ALWAYS a fresh
    // Draft: createInstance never sets publishedSlug/publishedAt, so the copy
    // has no live link and the original's published page is untouched.
    const clonedDraft = buildDuplicateDraft(source.draft);
    createInstance<SellerPresentationDraft>({
      skillId: "seller-presentation",
      draft: clonedDraft,
      currentStep: "property",
      ownerEmail: ownerEmail ?? undefined,
    });
    // Stay in the library and surface the new Draft (it lives in Active).
    setActionError(null);
    setTab("active");
    rebuildCards(serverPages);
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
    if (card.instanceId) deleteInstance(card.instanceId);
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
      const instance = loadInstance<SellerPresentationDraft>(card.instanceId);
      if (!instance) {
        setActionError("That draft is no longer on this device.");
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
      markPublished(card.instanceId, body.slug);
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

        {loading ? (
          <div className="lib-loading" data-testid="lib-loading">
            Loading your pages…
          </div>
        ) : cards.length === 0 ? (
          <EmptyState onCreate={newPage} />
        ) : visibleCards.length === 0 ? (
          <TabEmpty tab={tab} />
        ) : (
          <div className="lib-grid" data-testid="lib-grid">
            {visibleCards.map((card) => (
              <PageCardView
                key={card.key}
                card={card}
                busy={busyKey === card.key || bulkBusy}
                copied={copiedKey === card.key}
                selectMode={selectMode}
                checked={selected.has(card.key)}
                onToggleSelect={() => toggleSelected(card.key)}
                onContinue={() =>
                  card.instanceId && goToInstance(card.instanceId)
                }
                onUpdateLive={() => updateLive(card)}
                onViewLive={() => viewLive(card)}
                onCopyLink={() => copyLink(card)}
                onArchive={() => setArchived(card, true)}
                onRestore={() => setArchived(card, false)}
                onDuplicate={() => duplicate(card)}
                onDelete={() => requestDelete(card)}
              />
            ))}
          </div>
        )}
      </div>

      {/* bulk action bar (select mode) */}
      {selectMode && (
        <div className="lib-bulkbar" role="region" aria-label="Bulk actions" data-testid="lib-bulkbar">
          <span className="lib-bulk-count" data-testid="lib-bulk-count">
            {selectedCards.length} selected
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

function PageCardView({
  card,
  busy,
  copied,
  selectMode,
  checked,
  onToggleSelect,
  onContinue,
  onUpdateLive,
  onViewLive,
  onCopyLink,
  onArchive,
  onRestore,
  onDuplicate,
  onDelete,
}: {
  card: PageCard;
  busy: boolean;
  copied: boolean;
  selectMode: boolean;
  checked: boolean;
  onToggleSelect: () => void;
  onContinue: () => void;
  onUpdateLive: () => void;
  onViewLive: () => void;
  onCopyLink: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isArchived = card.status === "archived";
  const isLive = card.status === "live" || card.status === "live-edits-pending";
  const isDraft = card.status === "draft";
  const isPending = card.status === "live-edits-pending";
  const canResume = !!card.instanceId;
  // Delete is valid on Draft + Archived only (never Live) — same rule the
  // bulk path enforces. A published archived card carries a slug + maybe an
  // instance; a draft (archived or not) carries only an instance.
  const canDelete = isDraft || isArchived;

  // Primary action by status (packet): Draft → Continue, Live → Open,
  // Archived → Restore.
  const primary = isArchived
    ? { label: busy ? "Restoring…" : "Restore", onClick: onRestore }
    : isDraft
      ? { label: "Continue", onClick: onContinue }
      : { label: "Open", onClick: onContinue };

  return (
    <article
      className="lib-card"
      data-status={card.status}
      data-testid="lib-card"
      data-slug={card.slug}
      data-selectable={selectMode ? "true" : undefined}
      data-checked={selectMode && checked ? "true" : undefined}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      {selectMode && (
        <label className="lib-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleSelect}
            aria-label={`Select ${card.propertyLine}`}
            data-testid="lib-card-check"
          />
          <span className="lib-check-box" aria-hidden="true" />
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

        {!selectMode && (
          <div className="lib-actions">
            <button
              type="button"
              className="lib-btn lib-btn-primary"
              onClick={primary.onClick}
              disabled={busy || (primary.label !== "Restore" && !canResume)}
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
