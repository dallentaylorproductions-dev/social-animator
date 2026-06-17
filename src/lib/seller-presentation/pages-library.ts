/**
 * "Your pages" library — pure model + derivation (SP-LIB).
 *
 * The library landing for the Seller Presentation tool unifies two
 * stores that the rest of the product keeps deliberately separate:
 *
 *   - DRAFTS live in browser localStorage as `WorkflowInstance`s
 *     (device-local, never server-queryable).
 *   - PUBLISHED pages live in Vercel KV as `HandoutRecord`s, scoped
 *     server-side by the owner index (authoritative, agent-private).
 *
 * This module is the single, PURE source of truth for how those two
 * reconcile into one list of cards and how each card's status is
 * derived. No React, no KV, no localStorage — just data in, cards out —
 * so the server route (which projects handout summaries), the client
 * library (which merges in local drafts), and the unit tests all share
 * one implementation and can never drift.
 *
 * Privacy: the PUBLISHED slice is scoped by the server owner index
 * (the caller passes only THIS agent's records). The DRAFT slice is
 * scoped here by `ownerEmail` — an instance with no owner, or one whose
 * owner doesn't match the session, is dropped. There is no "claim
 * unowned drafts" path: on a shared browser, agent B never sees agent
 * A's local drafts.
 */

import type { HandoutRecord } from "@/lib/share-urls";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import type { SellerPresentationDraft } from "@/tools/seller-presentation/engine/types";

/** The handout type discriminator for seller-presentation pages. */
export const SELLER_PRESENTATION_HANDOUT_TYPE = "seller-presentation";
/** The skillId for seller-presentation workflow instances. */
export const SELLER_PRESENTATION_SKILL_ID = "seller-presentation";

export type PageStatus =
  | "draft"
  | "live"
  | "live-edits-pending"
  | "archived";

/**
 * The server's per-page projection (one published handout → one summary).
 * Carries ONLY what the card needs — no private draft fields ever leave
 * the server, and the handout's `data` is already the public-only
 * payload, but we still project narrowly here.
 */
export interface ServerPageSummary {
  slug: string;
  /** ISO 8601 — first published. */
  createdAt: string;
  /** ISO 8601 — last published (re-publish bumps this). */
  updatedAt: string;
  archived: boolean;
  cover?: string;
  /** Address line; may be empty if the payload somehow lacks one. */
  propertyLine: string;
  sellerLine?: string;
  /**
   * Viewed signal (Phase 1) — repeat-open count. Populated by the pages route
   * from `views:<slug>` ONLY when VIEWED_SIGNAL_ENABLED is on; omitted (and the
   * chip stays silent) when the flag is off, so flag-off is byte-identical.
   */
  viewCount?: number;
  /** Viewed signal (Phase 1) — ISO 8601 of the most recent open, iff opened. */
  lastViewedAt?: string;
  /** Viewed signal (Phase 1) — a retained open occurred after the reveal. */
  returnedAfterReveal?: boolean;
  /**
   * Viewed signal (Phase 2 — engagement). Populated by the pages route from the
   * `views:<slug>` aggregate ONLY when VIEWED_SIGNAL_ENGAGEMENT_ENABLED is on;
   * omitted (and the facts stay silent) when the flag is off, so a Phase-1 / flag-
   * off card is byte-identical.
   */
  watchedVideo?: boolean;
  readToEnd?: boolean;
  lingered?: boolean;
  /**
   * Viewed signal (Phase 3 — advisory follow-up nudge). Computed by the pages
   * route from the `views:<slug>` aggregate + the record's `followedUpAt` ONLY
   * when VIEWED_SIGNAL_NUDGE_ENABLED is on; omitted (and the nudge stays silent)
   * when the flag is off, so a Phase-1/2 / flag-off card is byte-identical.
   */
  worthFollowUp?: boolean;
  /** The concrete, prioritized reasons it is worth a follow-up (capped upstream). */
  followUpReasons?: string[];
  /**
   * ISO 8601 UTC of the most-recent meaningful engagement that qualified this
   * page. Set ONLY alongside `worthFollowUp`; drives the V2 cockpit's follow-up
   * group sort (most-recent first). Omitted on a flag-off / non-qualifying page.
   */
  followUpAt?: string;
}

/** A merged card the library renders. */
export interface PageCard {
  /** Stable React key — the instanceId if a local draft backs it, else the slug. */
  key: string;
  status: PageStatus;
  /** Present iff a local instance backs this card (enables Continue / Open / Update). */
  instanceId?: string;
  /** Present iff the page has been published (Live / edits-pending / archived). */
  slug?: string;
  /** The public /h/<slug> URL the seller sees. Present iff `slug` is. */
  publicUrl?: string;
  cover?: string;
  /** Never empty — falls back to a neutral label. */
  propertyLine: string;
  sellerLine?: string;
  /** ISO 8601 — drives most-recent-first ordering. */
  updatedAt: string;
  /**
   * ISO 8601 — when this card was archived, iff status === "archived".
   * Drives the Archived tab's "most-recently-archived-first" order. For a
   * local draft it is the instance's `archivedAt`; for a published page it
   * is the server record's `updatedAt` (the archive mutation bumped it).
   * Undefined on every non-archived card.
   */
  archivedAt?: string;
  viewCount?: number;
  /** Viewed signal (Phase 1) — ISO 8601 of the most recent open, iff opened. */
  lastViewedAt?: string;
  /** Viewed signal (Phase 1) — a retained open occurred after the reveal. */
  returnedAfterReveal?: boolean;
  /** Viewed signal (Phase 2) — concrete engagement facts, present only under flag. */
  watchedVideo?: boolean;
  readToEnd?: boolean;
  lingered?: boolean;
  /** Viewed signal (Phase 3) — advisory follow-up nudge, present only under flag. */
  worthFollowUp?: boolean;
  followUpReasons?: string[];
  /** Most-recent meaningful engagement (ISO 8601); set only with `worthFollowUp`. */
  followUpAt?: string;
}

