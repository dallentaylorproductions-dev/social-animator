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
