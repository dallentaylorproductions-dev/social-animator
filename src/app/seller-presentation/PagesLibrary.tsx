"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createInstance,
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
  isAtOrOverLiveCap,
  mergePages,
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
 * Animation-ready, NOT pre-animated: every card carries a semantic
 * `data-status`, the grid is a flat list of isolated `.lib-card` units,
 * and all motion is CSS hover/transition only. The delight pass layers
 * on later without restructuring this tree.
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
    if (!source) return;
    // Deep clone the draft so the new instance shares no references; the
    // clone starts as a fresh Draft (no publishedSlug carries over — that
    // lives on the instance, and createInstance never sets it).
    const clonedDraft = JSON.parse(
      JSON.stringify(source.draft),
    ) as SellerPresentationDraft;
    const created = createInstance<SellerPresentationDraft>({
      skillId: "seller-presentation",
      draft: clonedDraft,
      currentStep: "property",
      ownerEmail: ownerEmail ?? undefined,
    });
    goToInstance(created.instanceId);
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

  async function setArchived(card: PageCard, archived: boolean) {
    setActionError(null);
    setBusyKey(card.key);
    try {
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
          return;
        }
        await load();
      } else if (card.instanceId) {
        // Local draft: flip the instance's local archive flag, re-merge.
        setInstanceArchived(card.instanceId, archived);
        rebuildCards(serverPages);
      }
    } catch {
      setActionError("Archive failed. Please try again.");
    } finally {
      setBusyKey(null);
    }
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

        {loading ? (
          <div className="lib-loading" data-testid="lib-loading">
            Loading your pages…
          </div>
        ) : cards.length === 0 ? (
          <EmptyState onCreate={newPage} />
        ) : (
          <div className="lib-grid" data-testid="lib-grid">
            {cards.map((card) => (
              <PageCardView
                key={card.key}
                card={card}
                busy={busyKey === card.key}
                copied={copiedKey === card.key}
                onContinue={() =>
                  card.instanceId && goToInstance(card.instanceId)
                }
                onUpdateLive={() => updateLive(card)}
                onViewLive={() => viewLive(card)}
                onCopyLink={() => copyLink(card)}
                onArchive={() => setArchived(card, true)}
                onRestore={() => setArchived(card, false)}
                onDuplicate={() => duplicate(card)}
              />
            ))}
          </div>
        )}
      </div>
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

function PageCardView({
  card,
  busy,
  copied,
  onContinue,
  onUpdateLive,
  onViewLive,
  onCopyLink,
  onArchive,
  onRestore,
  onDuplicate,
}: {
  card: PageCard;
  busy: boolean;
  copied: boolean;
  onContinue: () => void;
  onUpdateLive: () => void;
  onViewLive: () => void;
  onCopyLink: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDuplicate: () => void;
}) {
  const isArchived = card.status === "archived";
  const isLive = card.status === "live" || card.status === "live-edits-pending";
  const isPending = card.status === "live-edits-pending";
  const canResume = !!card.instanceId;

  // Primary action by status (packet): Draft → Continue, Live → Open,
  // Archived → Restore.
  const primary = isArchived
    ? { label: busy ? "Restoring…" : "Restore", onClick: onRestore }
    : card.status === "draft"
      ? { label: "Continue", onClick: onContinue }
      : { label: "Open", onClick: onContinue };

  return (
    <article
      className="lib-card"
      data-status={card.status}
      data-testid="lib-card"
      data-slug={card.slug}
    >
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
        </div>
      </div>
    </article>
  );
}
