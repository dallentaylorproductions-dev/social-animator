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
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { ChevronDown, GripVertical } from "lucide-react";
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
  fetchPageOrder,
  putPageOrder,
} from "@/tools/seller-presentation/hooks/pages-order-client";
import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from "@/tools/seller-presentation/engine/types";
import { DEFAULT_BRAND_THEME_ID, loadBrandSettings } from "@/lib/brand";
import { brandToPublishInputs } from "@/tools/seller-presentation/components/preview/preview-payload";
import {
  applyManualOrder,
  buildDuplicateDraft,
  bulkActionValidity,
  cardLead,
  cardMode,
  cardOverflowActions,
  cardSignal,
  countWorthFollowUp,
  filterByTab,
  followUpMarkerLabel,
  followUpSubline,
  isAtOrOverLiveCap,
  isCrossDeviceOnly,
  LIBRARY_MOBILE_MAX_WIDTH,
  listMetaLine,
  splitFollowUp,
  usageMeterLabel,
  viewSignalLabel,
  viewEngagementFacts,
  LONG_PRESS_MS,
  mergePages,
  movedBeyond,
  PAGES_ORDER_CACHE_KEY,
  resolveViewMode,
  sanitizePageOrder,
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

/**
 * How long after the last reorder swap before the order is written to the
 * server (SP-LIB-5). One settle per drag, not a write per row crossed; the
 * order is also cached locally on every change, so nothing is lost in the gap.
 */
const ORDER_PERSIST_DEBOUNCE_MS = 600;

/**
 * The reorder motion (SP-LIB-5). A gentle, slightly-bouncy spring for the
 * settle — fluid, NOT a hard snap — and a subtle lift while dragging. Kept as
 * isolated primitives so the later app-wide delight pass can extend the feel
 * without touching the row. Both are bypassed under prefers-reduced-motion.
 */
const ROW_REORDER_SPRING = {
  type: "spring",
  stiffness: 620,
  damping: 34,
  mass: 0.7,
} as const;

const ROW_REORDER_LIFT = {
  scale: 1.025,
  boxShadow: "0 14px 32px rgba(0, 0, 0, 0.30)",
  cursor: "grabbing",
} as const;

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
  reorderEnabled = false,
  libraryV2Enabled = false,
  cardExpandEnabled = false,
  libraryV3Enabled = false,
}: {
  ownerEmail: string | null;
  /**
   * SP-KEYSTONE — when true the DRAFT slice is sourced from the owner-scoped
   * SERVER store (so a draft created on any device appears + opens here) and
   * draft mutations (new / duplicate / update-live / archive / delete) operate
   * on the server. Default false ⇒ today's localStorage-only behavior.
   */
  serverDraftsEnabled?: boolean;
  /**
   * SP-LIB-5 — when true the agent can drag to reorder the Active tab (List
   * view), and that owner-scoped order is persisted server-side + applied as
   * the Active default in Cards + List. Default false ⇒ byte-identical to
   * today's library: no drag handle, fixed most-recent-first sort.
   */
  reorderEnabled?: boolean;
  /**
   * PAGES_LIBRARY_V2 — when true the Active tab becomes the seller-activity
   * cockpit: a pinned "Worth a follow-up" group (recency-sorted) above an
   * "Active pages" section (existing order preserved), de-duplicated card signal
   * lines, a calm non-alarming usage line, and an "all caught up" state. Default
   * false ⇒ byte-identical to today's library (single most-recent-first list,
   * the "N of M live" meter, the at-limit banner).
   */
  libraryV2Enabled?: boolean;
  /**
   * PAGES_CARD_EXPAND (Pass 2) — when true, the Cards view at mobile widths
   * renders collapsed-by-default cards (the lead signal + one primary action),
   * expanding inline on tap to reveal the full engagement detail + action set
   * (destructive actions behind a "⋯" overflow). Scoped to narrow viewports via
   * `isNarrow` (a post-mount matchMedia read, hydration-safe like the view-mode
   * default); desktop keeps today's fully-shown card. Default false ⇒ byte-
   * identical to the Pass 1 library on mobile and desktop. Owner-scoped; the
   * collapse/expand affordance never renders unless this is on AND the viewport
   * is narrow, so the flag-off DOM is unchanged.
   */
  cardExpandEnabled?: boolean;
  /**
   * PAGES_LIBRARY_V3 (Pass 3a) — when true, Cards become the mobile DEFAULT
   * (List is desktop-only and hidden at mobile widths), and every card leads
   * with one clear state by mode (follow-up / live / draft) via the action-first
   * hierarchy (address anchor → lead → reason once → muted context). A presentation
   * + default re-shape of the V2 card — read server-side and threaded down as a
   * prop (mirroring cardExpandEnabled) so the client needs no separate public
   * flag. Default false ⇒ byte-identical to the V2 (Pass 1/2) library on mobile
   * and desktop. Owner-scoped; nothing seller-facing.
   */
  libraryV3Enabled?: boolean;
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

  // PAGES_CARD_EXPAND (Pass 2) — is the viewport narrow (a phone)? Initialized to
  // a STABLE false so the server and first client render agree (the card paints
  // fully shown, exactly as today), then resolved + kept current in the effect
  // below via matchMedia. Drives the mobile-only collapse/expand: the card is
  // collapsible only when `cardExpandEnabled && isNarrow`, so desktop is never
  // collapsed and the flag-off path never reads it. 640px matches the single-
  // column card grid breakpoint in pages-library.css.
  const [isNarrow, setIsNarrow] = useState(false);

  // PAGES_LIBRARY_V3 (Pass 3a) — is the viewport a phone/small tablet (the same
  // LIBRARY_MOBILE_MAX_WIDTH=768 breakpoint the view-mode default keys off)? On
  // mobile under V3, List is desktop-only: the toggle hides and the render is
  // forced to Cards regardless of a saved (desktop-set) preference. Initialized
  // to a STABLE false (desktop) so the server and first client render agree, then
  // resolved + kept current via matchMedia. Inert unless the flag is on (no
  // listener attached), so the flag-off path is byte-identical.
  const [isMobile, setIsMobile] = useState(false);

  // v5 — the agent's manual order for the Active tab (SP-LIB-5). A list of
  // card KEYS, owner-scoped + persisted server-side (cross-device). `order`
  // drives the render; `orderRef` mirrors it for the async prune/persist paths
  // (no stale closures); `orderTimerRef` debounces the server write so a drag
  // is one settle, not a write per swap. All inert unless `reorderEnabled`.
  const [order, setOrderState] = useState<string[]>([]);
  const orderRef = useRef<string[]>([]);
  const orderTimerRef = useRef<number | null>(null);
  // Count of in-flight order PUTs. A debounced write nulls its timer the moment
  // it FIRES, but the PUT is still on the wire after that — so the timer alone
  // is not enough to tell refreshOrder "a local write is outstanding." This
  // counter stays > 0 until the PUT resolves, so refreshOrder never adopts a
  // server copy that predates a write we just sent (which would revert a drag).
  const orderWritesInFlightRef = useRef(0);

  // Set the order locally (state + ref + offline cache). Never writes the
  // server — persistence is an explicit, separate step so a load() refresh
  // can adopt the server copy without echoing it straight back.
  const setOrderLocal = useCallback((next: string[]) => {
    orderRef.current = next;
    setOrderState(next);
    try {
      window.localStorage.setItem(PAGES_ORDER_CACHE_KEY, JSON.stringify(next));
    } catch {
      // storage disabled / quota — the server copy is still authoritative
    }
  }, []);

  // Write the order to the server, tracking the request as in-flight so a
  // concurrent refreshOrder won't adopt a now-stale server copy mid-flight.
  const flushOrderWrite = useCallback(async (next: string[]) => {
    orderWritesInFlightRef.current += 1;
    try {
      await putPageOrder(next);
    } finally {
      orderWritesInFlightRef.current -= 1;
    }
  }, []);

  // Debounced server write of the order (one settle per drag, not per swap).
  const persistOrderDebounced = useCallback(
    (next: string[]) => {
      if (orderTimerRef.current !== null) {
        window.clearTimeout(orderTimerRef.current);
      }
      orderTimerRef.current = window.setTimeout(() => {
        orderTimerRef.current = null;
        void flushOrderWrite(next);
      }, ORDER_PERSIST_DEBOUNCE_MS);
    },
    [flushOrderWrite],
  );

  // A drag settled (or fired mid-drag as rows cross): adopt the new key order
  // locally and schedule the server write.
  const handleReorder = useCallback(
    (nextKeys: string[]) => {
      setOrderLocal(nextKeys);
      persistOrderDebounced(nextKeys);
    },
    [setOrderLocal, persistOrderDebounced],
  );

  // Drop key(s) from the order and persist immediately (awaited). Used when a
  // card leaves the Active set for good: archived (so Restore re-slots it on
  // top, since it's "unknown" to the order again) or deleted (cleanup). The
  // immediate write lands before the caller's following load() re-reads it.
  // Batched so a bulk archive/delete is one write, not one per card.
  const pruneOrderKeys = useCallback(
    async (keys: string[]) => {
      if (!reorderEnabled || keys.length === 0) return;
      const drop = new Set(keys);
      if (!orderRef.current.some((k) => drop.has(k))) return;
      const next = orderRef.current.filter((k) => !drop.has(k));
      setOrderLocal(next);
      if (orderTimerRef.current !== null) {
        window.clearTimeout(orderTimerRef.current);
        orderTimerRef.current = null;
      }
      await flushOrderWrite(next);
    },
    [reorderEnabled, setOrderLocal, flushOrderWrite],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    } catch {
      // storage disabled / private mode — fall through to the viewport default
    }
    // PAGES_LIBRARY_V3 — when on, List is desktop-only, so mobile resolves to
    // Cards regardless of a saved (desktop-set) preference. Flag-off keeps
    // today's saved-wins / viewport-default resolution, byte-identical.
    setViewMode(
      resolveViewMode(saved, window.innerWidth, libraryV3Enabled),
    );
    setNowMs(Date.now());
    // Seed the order from the offline cache for an immediate ordered paint;
    // load() refreshes it from the server (the cross-device source of truth).
    if (reorderEnabled) {
      try {
        const cached = window.localStorage.getItem(PAGES_ORDER_CACHE_KEY);
        if (cached) {
          const parsed = sanitizePageOrder(JSON.parse(cached));
          if (parsed.length) setOrderLocal(parsed);
        }
      } catch {
        // no cache / parse error — the server fetch in load() fills it in
      }
    }
  }, [reorderEnabled, setOrderLocal, libraryV3Enabled]);

  // PAGES_LIBRARY_V3 (Pass 3a) — track whether the viewport is mobile (the
  // LIBRARY_MOBILE_MAX_WIDTH=768 breakpoint), so List can be hidden + the render
  // forced to Cards there. Inert unless the flag is on (no listener attached), so
  // the flag-off path is byte-identical. matchMedia is read in the effect (never
  // during render) and kept current via its change event, so a rotate / resize
  // across the breakpoint reflows the toggle + view correctly.
  useEffect(() => {
    if (!libraryV3Enabled || typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${LIBRARY_MOBILE_MAX_WIDTH}px)`);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [libraryV3Enabled]);

  // PAGES_CARD_EXPAND (Pass 2) — track whether the viewport is a phone, so the
  // Cards view can collapse/expand there only. Inert unless the flag is on (no
  // listener attached), so the flag-off path is byte-identical. matchMedia is
  // read in the effect (never during render) and kept current via its change
  // event, so a rotate / resize across the breakpoint reflows correctly.
  useEffect(() => {
    if (!cardExpandEnabled || typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    setIsNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [cardExpandEnabled]);

  // On unmount, FLUSH (not drop) a pending debounced order write — otherwise a
  // reorder made in the last debounce window before navigating away is lost
  // (the cache would then be overwritten by the stale server copy on return).
  // Fire-and-forget: the cleanup can't await, and the write is idempotent.
  useEffect(
    () => () => {
      if (orderTimerRef.current !== null) {
        window.clearTimeout(orderTimerRef.current);
        orderTimerRef.current = null;
        void putPageOrder(orderRef.current);
      }
    },
    [],
  );

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

  // SP-LIB-5 — refresh the manual order from the server (the cross-device
  // source of truth). Skips while a local reorder write is still pending so a
  // stale server read can't clobber the just-arranged order; on a failed fetch
  // the cache-seeded order stands (never blanks the arrangement on a blip).
  const refreshOrder = useCallback(async () => {
    // Skip while a local write is pending OR still in flight, so a stale server
    // copy can never revert an order we just arranged (the timer alone misses
    // the window between the debounce firing and the PUT resolving).
    if (
      !reorderEnabled ||
      orderTimerRef.current !== null ||
      orderWritesInFlightRef.current > 0
    ) {
      return;
    }
    const serverOrder = await fetchPageOrder();
    if (serverOrder) setOrderLocal(serverOrder);
  }, [reorderEnabled, setOrderLocal]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Pull the server draft slice first (when on) so the cards built below
      // reconcile the freshest cross-device drafts with the published pages.
      // The order refresh is independent (applied at render, not in the merge),
      // so it rides alongside rather than adding a serial round trip.
      await Promise.all([refreshServerDrafts(), refreshOrder()]);
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
  }, [rebuildCards, refreshServerDrafts, refreshOrder]);

  useEffect(() => {
    load();
  }, [load]);

  const atLimit = useMemo(
    () => cap > 0 && isAtOrOverLiveCap(liveCount, cap),
    [liveCount, cap],
  );

  const counts = useMemo(() => tabCounts(cards), [cards]);
  // Phase 3 — how many pages are worth a follow-up, for the calm header count.
  // 0 (and the count hides) on a flag-off list, since no card carries
  // `worthFollowUp` unless the nudge flag populated it server-side.
  const followUpCount = useMemo(() => countWorthFollowUp(cards), [cards]);
  // V2 — does the agent have any live page at all? Gates the calm "all caught
  // up" affordance so it reads intentional (it only makes sense once there is a
  // page a seller could engage with), never on a drafts-only library.
  const hasLivePage = useMemo(
    () =>
      cards.some(
        (c) => c.status === "live" || c.status === "live-edits-pending",
      ),
    [cards],
  );
  const visibleCards = useMemo(() => filterByTab(cards, tab), [cards, tab]);
  // SP-LIB-5 — the Active tab renders in the agent's manual order (Cards + List
  // both). For Archived (and whenever reorder is off) this is exactly today's
  // sort, so `orderedCards === visibleCards` ⇒ the flag-off render is
  // byte-identical and the Archived tab is never manually reordered.
  const orderedCards = useMemo(
    () =>
      reorderEnabled && tab === "active"
        ? applyManualOrder(visibleCards, order)
        : visibleCards,
    [reorderEnabled, tab, visibleCards, order],
  );
  // PAGES_LIBRARY_V3 (Pass 3a) — the view actually rendered. List is desktop-only
  // under V3, so on mobile the render is forced to Cards regardless of the saved
  // `viewMode` (which still governs desktop + is preserved in storage). Flag-off
  // (and V3 on desktop) ⇒ `effectiveViewMode === viewMode`, so the render is
  // byte-identical.
  const effectiveViewMode: ViewMode =
    libraryV3Enabled && isMobile ? "cards" : viewMode;
  // Whether to show the Cards/List toggle. Under V3 on mobile there is only one
  // view (Cards), so the toggle hides; everywhere else it shows both as today.
  const showViewToggle = !(libraryV3Enabled && isMobile);

  // Drag-to-reorder is List-view + Active-tab only, and never during select
  // mode (which owns the press gesture). Cards view still shows the order; it
  // just isn't draggable this round (card-grid drag is a noted follow-up).
  const canReorder =
    reorderEnabled &&
    tab === "active" &&
    effectiveViewMode === "list" &&
    !selectMode;
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
      if (ok) {
        // Archiving removes the card from the order so a later Restore re-slots
        // it on top (SP-LIB-5). Restore itself needs no order change — the card
        // is "unknown" to the order again, which applyManualOrder floats to top.
        if (archived) await pruneOrderKeys([card.key]);
        await load();
      }
    } catch {
      setActionError("Archive failed. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  // Viewed signal (Phase 3) — clear a page from the advisory nudge set. One
  // bounded, owner-scoped write (records `followedUpAt`); strictly advisory, it
  // sends nothing. On success the page reloads and the marker + header count drop
  // for that page. Only ever reachable when the page is worth a follow-up (the
  // control renders solely under the nudge flag).
  async function markFollowedUp(card: PageCard) {
    if (!card.slug) return;
    setActionError(null);
    setBusyKey(card.key);
    try {
      const res = await fetch("/api/seller-presentation/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: card.slug, action: "mark" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setActionError(body.error ?? "Could not mark as followed up.");
        return;
      }
      await load();
    } catch {
      setActionError("Could not mark as followed up. Please try again.");
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
          if (ok) {
            // Drop the deleted card's key from the order (cleanup; SP-LIB-5).
            await pruneOrderKeys([card.key]);
            await load();
          }
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
      // The page itself is already republished (the seller sees the new
      // content). Persist the publish stamp onto the SERVER draft record so the
      // Live / edits-pending state is correct on every device. If that sync
      // fails, the publish still stands; surface a soft note rather than
      // pretend the cross-device state is current.
      if (serverDraftsEnabled && stamped) {
        const synced = await putServerDraft(stamped);
        if (!synced.ok) {
          setActionError(
            "Your page was updated, but syncing the draft state failed. It will retry next time you open it.",
          );
        }
      }
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
      const removed: string[] = [];
      for (const card of targets) {
        // setActionError inside op already surfaces the last failure reason.
        const ok = await op(card);
        if (!ok) failures += 1;
        else removed.push(card.key);
      }
      // Both bulk ops (archive / delete) take cards OUT of Active, so drop the
      // succeeded keys from the order in one write (SP-LIB-5).
      await pruneOrderKeys(removed);
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
      libraryV2: libraryV2Enabled,
      // PAGES_LIBRARY_V3 (Pass 3a) — the card leads with one clear state by mode
      // (the desktop card + the collapsed mobile card). PageRowView ignores it
      // (List hierarchy is out of scope this pass).
      libraryV3: libraryV3Enabled,
      // PAGES_CARD_EXPAND (Pass 2) — collapsible only on a phone with the flag
      // on. PageRowView ignores it (List is out of scope this pass).
      expandable: cardExpandEnabled && isNarrow,
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
      onMarkFollowedUp: () => markFollowedUp(card),
    };
  }

  // One render path for a set of cards — the draggable Active List (SP-LIB-5),
  // the plain List, or the Cards grid. Pulled out of the render chain so the V2
  // cockpit can render its two sections (the pinned follow-up group + the rest)
  // through the exact same primitive, and the flag-off path stays byte-identical
  // (`renderItems(orderedCards, canReorder)` is the prior inline chain verbatim).
  function renderItems(items: PageCard[], draggable: boolean) {
    if (draggable) {
      // SP-LIB-5 — the draggable Active List. framer-motion's Reorder gives the
      // fluid lift / flow / spring settle; drag is HANDLE-only (dragListener=false
      // + per-row dragControls), so tap-to-open and long-press-select on the row
      // are untouched. The order of `values` IS the render order; onReorder hands
      // back the new key order.
      return (
        <Reorder.Group
          as="div"
          axis="y"
          values={items.map((c) => c.key)}
          onReorder={handleReorder}
          className="lib-list"
          data-testid="lib-list"
        >
          {items.map((card) => (
            <PageRowView key={card.key} {...rowProps(card)} reorderable />
          ))}
        </Reorder.Group>
      );
    }
    if (effectiveViewMode === "list") {
      return (
        <div className="lib-list" data-testid="lib-list">
          {items.map((card) => (
            <PageRowView key={card.key} {...rowProps(card)} />
          ))}
        </div>
      );
    }
    return (
      <div className="lib-grid" data-testid="lib-grid">
        {items.map((card) => (
          <PageCardView key={card.key} {...rowProps(card)} />
        ))}
      </div>
    );
  }

  // The Active-tab body. V2 splits it into the pinned "Worth a follow-up" group
  // (recency-sorted) above an "Active pages" section (existing order preserved);
  // a card never appears in both. When the group is empty the cockpit shows no
  // top section (optionally a calm "all caught up" affordance) and the rest
  // renders exactly as today — including the draggable reorder. Drag is reserved
  // for the ungrouped case this pass (a grouped cockpit isn't draggable yet), so
  // handleReorder always operates on the full Active set.
  function renderActiveBody() {
    if (!libraryV2Enabled) return renderItems(orderedCards, canReorder);

    const { followUp, rest } = splitFollowUp(orderedCards);
    const hasGroup = followUp.length > 0;
    return (
      <>
        {hasGroup && (
          <section className="lib-section" data-testid="lib-followup-group">
            <div className="lib-section-head">
              <h2 className="lib-section-title">Worth a follow-up</h2>
              <p className="lib-section-sub">{followUpSubline(followUp.length)}</p>
            </div>
            {renderItems(followUp, false)}
          </section>
        )}

        {!hasGroup && hasLivePage && (
          <div className="lib-caughtup" role="status" data-testid="lib-caughtup">
            <p className="lib-caughtup-title">All caught up</p>
            <p className="lib-caughtup-sub">
              When a seller meaningfully engages with their page, they will
              appear here.
            </p>
          </div>
        )}

        <section className="lib-section" data-testid="lib-active-section">
          {hasGroup && (
            <div className="lib-section-head">
              <h2 className="lib-section-title">Active pages</h2>
            </div>
          )}
          {renderItems(rest, !hasGroup && canReorder)}
        </section>
      </>
    );
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
              {followUpCount > 0 && (
                <span
                  className="lib-followup-count"
                  data-testid="lib-followup-count"
                  title="Pages a seller engaged with recently. A quiet suggestion to reach out — nothing is sent for you."
                >
                  {followUpCount} worth a follow-up
                </span>
              )}
              {cap > 0 &&
                (libraryV2Enabled ? (
                  // V2 — a quiet, separate usage line. The cap is shown, not
                  // enforced (pre-billing), so an over-cap agent never sees an
                  // alarming "68 of 25"; it reads "N live pages · plan limit M"
                  // in the same muted voice, no alert color.
                  <span
                    className="lib-meter"
                    data-testid="lib-usage-meter"
                    title="Only live pages count toward your limit. Drafts and archived pages are free."
                  >
                    {usageMeterLabel(liveCount, cap)}
                  </span>
                ) : (
                  <span
                    className="lib-meter"
                    data-at-limit={atLimit ? "true" : undefined}
                    data-testid="lib-usage-meter"
                    title="Only live pages count toward your limit. Drafts and archived pages are free."
                  >
                    {liveCount} of {cap} live
                  </span>
                ))}
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

        {atLimit && !libraryV2Enabled && (
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
            {/* PAGES_LIBRARY_V3 (Pass 3a) — List is desktop-only: the toggle
                hides on mobile under the flag (Cards is the only view there).
                Everywhere else it shows both, exactly as today. */}
            {showViewToggle && (
              <div
                className="lib-viewtoggle"
                role="group"
                aria-label="Choose layout"
                data-testid="lib-view-toggle"
              >
                <button
                  type="button"
                  className="lib-tab lib-viewbtn"
                  aria-pressed={effectiveViewMode === "cards"}
                  data-active={effectiveViewMode === "cards" ? "true" : undefined}
                  onClick={() => chooseView("cards")}
                  data-testid="lib-view-cards"
                >
                  Cards
                </button>
                <button
                  type="button"
                  className="lib-tab lib-viewbtn"
                  aria-pressed={effectiveViewMode === "list"}
                  data-active={effectiveViewMode === "list" ? "true" : undefined}
                  onClick={() => chooseView("list")}
                  data-testid="lib-view-list"
                >
                  List
                </button>
              </div>
            )}

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
        ) : tab === "active" ? (
          renderActiveBody()
        ) : (
          // Archived tab: its own most-recently-archived-first sort, never
          // grouped and never reorderable (canReorder is Active-only), so this
          // is exactly today's List / Cards render.
          renderItems(orderedCards, canReorder)
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
  /**
   * PAGES_LIBRARY_V2 — render the de-duplicated cockpit signal lines (the nudge
   * marker absorbs the engagement facts on a follow-up card; one fact otherwise).
   * Default off ⇒ the three independent Phase 1/2/3 lines, byte-identical.
   */
  libraryV2: boolean;
  /**
   * PAGES_LIBRARY_V3 (Pass 3a) — render the action-first card hierarchy: a
   * `data-mode` weight class on the card and the three-tier lead (lead state →
   * reason once → muted context). Card view only; PageRowView ignores it. Default
   * off ⇒ the V2 (Pass 1/2) signal lines, byte-identical.
   */
  libraryV3: boolean;
  /**
   * PAGES_CARD_EXPAND (Pass 2) — render this card collapsed-by-default with an
   * inline tap-to-expand affordance (Cards view, phone widths only). Set by the
   * parent to `cardExpandEnabled && isNarrow`. PageRowView ignores it (List is
   * Pass 3); when false the card renders exactly as today.
   */
  expandable?: boolean;
  /** Client snapshot of Date.now() for relative-time meta (List rows only). */
  nowMs: number;
  /** SP-KEYSTONE — server drafts on ⇒ the cross-device note copy is honest. */
  serverDraftsEnabled: boolean;
  busy: boolean;
  copied: boolean;
  selectMode: boolean;
  checked: boolean;
  /**
   * SP-LIB-5 — render this row as a draggable Reorder.Item with a grip handle.
   * List rows only, set by the Active-tab draggable branch. Cards ignore it.
   */
  reorderable?: boolean;
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
  /** Phase 3 — clear this page from the advisory follow-up nudge set. */
  onMarkFollowedUp: () => void;
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
  libraryV2,
  libraryV3,
  expandable = false,
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
  onMarkFollowedUp,
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

  // PAGES_CARD_EXPAND (Pass 2) — collapse/expand state for the phone card. Local
  // + per-card, so toggling one card never collapses another (Decision 4:
  // independent toggles). Reset on remount (Decision 5). All inert unless
  // `expandable` (phone + flag on); on desktop / flag-off the card renders
  // exactly as today, so none of this changes the markup there.
  const [expanded, setExpanded] = useState(false);
  const extraId = `lib-card-extra-${card.key}`;
  // The destructive / housekeeping actions that live behind the expanded card's
  // "⋯" overflow (archive / duplicate / delete) — a filter of the same
  // secondaryRowActions the List row menu uses, so the two never drift.
  const overflowActions = expandable ? cardOverflowActions(card) : [];

  // The whole card is the tap target (packet). Inner controls (buttons / the
  // checkbox) self-handle, so a click that bubbled up from one is ignored here;
  // a long-press just fired swallows its trailing click. When the card is
  // expandable (phone + flag on), a body tap TOGGLES expand and NEVER navigates
  // (Decision 2) — navigation stays on the explicit primary button.
  function onCardClick(e: ReactMouseEvent) {
    if (longPress.consumeIfFired()) return;
    if ((e.target as HTMLElement).closest("button, a, label, input")) return;
    if (selectMode) {
      onToggleSelect();
      return;
    }
    if (expandable) {
      setExpanded((v) => !v);
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
      // PAGES_LIBRARY_V3 (Pass 3a) — the hierarchy mode drives the card's visual
      // weight in CSS (follow-up > live > draft). Emitted only under the flag, so
      // a flag-off card carries no `data-mode` and its styling is unchanged.
      data-mode={libraryV3 ? cardMode(card) : undefined}
      data-testid="lib-card"
      data-slug={card.slug}
      data-selectable={selectMode ? "true" : undefined}
      data-checked={selectMode && checked ? "true" : undefined}
      data-cross-device={crossDevice ? "true" : undefined}
      data-expandable={expandable ? "true" : undefined}
      data-expanded={expandable && expanded ? "true" : undefined}
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
        {libraryV3 ? (
          // PAGES_LIBRARY_V3 (Pass 3a) — the three-tier lead. One clear lead by
          // mode, the reason said ONCE, then muted context — never the same fact
          // twice. The visual weight per tier (and per mode) is CSS, keyed off
          // the card's `data-mode`; this is purely the text. Empty on a draft /
          // archived / never-opened card (the chip + primary carry the state).
          (() => {
            const h = cardLead(card, nowMs);
            return (
              <>
                {h.lead && (
                  <p className="lib-lead" data-testid="lib-card-lead">
                    {h.lead}
                  </p>
                )}
                {h.reason && (
                  <p className="lib-reason" data-testid="lib-card-reason">
                    {h.reason}
                  </p>
                )}
                {h.context && (
                  <p
                    className="lib-context"
                    data-testid="lib-card-context"
                    data-returned={card.returnedAfterReveal ? "true" : undefined}
                  >
                    {h.context}
                  </p>
                )}
              </>
            );
          })()
        ) : libraryV2 ? (
          // V2 cockpit — the de-duplicated signal. On a follow-up card the nudge
          // marker leads (action state + reason) and the context line carries
          // recency + opens only; the engagement facts are NOT repeated (the
          // marker owns them), so a card never shows the same fact twice. On a
          // non-follow-up live card there is no marker, just status + count + one
          // fact. cardSignal returns both undefined on a draft / never-opened /
          // flag-off card, so nothing renders.
          (() => {
            const sig = cardSignal(card, nowMs);
            return (
              <>
                {sig.marker && (
                  <p className="lib-card-followup" data-testid="lib-card-followup">
                    {sig.marker}
                  </p>
                )}
                {sig.context && (
                  <p
                    className="lib-card-views"
                    data-testid="lib-card-context"
                    data-returned={card.returnedAfterReveal ? "true" : undefined}
                  >
                    {sig.context}
                  </p>
                )}
              </>
            );
          })()
        ) : (
          <>
            {typeof card.viewCount === "number" && (
              <p className="lib-card-views" data-returned={card.returnedAfterReveal ? "true" : undefined}>
                {[
                  viewSignalLabel(card, nowMs),
                  `${card.viewCount} ${card.viewCount === 1 ? "view" : "views"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {/* Viewed signal (Phase 2) — quiet, concrete engagement facts on a
                muted secondary line (capped + prioritized in viewEngagementFacts).
                Empty on a flag-off / Phase-1 card, so nothing new renders there. */}
            {(() => {
              const facts = viewEngagementFacts(card);
              return facts.length > 0 ? (
                <p className="lib-card-facts" data-testid="lib-card-facts">
                  {facts.join(" · ")}
                </p>
              ) : null;
            })()}

            {/* Viewed signal (Phase 3) — the calm advisory follow-up marker + its
                concrete reason. A quiet suggestion, never an alarm: no badge, no
                urgency, no hype. Present only when the route flagged the page worth
                a follow-up (under VIEWED_SIGNAL_NUDGE_ENABLED), so a flag-off card
                renders nothing here. */}
            {(() => {
              const marker = followUpMarkerLabel(card);
              return marker ? (
                <p className="lib-card-followup" data-testid="lib-card-followup">
                  {marker}
                </p>
              ) : null;
            })()}
          </>
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

        {!selectMode && expandable ? (
          // PAGES_CARD_EXPAND (Pass 2) — collapsed face: just the primary action
          // + the chevron disclosure. Everything else (the workflow actions and
          // the destructive "⋯" overflow) lives in `.lib-card-extra`, revealed
          // inline on expand. The chevron is the keyboard/SR disclosure control
          // (aria-expanded + aria-controls); a body tap toggles the same state.
          <>
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
              <button
                type="button"
                className="lib-chevron"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={extraId}
                aria-label={`${expanded ? "Hide" : "Show"} details for ${card.propertyLine}`}
                data-testid="lib-card-expand"
              >
                <ChevronDown
                  className="lib-chevron-icon"
                  size={16}
                  aria-hidden="true"
                />
              </button>
            </div>

            <div
              className="lib-card-extra"
              id={extraId}
              data-no-longpress="true"
              data-testid="lib-card-extra"
            >
              <div className="lib-actions">
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

                {card.worthFollowUp && (
                  <button
                    type="button"
                    className="lib-btn lib-btn-quiet"
                    onClick={onMarkFollowedUp}
                    disabled={busy}
                    data-testid="lib-action-followup"
                  >
                    Mark as followed up
                  </button>
                )}

                {overflowActions.length > 0 && (
                  <RowMenu
                    card={card}
                    actions={overflowActions}
                    busy={busy}
                    copied={copied}
                    onUpdateLive={onUpdateLive}
                    onViewLive={onViewLive}
                    onCopyLink={onCopyLink}
                    onArchive={onArchive}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    onMarkFollowedUp={onMarkFollowedUp}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          !selectMode && (
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

              {card.worthFollowUp && (
                <button
                  type="button"
                  className="lib-btn lib-btn-quiet"
                  onClick={onMarkFollowedUp}
                  disabled={busy}
                  data-testid="lib-action-followup"
                >
                  Mark as followed up
                </button>
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
          )
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
  reorderable,
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
  onMarkFollowedUp,
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
  // SP-LIB-5 — drag plumbing. Hooks run unconditionally (Rules of Hooks); they
  // only matter when `reorderable`. `dragControls` lets the grip handle start
  // the drag while the rest of the row keeps its tap / long-press gestures;
  // `reduceMotion` collapses the spring to an instant move for users who ask.
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();

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

  // The row's inner content — identical whether the root is a plain div or a
  // draggable Reorder.Item, so the two paths can never drift. The grip handle
  // leads the scan line ONLY when reorderable (it carries data-no-longpress, so
  // pressing it never trips long-press-select; it starts the framer drag).
  const body = (
    <>
      <div className="lib-row-line">
        {reorderable && (
          <DragHandle controls={dragControls} label={card.propertyLine} />
        )}

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
            onMarkFollowedUp={onMarkFollowedUp}
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
    </>
  );

  // The same data hooks for both roots, so CSS can't tell them apart.
  const rootData = {
    "data-status": card.status,
    "data-testid": "lib-row",
    "data-slug": card.slug,
    "data-selectable": selectMode ? "true" : undefined,
    "data-checked": selectMode && checked ? "true" : undefined,
    "data-cross-device": crossDevice ? "true" : undefined,
  } as const;

  if (reorderable) {
    // Draggable root: drag is HANDLE-only (dragListener=false), so the row's
    // own pointer handlers (long-press-select) are untouched. The settle is a
    // gentle spring; `whileDrag` lifts the row; reduced-motion makes both
    // instant. The lift is isolated here so the later delight pass can extend
    // it without restructuring the row.
    return (
      <Reorder.Item
        as="div"
        value={card.key}
        className="lib-row"
        {...rootData}
        {...longPress.handlers}
        dragListener={false}
        dragControls={dragControls}
        data-reorderable="true"
        transition={reduceMotion ? { duration: 0 } : ROW_REORDER_SPRING}
        whileDrag={reduceMotion ? undefined : ROW_REORDER_LIFT}
      >
        {body}
      </Reorder.Item>
    );
  }

  return (
    <div className="lib-row" {...rootData} {...longPress.handlers}>
      {body}
    </div>
  );
}

/**
 * The drag handle (SP-LIB-5). A dedicated grip so the gestures never collide:
 * tap the row = open, long-press the row = select, drag THIS = reorder. It
 * carries `data-no-longpress` (a press here is the handle's, not the row's) and
 * starts the framer drag on pointer-down — `touch-action: none` (CSS) lets a
 * touch-drag move the row instead of scrolling the page.
 */
function DragHandle({
  controls,
  label,
}: {
  controls: ReturnType<typeof useDragControls>;
  label: string;
}) {
  return (
    <button
      type="button"
      className="lib-row-grip"
      data-no-longpress="true"
      aria-label={`Drag to reorder ${label}`}
      onPointerDown={(e) => {
        // Begin the drag from the handle only; stop the press becoming a text
        // selection / scroll start.
        e.preventDefault();
        controls.start(e);
      }}
      data-testid="lib-row-grip"
    >
      <GripVertical size={18} aria-hidden="true" />
    </button>
  );
}

/** The verb a row's primary tap performs, for the hit button's accessible name. */
function primaryActionLabel(card: PageCard): string {
  if (card.status === "archived") return "Restore";
  if (card.status === "draft") return "Continue";
  return "Open";
}

const ROW_ACTION_LABEL: Record<RowAction, string> = {
  "mark-followed-up": "Mark as followed up",
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
  "mark-followed-up": true,
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
  onMarkFollowedUp,
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
  onMarkFollowedUp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handlerFor: Record<RowAction, () => void> = {
    "mark-followed-up": onMarkFollowedUp,
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