export function publicUrlForSlug(slug: string): string {
  return `/h/${slug}`;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Compose the address line from a draft or a public payload's flat
 * fields. "123 Main St, Austin" — city appended when present.
 */
function composePropertyLine(
  address: string | undefined,
  city: string | undefined,
): string {
  return [nonEmpty(address), nonEmpty(city)].filter(Boolean).join(", ");
}

/**
 * Project a stored handout into a card summary. Reads ONLY from the
 * public payload (`record.data`) — which already excludes every private
 * draft field by construction (see toPublicPayload's allowlist).
 */
export function projectHandoutSummary(record: HandoutRecord): ServerPageSummary {
  const data = record.data as Record<string, unknown>;
  const property =
    data.property && typeof data.property === "object"
      ? (data.property as Record<string, unknown>)
      : undefined;
  const cover =
    nonEmpty(property?.heroPhotoUrl) ?? nonEmpty(data.heroPhotoUrl);
  const propertyLine = composePropertyLine(
    (nonEmpty(data.propertyAddress) ?? nonEmpty(property?.address)) as
      | string
      | undefined,
    nonEmpty(data.propertyCity),
  );
  return {
    slug: record.slug,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archived: Boolean(record.archived),
    cover,
    propertyLine,
    sellerLine: nonEmpty(data.preparedFor),
  };
}

/**
 * Derive the card fields (cover / lines) from a draft, preferring the
 * freshest local draft content over the last-published snapshot.
 */
function draftCardFields(draft: SellerPresentationDraft): {
  cover?: string;
  propertyLine: string;
  sellerLine?: string;
} {
  return {
    cover: nonEmpty(draft.heroPhotoUrl),
    propertyLine: composePropertyLine(draft.propertyAddress, draft.propertyCity),
    sellerLine: nonEmpty(draft.preparedFor),
  };
}

const UNTITLED = "Untitled page";

/**
 * Is the working draft ahead of the last published snapshot? True iff a
 * save landed after the most recent publish. `markPublished` stamps
 * `publishedAt === updatedAt`, so a freshly-published page is never
 * flagged; only a LATER edit trips this.
 */
export function hasPendingEdits(
  instance: WorkflowInstance<SellerPresentationDraft>,
): boolean {
  if (!instance.publishedAt) return false;
  // ISO 8601 strings compare lexicographically == chronologically.
  return instance.timestamps.updatedAt > instance.publishedAt;
}

export interface MergeInput {
  /** This agent's published handouts, already owner-scoped server-side. Excludes revoked. */
  serverPages: ServerPageSummary[];
  /** All localStorage workflow instances (any skill, any owner). */
  instances: WorkflowInstance<SellerPresentationDraft>[];
  /** Lowercased session email used to scope the DRAFT slice. */
  sessionEmail: string | null;
}

/**
 * Reconcile local drafts with server-published pages into one ordered
 * (most-recent-first) list of cards.
 *
 * Rules:
 *   - A local SP instance owned by the session, with a `publishedSlug`
 *     that matches a server page, is the Live/edits-pending/archived
 *     card for that page (and consumes the server entry).
 *   - A local SP instance with no published slug (or a stale one) is a
 *     Draft — or Archived if locally archived.
 *   - A server page with no matching local instance (published from
 *     another device, or a legacy publish) is a standalone Live/Archived
 *     card with no Continue/Open affordance (no local draft to resume).
 */
export function mergePages(input: MergeInput): PageCard[] {
  const { serverPages, instances, sessionEmail } = input;
  const email = sessionEmail ? sessionEmail.toLowerCase() : null;

  const serverBySlug = new Map<string, ServerPageSummary>();
  for (const page of serverPages) serverBySlug.set(page.slug, page);

  const consumed = new Set<string>();
  const cards: PageCard[] = [];

  // Owner-scoped, seller-presentation-only local instances.
  const mine = instances.filter(
    (i) =>
      i.skillId === SELLER_PRESENTATION_SKILL_ID &&
      !!email &&
      i.ownerEmail?.toLowerCase() === email,
  );

  for (const instance of mine) {
    const fields = draftCardFields(instance.draft);
    const serverPage = instance.publishedSlug
      ? serverBySlug.get(instance.publishedSlug)
      : undefined;

    if (instance.publishedSlug && serverPage) {
      consumed.add(instance.publishedSlug);
      const status: PageStatus = serverPage.archived
        ? "archived"
        : hasPendingEdits(instance)
          ? "live-edits-pending"
          : "live";
      cards.push({
        key: instance.instanceId,
        status,
        instanceId: instance.instanceId,
        slug: instance.publishedSlug,
        publicUrl: publicUrlForSlug(instance.publishedSlug),
        cover: fields.cover ?? serverPage.cover,
        propertyLine: fields.propertyLine || serverPage.propertyLine || UNTITLED,
        sellerLine: fields.sellerLine ?? serverPage.sellerLine,
        updatedAt: instance.timestamps.updatedAt,
        // Archive bumped the server record's updatedAt, so it is the best
        // "archived at" signal for an instance-backed published page.
        archivedAt: status === "archived" ? serverPage.updatedAt : undefined,
        viewCount: serverPage.viewCount,
        lastViewedAt: serverPage.lastViewedAt,
        returnedAfterReveal: serverPage.returnedAfterReveal,
        watchedVideo: serverPage.watchedVideo,
        readToEnd: serverPage.readToEnd,
        lingered: serverPage.lingered,
        worthFollowUp: serverPage.worthFollowUp,
        followUpReasons: serverPage.followUpReasons,
        followUpAt: serverPage.followUpAt,
      });
      continue;
    }

    // No live server page backs this instance: it's a Draft (a stale
    // publishedSlug whose page was revoked/deleted reads as a Draft too)
    // — or Archived if the agent archived the draft locally.
    cards.push({
      key: instance.instanceId,
      status: instance.archivedAt ? "archived" : "draft",
      instanceId: instance.instanceId,
      cover: fields.cover,
      propertyLine: fields.propertyLine || UNTITLED,
      sellerLine: fields.sellerLine,
      updatedAt: instance.timestamps.updatedAt,
      archivedAt: instance.archivedAt,
    });
  }

  // Server pages with no local instance to back them.
  for (const page of serverPages) {
    if (consumed.has(page.slug)) continue;
    cards.push({
      key: page.slug,
      status: page.archived ? "archived" : "live",
      slug: page.slug,
      publicUrl: publicUrlForSlug(page.slug),
      cover: page.cover,
      propertyLine: page.propertyLine || UNTITLED,
      sellerLine: page.sellerLine,
      updatedAt: page.updatedAt,
      archivedAt: page.archived ? page.updatedAt : undefined,
      viewCount: page.viewCount,
      lastViewedAt: page.lastViewedAt,
      returnedAfterReveal: page.returnedAfterReveal,
      watchedVideo: page.watchedVideo,
      readToEnd: page.readToEnd,
      lingered: page.lingered,
      worthFollowUp: page.worthFollowUp,
      followUpReasons: page.followUpReasons,
      followUpAt: page.followUpAt,
    });
  }

  // Most-recent-first.
  cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return cards;
}

/**
 * Count Live pages toward the cap. Only published, non-archived pages
 * count — Drafts and Archived are free. Edits-pending pages ARE still
 * live (published), so they count.
 *
 * Computed from the SERVER summaries (authoritative + agent-scoped), not
 * the merged client cards, so the meter is independent of localStorage.
 */
export function countLivePages(serverPages: ServerPageSummary[]): number {
  return serverPages.filter((p) => !p.archived).length;
}

/**
 * Viewed signal (Phase 3) — how many merged cards are "worth a follow-up", for
 * the calm count on the Pages header ("N worth a follow-up"). PURE. Counts the
 * `worthFollowUp` cards the route flagged under VIEWED_SIGNAL_NUDGE_ENABLED, so
 * a flag-off list yields 0 and the header shows nothing (byte-identical).
 */
export function countWorthFollowUp(cards: PageCard[]): number {
  return cards.filter((c) => c.worthFollowUp).length;
}

/**
 * The SINGLE enforcement seam (SP-LIB). Returns whether a new live page
 * would exceed the cap. PRE-BILLING: callers use this ONLY to show the
 * soft at-limit banner — they do NOT block. When billing lands, the
 * publish/create gate flips to consult this one function. Never tightens
 * on existing users: it's a >= boundary check, nothing more.
 */
export function isAtOrOverLiveCap(liveCount: number, cap: number): boolean {
  return liveCount >= cap;
}

// ===========================================================================
// Library v2 — organization + management (SP-LIB-2).
//
// Pure derivations for the Active/Archived tabs, "duplicate is always a fresh
// Draft", and the bulk-action validity rules. Kept here (no React) so the
// component and the unit tests share one source of truth — same discipline as
// mergePages above.
// ===========================================================================

/** The two library views. Active = Draft + Live (+ edits-pending); Archived = archived only. */
export type LibraryTab = "active" | "archived";

/** A card belongs to the Archived tab iff its derived status is "archived". */
export function isArchivedCard(card: PageCard): boolean {
  return card.status === "archived";
}

/**
 * Split the merged cards into the tab the agent is viewing.
 *
 *   - Active  → every non-archived card, kept in mergePages' most-recent-
 *     activity order. Archiving moves a card OUT of this list (it becomes
 *     archived), so an archive can never bump an item to the top of Active.
 *   - Archived → only archived cards, ordered most-recently-archived first
 *     (by `archivedAt`, falling back to `updatedAt` for any card that
 *     somehow lacks the stamp).
 */
export function filterByTab(cards: PageCard[], tab: LibraryTab): PageCard[] {
  if (tab === "archived") {
    return cards
      .filter(isArchivedCard)
      .sort((a, b) =>
        (b.archivedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.updatedAt),
      );
  }
  return cards.filter((c) => !isArchivedCard(c));
}

/** Per-tab counts for the segmented toggle. */
export function tabCounts(cards: PageCard[]): { active: number; archived: number } {
  let archived = 0;
  for (const card of cards) if (isArchivedCard(card)) archived += 1;
  return { active: cards.length - archived, archived };
}

const DUPLICATE_FALLBACK_NAME = "page";

/**
 * Build the draft for a duplicate. Deep-clones the source content (comps,
 * photos, pitch, by-the-numbers, everything) so the copy shares NO references
 * with the original, then prefixes the address with "Copy of " so the new
 * card is unmistakable in the library.
 *
 * Publish state is NOT a draft field — `publishedSlug` / `publishedAt` live on
 * the WorkflowInstance, and `createInstance` never sets them — so a duplicate
 * built from this draft is always a fresh, unpublished Draft with no slug. The
 * original's published page and seller link are never touched.
 */
export function buildDuplicateDraft(
  source: SellerPresentationDraft,
): SellerPresentationDraft {
  const clone = JSON.parse(JSON.stringify(source)) as SellerPresentationDraft;
  const base = nonEmpty(source.propertyAddress) ?? DUPLICATE_FALLBACK_NAME;
  clone.propertyAddress = `Copy of ${base}`;
  return clone;
}

/**
 * Which bulk actions are valid for a selection (mirrors the single-card
 * rules). Archive is valid on Draft + Live (reversible); Restore (un-archive)
 * is valid only when EVERY selected item is archived; Delete is valid on
 * Draft + Archived only, NEVER on a Live page (a live page must be archived
 * first so we can never delete one a seller is actively viewing).
 *
 * Cockpit fix P2 — the bulk toolbar renders CONTEXTUALLY off these flags: it
 * shows ONLY the actions valid for the current selection and never a greyed /
 * disabled control (a greyed Delete on a live selection reads as broken). The
 * `*Reason` strings are retained for callers that still want to explain a
 * single-card block, but the bulk bar no longer renders an invalid action at
 * all. The validity rules themselves are unchanged — only the UI moved from
 * "show + disable" to "show only when valid".
 */
export interface BulkValidity {
  canArchive: boolean;
  archiveReason?: string;
  /** Un-archive every selected page (Archived tab). Valid iff ALL are archived. */
  canRestore: boolean;
  canDelete: boolean;
  deleteReason?: string;
}

export function bulkActionValidity(selected: PageCard[]): BulkValidity {
  if (selected.length === 0) {
    return { canArchive: false, canRestore: false, canDelete: false };
  }
  const hasArchived = selected.some((c) => c.status === "archived");
  const hasLive = selected.some(
    (c) => c.status === "live" || c.status === "live-edits-pending",
  );
  // Restore only makes sense when the WHOLE selection is archived (un-archive
  // back to Active); a draft/live page has nothing to restore.
  const allArchived = selected.every((c) => c.status === "archived");
  return {
    canArchive: !hasArchived,
    archiveReason: hasArchived
      ? "Some selected pages are already archived"
      : undefined,
    canRestore: allArchived,
    canDelete: !hasLive,
    deleteReason: hasLive ? "Archive live pages before deleting" : undefined,
  };
}

// ===========================================================================
// Library v3 — Cards / List view (SP-LIB-3).
//
// A compact List view for scanning many pages on a small screen. Everything
// here is pure derivation: which view to default to (by viewport), the ordered
// set of secondary actions a row's "⋯" menu exposes (a projection of the SAME
// rules the cards enforce — never a second rule set), and the row's meta line.
// The component stays a thin shell that wires these to the SHARED card action
// handlers; see PagesLibrary.tsx.
// ===========================================================================

/** The two ways the library can render its pages. */
export type ViewMode = "cards" | "list";

/** localStorage key for the per-device Cards/List preference. */
export const VIEW_MODE_STORAGE_KEY = "sep-library-view-mode";

/**
 * Viewport width (px) at or below which the library defaults to List. Phones
 * and small tablets get the dense scan view; wider screens get Cards. Only the
 * DEFAULT keys off this — once the agent toggles explicitly, their saved choice
 * wins on every width.
 */
export const LIBRARY_MOBILE_MAX_WIDTH = 768;

/** Type guard: is this a stored value we recognize as a ViewMode? */
export function isViewMode(value: unknown): value is ViewMode {
  return value === "cards" || value === "list";
}

/**
 * Resolve the view to show. An explicit saved choice always wins (it overrides
 * the viewport default). With no valid saved choice, fall back to the
 * viewport default: List on mobile widths, Cards otherwise. PURE — the caller
 * reads localStorage + window.innerWidth in an effect (never during render, to
 * stay hydration-safe) and passes them in.
 *
 * PAGES_LIBRARY_V3 (Pass 3a) — when `mobileCardsOnly` is true, List becomes
 * desktop-only: at mobile widths the library is ALWAYS Cards, regardless of a
 * saved (desktop-set) preference. The preference is still honored on desktop
 * (and preserved in storage), so a user who chose List keeps List on the wide
 * screen and gets the dense Cards scan on the phone. Default false ⇒ today's
 * behavior, byte-identical.
 */
export function resolveViewMode(
  saved: string | null,
  viewportWidth: number,
  mobileCardsOnly = false,
): ViewMode {
  if (mobileCardsOnly && viewportWidth <= LIBRARY_MOBILE_MAX_WIDTH) {
    return "cards";
  }
  if (isViewMode(saved)) return saved;
  return viewportWidth <= LIBRARY_MOBILE_MAX_WIDTH ? "list" : "cards";
}

/**
 * The ordered secondary actions a row's "⋯" menu exposes for a card. This is a
 * PROJECTION of the exact same rules the cards enforce, NOT a second rule set:
 * the row's primary tap maps to the card's primary button (Open / Continue /
 * Restore), and this list is precisely the card's remaining (non-primary)
 * buttons, in the same order:
 *   - update-live  iff edits-pending AND a local draft backs it
 *   - view-live + copy-link  iff Live (or edits-pending)
 *   - archive      iff not already archived (Restore is the row-tap primary)
 *   - duplicate    iff a local draft backs it
 *   - delete       iff Draft or Archived (never Live)
 */
export type RowAction =
  | "mark-followed-up"
  | "update-live"
  | "view-live"
  | "copy-link"
  | "archive"
  | "duplicate"
  | "delete";

export function secondaryRowActions(card: PageCard): RowAction[] {
  const isArchived = card.status === "archived";
  const isLive = card.status === "live" || card.status === "live-edits-pending";
  const isPending = card.status === "live-edits-pending";
  const isDraft = card.status === "draft";
  const canResume = !!card.instanceId;
  const canDelete = isDraft || isArchived;

  const actions: RowAction[] = [];
  // Phase 3 — the advisory dismiss leads the menu when the page is worth a
  // follow-up (only ever set under VIEWED_SIGNAL_NUDGE_ENABLED), so a flag-off
  // row's menu is byte-identical.
  if (card.worthFollowUp) actions.push("mark-followed-up");
  if (isPending && canResume) actions.push("update-live");
  if (isLive) {
    actions.push("view-live");
    actions.push("copy-link");
  }
  if (!isArchived) actions.push("archive");
  if (canResume) actions.push("duplicate");
  if (canDelete) actions.push("delete");
  return actions;
}

/**
 * PAGES_CARD_EXPAND (Pass 2) — the destructive / housekeeping actions that live
 * behind the EXPANDED mobile card's "⋯" overflow, never on its collapsed face.
 * Decision 5: the overflow holds ONLY archive / duplicate / delete; the primary
 * workflow actions (Open, View live, Copy link, Mark as followed up, Update live)
 * are never hidden behind the dots. PURE, and a FILTER of `secondaryRowActions`
 * (not a second rule set), so the overflow can never drift from the row menu —
 * it shows the same archive/duplicate/delete the row already validated, in order.
 */
export const CARD_OVERFLOW_ACTIONS: readonly RowAction[] = [
  "archive",
  "duplicate",
  "delete",
];

export function cardOverflowActions(card: PageCard): RowAction[] {
  return secondaryRowActions(card).filter((a) =>
    CARD_OVERFLOW_ACTIONS.includes(a),
  );
}

/**
 * PAGES_CARD_EXPAND (Pass 2) — the workflow actions revealed INLINE when an
 * expandable card is expanded: everything `secondaryRowActions` exposes except
 * the overflow subset above. The primary (Open / Continue / Restore) is separate
 * (it stays on the collapsed face), so this is purely the non-primary, non-
 * overflow set: mark-followed-up, update-live, view-live, copy-link. PURE.
 */
export function cardExpandedInlineActions(card: PageCard): RowAction[] {
  return secondaryRowActions(card).filter(
    (a) => !CARD_OVERFLOW_ACTIONS.includes(a),
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * A coarse "2 days ago" style relative label. PURE — `nowMs` is passed in so
 * the component supplies Date.now() and tests stay deterministic. Future times
 * (clock skew) read as "just now".
 */
export function relativeTimeAgo(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = nowMs - then;
  if (diff < MINUTE_MS) return "just now";
  const pick = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (diff < HOUR_MS) return pick(Math.floor(diff / MINUTE_MS), "minute");
  if (diff < DAY_MS) return pick(Math.floor(diff / HOUR_MS), "hour");
  if (diff < WEEK_MS) return pick(Math.floor(diff / DAY_MS), "day");
  if (diff < MONTH_MS) return pick(Math.floor(diff / WEEK_MS), "week");
  if (diff < YEAR_MS) return pick(Math.floor(diff / MONTH_MS), "month");
  return pick(Math.floor(diff / YEAR_MS), "year");
}

// ===========================================================================
// Library v4 — list polish: long-press select + cross-device tap (SP-LIB-4).
//
// Pure constants + a movement helper for the long-press-to-select gesture, kept
// here (no React, no DOM) so the timing/threshold are one source of truth the
// component wires and the unit tests pin. The hook itself (pointer wiring,
// guarded haptics) lives in PagesLibrary.tsx; only the numbers + geometry are
// pure.
// ===========================================================================

/** How long a touch must be held (ms) before it enters select mode. */
export const LONG_PRESS_MS = 450;

/**
 * How far (px, per-axis) a touch may drift before it is treated as a scroll /
 * drag and the pending long-press is cancelled. Keeps a normal scroll from ever
 * tripping select mode.
 */
export const LONG_PRESS_MOVE_CANCEL_PX = 10;

/**
 * Has the pointer moved far enough from its start to count as a scroll/drag
 * (and thus cancel a pending long-press)? Per-axis box test — cheaper than a
 * hypot and indistinguishable at this threshold. PURE so the cancel rule is
 * unit-pinned independent of any DOM event plumbing.
 */
export function movedBeyond(
  startX: number,
  startY: number,
  x: number,
  y: number,
  threshold: number = LONG_PRESS_MOVE_CANCEL_PX,
): boolean {
  return Math.abs(x - startX) > threshold || Math.abs(y - startY) > threshold;
}

// ===========================================================================
// Cockpit fix P1 — portaled "⋯" overflow-menu placement (SP-LIB).
//
// The overflow menu is portaled to the library root and positioned `fixed`. Its
// placement is PURE geometry — trigger rect + measured menu size + viewport —
// kept here (no DOM) so the component wires it and the unit tests pin it: the
// menu can never hang off-screen no matter where the trigger sits (an expanded
// card's "⋯" can be mid-row, not just at a row's right edge).
// ===========================================================================

/** The bits of the trigger's bounding rect the menu placement needs. */
export interface MenuTriggerRect {
  top: number;
  bottom: number;
  right: number;
}

/** The viewport-fixed top/left the menu is clamped to. */
export interface MenuCoords {
  top: number;
  left: number;
}

/** Keep the menu at least this far from every viewport edge. */
export const MENU_VIEWPORT_MARGIN = 8;

/**
 * Clamp the menu fully inside the viewport from its trigger rect + measured size.
 * Horizontally it right-aligns to the trigger, then shifts in from either edge;
 * vertically it opens 6px below the trigger, FLIPS above when it would overflow
 * the bottom (and there is room above), and otherwise pins to the bottom margin.
 * So the menu is always fully on-screen on both axes regardless of where the
 * trigger sits. PURE — the component passes `getBoundingClientRect()` +
 * `offsetWidth/Height` + `innerWidth/Height`; the tests pass plain numbers.
 */
export function clampMenuCoords(
  trigger: MenuTriggerRect,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number = MENU_VIEWPORT_MARGIN,
): MenuCoords {
  let left = Math.min(
    trigger.right - menuWidth,
    viewportWidth - menuWidth - margin,
  );
  left = Math.max(margin, left);

  let top = trigger.bottom + 6;
  if (top + menuHeight > viewportHeight - margin) {
    const above = trigger.top - 6 - menuHeight;
    top = above >= margin ? above : Math.max(margin, viewportHeight - menuHeight - margin);
  }
  return { top, left };
}

// ===========================================================================
// Library v5 — manual drag-to-reorder (SP-LIB-5 / PAGES_REORDER_ENABLED).
//
// The agent can arrange the ACTIVE tab into a custom order by dragging (List
// view). That order is owner-scoped and persisted SERVER-side (so it follows
// the agent across devices, now that drafts are server-sourced — SP-KEYSTONE),
// and applies as the Active list's default order in BOTH Cards and List.
//
// Everything here is PURE: the order is a plain list of card KEYS (the same
// `card.key` mergePages mints — instanceId when a local/server draft backs the
// card, else the slug), and `applyManualOrder` projects that key list onto the
// live card set. Archived is never manually ordered (it stays most-recently-
// archived-first via filterByTab). Kept here, no React/KV/DOM, so the route,
// the client, and the unit tests share one implementation.
// ===========================================================================

/** localStorage key mirroring the server order — an offline fallback only. */
export const PAGES_ORDER_CACHE_KEY = "sep-pages-order";

/**
 * Coerce an untrusted value (KV blob, request body, cached string) into a
 * clean key list: an array of non-empty strings, de-duplicated (first wins),
 * with everything else dropped. PURE — the store, the route, and the client
 * all funnel through this so a corrupt order can never crash a render or
 * persist garbage. A non-array yields [].
 */
export function sanitizePageOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Apply a manual key order to the ACTIVE cards. Cards whose key is in `order`
 * sort by their position there; cards NOT in `order` (a brand-new page, or one
 * just restored from Archived) keep their incoming order — which mergePages /
 * filterByTab already sort most-recent-first — and sit ON TOP. This is what
 * makes the two stated slotting rules fall out for free:
 *   - New page  → its key isn't in the order yet ⇒ top.
 *   - Restore   → archiving removed its key from the order (see the component),
 *                 so a restored page is "unknown" again ⇒ top.
 *   - Archive   → the card leaves the Active set entirely (it's archived).
 *
 * Stable + total: never drops or duplicates a card, and a stale key in `order`
 * (its card archived/deleted) is simply skipped. PURE — `order` comes from the
 * server (owner-scoped), the cards from the merge.
 */
export function applyManualOrder(cards: PageCard[], order: string[]): PageCard[] {
  if (order.length === 0) return cards;
  const rank = new Map<string, number>();
  order.forEach((key, i) => rank.set(key, i));
  const known: PageCard[] = [];
  const unknown: PageCard[] = [];
  for (const card of cards) {
    (rank.has(card.key) ? known : unknown).push(card);
  }
  known.sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
  return [...unknown, ...known];
}

/**
 * Does this card's primary tap have nowhere to go because it was published from
 * another device (no local draft to resume)? Such a page reads as Live but has
 * no `instanceId`, so Open/Continue is disabled. Tapping it must explain the
 * cross-device limit and surface the actions that DO work (View live, Copy
 * link) rather than silently no-op. Archived pages restore server-side, so they
 * are never in this state. PURE — the component branches its tap on this.
 */
export function isCrossDeviceOnly(card: PageCard): boolean {
  const isLive = card.status === "live" || card.status === "live-edits-pending";
  return isLive && !card.instanceId;
}

/**
 * Viewed signal (Phase 1) — the calm engagement label for a live card, or
 * undefined when the page has not been opened (or the flag is off, so no view
 * fields are populated). PURE; the chip and the meta line both read it so the
 * voice never drifts. Operations-partner tone, no hype:
 *   - returned after the reveal → "Returned" (the strongest buying signal)
 *   - otherwise opened          → "Opened · 2h ago" (recency via relativeTimeAgo)
 * The repeat-open count is rendered separately (the meta line appends "N views").
 *
 * The route always populates `lastViewedAt` / `returnedAfterReveal` alongside
 * `viewCount` (deriveViewSignal sets all three together), so a `viewCount`
 * WITHOUT a `lastViewedAt` — a legacy / unreachable shape — yields no label and
 * the meta line falls back to the pre-phase "N views" exactly.
 */
export function viewSignalLabel(card: PageCard, nowMs: number): string | undefined {
  if (typeof card.viewCount !== "number" || card.viewCount < 1) return undefined;
  if (card.returnedAfterReveal) return "Returned";
  if (card.lastViewedAt) {
    return `Opened · ${relativeTimeAgo(card.lastViewedAt, nowMs)}`;
  }
  return undefined;
}

/**
 * Viewed signal (Phase 2) — the quiet, concrete engagement facts for a card,
 * PRIORITIZED and CAPPED so the chip stays a glance. PURE; the cards view and
 * the List meta line both read it so the voice never drifts.
 *
 * Returned-after-reveal (the strongest signal) is already the status LABEL
 * (`viewSignalLabel` → "Returned"), so this returns only the depth facts, in
 * priority order: watched video > read to end > lingered. Capped at `max`
 * (default 2) — never the whole list, never a raw dwell number. Empty when the
 * page has no engagement fields (flag-off / Phase-1 card), so those surfaces are
 * byte-identical.
 */
export function viewEngagementFacts(card: PageCard, max = 2): string[] {
  const facts: string[] = [];
  if (card.watchedVideo) facts.push("Watched your video");
  if (card.readToEnd) facts.push("Read to the end");
  if (card.lingered) facts.push("Spent time reading");
  return max >= 0 ? facts.slice(0, max) : facts;
}

/**
 * Viewed signal (Phase 3) — the calm advisory marker for a card, or undefined
 * when the page is not worth a follow-up (or the flag is off, so `worthFollowUp`
 * is never set). PURE; the cards view and the List meta line both read it so the
 * voice never drifts. Operations-partner tone, no hype, no urgency:
 *   "Worth a follow-up · Watched your video · Read to the end"
 * The reasons are the route-computed, prioritized list, capped to `maxReasons`
 * (default 2) so the marker stays a glance. With no reasons it is still a quiet
 * "Worth a follow-up" (the count never lies), never a red badge or an alarm.
 */
export function followUpMarkerLabel(
  card: PageCard,
  maxReasons = 2,
): string | undefined {
  if (!card.worthFollowUp) return undefined;
  const reasons = (card.followUpReasons ?? []).slice(
    0,
    Math.max(0, maxReasons),
  );
  return ["Worth a follow-up", ...reasons].join(" · ");
}

/**
 * The row's secondary meta line (the status chip is rendered separately):
 *   - Draft     → "Started X ago"
 *   - Archived  → "Archived X ago" (by archivedAt, falling back to updatedAt)
 *   - Live / edits-pending → "seller · Opened 2h ago · N views", whichever parts
 *     exist; with none (no seller, page not yet opened) → "Live X ago".
 *
 * The viewed-signal parts (Opened / Returned, then the count) only appear when
 * the pages route populated them under VIEWED_SIGNAL_ENABLED, so a flag-off card
 * (no view fields) is byte-identical to before this phase.
 */
export function listMetaLine(card: PageCard, nowMs: number): string {
  if (card.status === "draft") {
    return `Started ${relativeTimeAgo(card.updatedAt, nowMs)}`;
  }
  if (card.status === "archived") {
    return `Archived ${relativeTimeAgo(card.archivedAt ?? card.updatedAt, nowMs)}`;
  }
  const parts: string[] = [];
  if (card.sellerLine) parts.push(card.sellerLine);
  const engagement = viewSignalLabel(card, nowMs);
  if (engagement) parts.push(engagement);
  if (typeof card.viewCount === "number") {
    parts.push(`${card.viewCount} ${card.viewCount === 1 ? "view" : "views"}`);
  }
  // Phase 2 — append the SINGLE strongest engagement fact in the dense List
  // line (the cards view shows up to 2 on a secondary line). Empty on a flag-off
  // card, so the line stays byte-identical to Phase 1.
  parts.push(...viewEngagementFacts(card, 1));
  // Phase 3 — a single quiet "Worth a follow-up" token in the dense List line
  // (the cards view shows the reasons too). Only set under the nudge flag, so a
  // flag-off line stays byte-identical to Phase 1/2.
  if (card.worthFollowUp) parts.push("Worth a follow-up");
  if (parts.length === 0) return `Live ${relativeTimeAgo(card.updatedAt, nowMs)}`;
  return parts.join(" · ");
}

// ===========================================================================
// Library v2 cockpit (PAGES_LIBRARY_V2).
//
// "Your pages" becomes the agent's seller-activity cockpit: a pinned "Worth a
// follow-up" group at the top (recency-sorted), the rest under "Active pages"
// in the agent's existing order, de-duplicated card signal lines (a card never
// shows the same fact twice), and a calm, non-alarming usage line. Everything
// here is PURE so the component stays a thin shell and the unit tests pin the
// behavior — same discipline as the rest of this module. All of it is inert
// unless the component is rendered under the flag, so a flag-off library is
// byte-identical to today.
// ===========================================================================

/**
 * Rank a follow-up card's strongest signal for the group tiebreak: returned
 * after the reveal (strongest) < watched/read < merely opened. Lower sorts
 * earlier. Recency is the primary key; this only breaks ties. PURE.
 */
function followUpSignalRank(card: PageCard): number {
  if (card.returnedAfterReveal) return 0;
  if (card.watchedVideo || card.readToEnd) return 1;
  return 2;
}

/**
 * Sort the "Worth a follow-up" group by MOST-RECENT meaningful engagement first
 * (`followUpAt`, the route-computed timestamp of the newest qualifying session),
 * breaking ties by signal strength (returned > watched/read > opened) then by
 * key for a stable, total order. Non-mutating. PURE.
 */
export function sortFollowUpGroup(cards: PageCard[]): PageCard[] {
  return [...cards].sort((a, b) => {
    // Most-recent first (a missing stamp sorts last).
    const byRecency = (b.followUpAt ?? "").localeCompare(a.followUpAt ?? "");
    if (byRecency !== 0) return byRecency;
    const byStrength = followUpSignalRank(a) - followUpSignalRank(b);
    if (byStrength !== 0) return byStrength;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Split the ACTIVE cards into the pinned "Worth a follow-up" group and the rest.
 * The group is every card the route flagged `worthFollowUp`, recency-sorted; the
 * rest KEEP their incoming order (the agent's manual order, or most-recent-first)
 * untouched. A card never lands in both. PURE — the cockpit grouping the
 * component renders. On a flag-off / no-nudge list the group is empty and every
 * card stays in `rest`, so the structure collapses to today's single list.
 */
export function splitFollowUp(cards: PageCard[]): {
  followUp: PageCard[];
  rest: PageCard[];
} {
  const followUp: PageCard[] = [];
  const rest: PageCard[] = [];
  for (const card of cards) {
    (card.worthFollowUp ? followUp : rest).push(card);
  }
  return { followUp: sortFollowUpGroup(followUp), rest };
}

/** The calm subline under the "Worth a follow-up" group heading. PURE. */
export function followUpSubline(count: number): string {
  return `${count} ${count === 1 ? "seller" : "sellers"} recently engaged with their page`;
}

/**
 * The de-duplicated signal lines a V2 cockpit CARD shows, so no fact ever
 * appears twice. PURE; the cards view reads this so the voice never drifts.
 *
 *   - Follow-up card (worthFollowUp): `marker` leads with the action state
 *     ("Worth a follow-up · <reasons>"), and `context` is a single muted line of
 *     recency + repeat-opens ("Opened · 2h ago · 3 views"). It deliberately
 *     OMITS the engagement facts (the marker owns them as reasons) and the
 *     "Returned" label (already a reason), so the card never says one thing
 *     twice.
 *   - Non-follow-up live card: no `marker`; `context` leads with the opened/
 *     returned status + count and AT MOST ONE engagement fact.
 *   - Draft / archived / never-opened: both undefined (the status chip + meta
 *     line elsewhere carry those).
 */
export interface CardSignal {
  marker?: string;
  context?: string;
}

export function cardSignal(card: PageCard, nowMs: number): CardSignal {
  if (typeof card.viewCount !== "number" || card.viewCount < 1) return {};
  const countLabel = `${card.viewCount} ${card.viewCount === 1 ? "view" : "views"}`;

  if (card.worthFollowUp) {
    // Recency context only — the marker already carries the meaningful reasons.
    const recency = card.lastViewedAt
      ? `Opened · ${relativeTimeAgo(card.lastViewedAt, nowMs)}`
      : undefined;
    const context = [recency, countLabel].filter(Boolean).join(" · ");
    return { marker: followUpMarkerLabel(card), context: context || undefined };
  }

  // Non-follow-up live card: status + count + a single engagement fact.
  const parts = [
    viewSignalLabel(card, nowMs),
    countLabel,
    ...viewEngagementFacts(card, 1),
  ].filter(Boolean);
  return { context: parts.length > 0 ? parts.join(" · ") : undefined };
}

// ===========================================================================
// Library v3 cockpit polish — card hierarchy (PAGES_LIBRARY_V3, Pass 3a).
//
// Pass 3a gives every card ONE clear lead by mode (follow-up / live / draft),
// with the action-first hierarchy: address anchor (strongest), lead state (the
// decision point), reason said ONCE (neutral), supporting context (muted). The
// MODE drives visual weight in CSS (weight/size/spacing + neutral-muted tone —
// no accent; that is 3b); the projection below is the three-tier text. PURE so
// the desktop card and the collapsed mobile card share one source of truth and
// the unit tests pin it. Inert unless the component renders under the flag, so a
// flag-off card is byte-identical to the V2 (Pass 1/2) card.
// ===========================================================================

/**
 * The card's hierarchy mode — the one idea the card leads with. Follow-up (the
 * work) and live (activity) only ever differ on a published page; a draft leads
 * with "Draft", an archived card with "Archived". `worthFollowUp` is route-set
 * only under the nudge flag, so a flag-off published page is always "live".
 */
export type CardMode = "follow-up" | "live" | "draft" | "archived";

export function cardMode(card: PageCard): CardMode {
  if (card.status === "archived") return "archived";
  if (card.status === "draft") return "draft";
  // live / live-edits-pending: the work (a recent meaningful engagement) leads
  // over plain activity.
  return card.worthFollowUp ? "follow-up" : "live";
}

/**
 * The three-tier card lead (Pass 3a). One clear lead per mode, then the reason
 * said ONCE, then muted context — never the same fact twice. PURE; both the
 * desktop card and the collapsed mobile card read it so the hierarchy never
 * drifts. Built on the SAME view-signal helpers as `cardSignal`, just split
 * across three tiers instead of one de-duplicated line:
 *
 *   - Follow-up: lead "Worth a follow-up"; reason = the prioritized reasons
 *     (capped, neutral); context = recency + repeat-opens ("Opened · 2h ago ·
 *     3 views"). The reason owns the engagement facts, so context omits them.
 *   - Live (opened): lead = the opened/returned status; reason = the single
 *     strongest engagement fact (if any); context = the repeat-open count.
 *   - Draft / archived / never-opened: empty — the status chip + the primary
 *     action carry the state, no signal lines.
 */
export interface CardLead {
  /** The decision-point line — the single strongest state after the address. */
  lead?: string;
  /** The reason, said ONCE, in a neutral voice. */
  reason?: string;
  /** Muted supporting context (recency + repeat-opens). */
  context?: string;
}

export function cardLead(card: PageCard, nowMs: number): CardLead {
  const countLabel =
    typeof card.viewCount === "number" && card.viewCount >= 1
      ? `${card.viewCount} ${card.viewCount === 1 ? "view" : "views"}`
      : undefined;

  const mode = cardMode(card);

  if (mode === "follow-up") {
    const reasons = (card.followUpReasons ?? []).slice(0, 2);
    const recency = card.lastViewedAt
      ? `Opened · ${relativeTimeAgo(card.lastViewedAt, nowMs)}`
      : undefined;
    return {
      lead: "Worth a follow-up",
      reason: reasons.length ? reasons.join(" · ") : undefined,
      context: [recency, countLabel].filter(Boolean).join(" · ") || undefined,
    };
  }

  if (mode === "live") {
    // Only an OPENED live page has a lead to show; an unopened one leans on its
    // "Live" chip + primary, same as a draft (no signal lines).
    if (!countLabel) return {};
    return {
      lead: viewSignalLabel(card, nowMs),
      reason: viewEngagementFacts(card, 1)[0],
      context: countLabel,
    };
  }

  // draft / archived: the chip + the primary action carry the state.
  return {};
}

/**
 * The calm usage meter line for the V2 header. PURE. Only LIVE pages count
 * (drafts + archived are free), and the cap is SHOWN, not enforced (pre-
 * billing) — so an over-cap agent gets a plain, non-alarming "N live pages ·
 * plan limit M", NEVER an alarming "68 of 25". Under the cap it keeps the
 * familiar "N of M live". Undefined when there is no cap to show.
 */
export function usageMeterLabel(
  liveCount: number,
  cap: number,
): string | undefined {
  if (cap <= 0) return undefined;
  if (liveCount > cap) {
    return `${liveCount} live ${liveCount === 1 ? "page" : "pages"} · plan limit ${cap}`;
  }
  return `${liveCount} of ${cap} live`;
}

// ===========================================================================
// Management List (PAGES_MANAGE_LIST, Packet 1) — the dense sortable table.
//
// V3 keeps Cards as the primary operating view; "Manage" is an opt-in, desktop-
// only management surface that renders this columnar table over the SAME already-
// loaded cards (no new fetch). Everything here is PURE — the column set, the
// per-column comparators, the stable sort, and the empty-graceful cell text — so
// the component stays a thin shell and the unit tests pin the behavior, exactly
// like the rest of this module. Inert unless the component renders under the
// flag, so a flag-off library is byte-identical to today's V3 cockpit. Bulk
// select / checkboxes are deliberately OUT of scope (Packet 2).
// ===========================================================================

/** The placeholder a management-List cell shows when its optional field is empty. */
export const MANAGE_EMPTY = "—";

/**
 * The sortable management-List columns. "actions" is a 7th column but is not
 * sortable (it holds the per-row Open / Copy link / More controls), so it is
 * tracked in MANAGE_LIST_COLUMNS, not here.
 */
export type ManageSortColumn =
  | "address"
  | "client"
  | "state"
  | "lastActivity"
  | "followUp"
  | "updated";

export type SortDir = "asc" | "desc";

export interface ManageSort {
  column: ManageSortColumn;
  dir: SortDir;
}

/**
 * One management-List column. `key` is the sort key (or "actions" for the non-
 * sortable Actions column); `accent` marks the ONE column that earns the teal
 * next-action accent (consistent with 3b: teal = the follow-up signal only).
 * The component renders headers + cells straight off this list, and the source-
 * contract test asserts the exact 7 columns + their order, so the table can
 * never silently drift.
 */
export interface ManageColumn {
  key: ManageSortColumn | "actions";
  label: string;
  sortable: boolean;
  accent?: boolean;
  /** Column width as a table percentage (the table is `table-layout: fixed`,
   *  so cells truncate within these instead of the table overflowing). */
  width: string;
}

export const MANAGE_LIST_COLUMNS: readonly ManageColumn[] = [
  { key: "address", label: "Address", sortable: true, width: "20%" },
  { key: "client", label: "Client", sortable: true, width: "15%" },
  { key: "state", label: "State", sortable: true, width: "9%" },
  { key: "lastActivity", label: "Last activity", sortable: true, width: "12%" },
  { key: "followUp", label: "Follow-up", sortable: true, accent: true, width: "12%" },
  { key: "updated", label: "Updated", sortable: true, width: "10%" },
  { key: "actions", label: "Actions", sortable: false, width: "18%" },
];

/**
 * PAGES_MANAGE_LIST (Packet 2) — the width of the leading bulk-select checkbox
 * column in the Manage table. It is NOT a data column (no sort key, no
 * comparator), so it lives beside MANAGE_LIST_COLUMNS rather than in it — but
 * the colgroup still has ONE source of truth for every column width, keeping the
 * `table-layout: fixed` grid intact. The 7 data columns now sum to 96% (Address
 * trimmed 24%→20%) so this 4% leading column lands the total back at 100%.
 */
export const MANAGE_SELECT_COLUMN_WIDTH = "4%";

/**
 * PAGES_MANAGE_LIST (Packet 2) — the header select-all checkbox's tri-state for
 * a rendered set of rows: "none" (unchecked), "all" (every row selected), or
 * "some" (indeterminate). Pure so the source-contract spec can pin it without a
 * browser. An empty set reads "none" (the UI leaves the header unchecked).
 * Keyed by `card.key` into the SAME `selected` Set the cards use, so selection
 * is view-agnostic across Cards / List / table.
 */
export function selectAllState(
  rowKeys: readonly string[],
  selected: ReadonlySet<string>,
): "none" | "some" | "all" {
  if (rowKeys.length === 0) return "none";
  let count = 0;
  for (const key of rowKeys) if (selected.has(key)) count += 1;
  if (count === 0) return "none";
  if (count === rowKeys.length) return "all";
  return "some";
}

/** The table opens on most-recently-updated first — today's base ordering. */
export const DEFAULT_MANAGE_SORT: ManageSort = { column: "updated", dir: "desc" };

/**
 * A fresh column starts on its most useful direction: time columns (and the
 * follow-up signal) lead with the newest / strongest first (desc); the text +
 * status columns read top-down alphabetically (asc). Re-clicking the active
 * column flips this (see the component's toggle).
 */
export function defaultDirFor(column: ManageSortColumn): SortDir {
  return column === "lastActivity" ||
    column === "updated" ||
    column === "followUp"
    ? "desc"
    : "asc";
}

/**
 * "Last activity" sort key — the most-recent meaningful timestamp, with the
 * pinned fallback chain: the follow-up engagement, else the last open, else the
 * last publish/update (always present). PURE. This is the SORT key only; the
 * column DISPLAYS `lastViewedAt` (a dash when never opened) via
 * `manageLastActivityText`, so an unopened page still sorts sanely by `updatedAt`
 * while reading as empty.
 */
export function lastActivityAt(card: PageCard): string {
  return card.followUpAt ?? card.lastViewedAt ?? card.updatedAt;
}

/**
 * Status sort rank — most-active first: live, then edits-pending, draft, and
 * archived last. A deliberate semantic order (not alphabetical), so sorting
 * "State" groups the live listings the agent works on at the top.
 */
const STATUS_SORT_RANK: Record<PageStatus, number> = {
  live: 0,
  "live-edits-pending": 1,
  draft: 2,
  archived: 3,
};

/** Follow-up sort: worth-a-follow-up pages outrank the rest, then by recency. */
function compareFollowUp(a: PageCard, b: PageCard): number {
  const aw = a.worthFollowUp ? 1 : 0;
  const bw = b.worthFollowUp ? 1 : 0;
  if (aw !== bw) return aw - bw;
  return (a.followUpAt ?? "").localeCompare(b.followUpAt ?? "");
}

/**
 * The ascending comparison for a single column (negative ⇒ a sorts before b).
 * Strings + ISO timestamps compare with localeCompare; "State" uses the semantic
 * rank above; "Last activity" uses the pinned fallback chain; "Follow-up" leads
 * with the nudge flag then recency. PURE — direction + the stable tiebreak are
 * applied by `sortManageList`.
 */
function compareByColumn(
  a: PageCard,
  b: PageCard,
  column: ManageSortColumn,
): number {
  switch (column) {
    case "address":
      return a.propertyLine.localeCompare(b.propertyLine);
    case "client":
      return (a.sellerLine ?? "").localeCompare(b.sellerLine ?? "");
    case "state":
      return STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    case "lastActivity":
      return lastActivityAt(a).localeCompare(lastActivityAt(b));
    case "followUp":
      return compareFollowUp(a, b);
    case "updated":
      return a.updatedAt.localeCompare(b.updatedAt);
  }
}

/**
 * Sort the already-loaded cards for the management table. Non-mutating, stable,
 * and TOTAL: the chosen column drives the order (asc/desc), and a `key`
 * tiebreak — ALWAYS ascending, regardless of `dir` — makes the result fully
 * deterministic (equal-on-column rows never shuffle between renders). PURE; the
 * comparator runs over the cards the library already holds, never a new fetch.
 */
export function sortManageList(
  cards: PageCard[],
  { column, dir }: ManageSort,
): PageCard[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    const primary = compareByColumn(a, b, column) * factor;
    if (primary !== 0) return primary;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Toggle the sort on a header click: re-clicking the active column flips its
 * direction; clicking a new column adopts that column on its natural default
 * direction (`defaultDirFor`). PURE — the component holds the `ManageSort` state
 * and calls this. Returns a NEW object (never mutates the input).
 */
export function nextManageSort(
  current: ManageSort,
  column: ManageSortColumn,
): ManageSort {
  if (current.column === column) {
    return { column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { column, dir: defaultDirFor(column) };
}

// ── empty-graceful cell text (the optional / flag-gated columns) ──
// Client (`sellerLine`), Last activity (`lastViewedAt`), and Follow-up
// (`worthFollowUp`/`followUpAt`) are only populated under the VIEWED_SIGNAL_*
// nudge flags, so on a flag-off / unopened page they are absent. Each helper
// returns an intentional `MANAGE_EMPTY` dash rather than a blank, so the table
// reads as deliberately empty, never broken. PURE; the component renders these
// verbatim and the unit tests pin the empty + populated shapes.

/** Client column — the prepared-for seller line, or the empty dash. */
export function manageClientText(card: PageCard): string {
  return card.sellerLine ?? MANAGE_EMPTY;
}

/**
 * Last-activity column — the last open as a relative label, or the empty dash
 * when the page has not been opened (or the viewed-signal flag is off). The SORT
 * still uses `lastActivityAt`'s `updatedAt` fallback, so an unopened page reads
 * empty here yet keeps a sane position.
 */
export function manageLastActivityText(card: PageCard, nowMs: number): string {
  return card.lastViewedAt
    ? relativeTimeAgo(card.lastViewedAt, nowMs)
    : MANAGE_EMPTY;
}

/**
 * Follow-up column (the ONE accented column) — when the page is worth a follow-
 * up, the recency of the qualifying engagement (or a plain "Worth a follow-up"
 * when no stamp is set); otherwise the empty dash. Only ever non-empty under the
 * nudge flag, so a flag-off column is all dashes (intentional, not broken).
 */
export function manageFollowUpText(card: PageCard, nowMs: number): string {
  if (!card.worthFollowUp) return MANAGE_EMPTY;
  return card.followUpAt
    ? relativeTimeAgo(card.followUpAt, nowMs)
    : "Worth a follow-up";
}

/** Updated column — the last publish/update as a relative label (always present). */
export function manageUpdatedText(card: PageCard, nowMs: number): string {
  return relativeTimeAgo(card.updatedAt, nowMs);
}
