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
  /** Reserved — view counts are not tracked yet, so this is omitted today. */
  viewCount?: number;
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
 * rules). Archive is valid on Draft + Live (reversible); Delete is valid on
 * Draft + Archived only, NEVER on a Live page (a live page must be archived
 * first so we can never delete one a seller is actively viewing). If the
 * selection contains an item ineligible for an action, that action is disabled
 * with a short reason rather than partially applied — predictable over clever.
 */
export interface BulkValidity {
  canArchive: boolean;
  archiveReason?: string;
  canDelete: boolean;
  deleteReason?: string;
}

export function bulkActionValidity(selected: PageCard[]): BulkValidity {
  if (selected.length === 0) {
    return { canArchive: false, canDelete: false };
  }
  const hasArchived = selected.some((c) => c.status === "archived");
  const hasLive = selected.some(
    (c) => c.status === "live" || c.status === "live-edits-pending",
  );
  return {
    canArchive: !hasArchived,
    archiveReason: hasArchived
      ? "Some selected pages are already archived"
      : undefined,
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
 */
export function resolveViewMode(
  saved: string | null,
  viewportWidth: number,
): ViewMode {
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
 * The row's secondary meta line (the status chip is rendered separately):
 *   - Draft     → "Started X ago"
 *   - Archived  → "Archived X ago" (by archivedAt, falling back to updatedAt)
 *   - Live / edits-pending → "seller · N views", whichever parts exist; with
 *     neither (no seller, views not yet tracked) → "Live X ago".
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
  if (typeof card.viewCount === "number") {
    parts.push(`${card.viewCount} ${card.viewCount === 1 ? "view" : "views"}`);
  }
  if (parts.length === 0) return `Live ${relativeTimeAgo(card.updatedAt, nowMs)}`;
  return parts.join(" · ");
}
