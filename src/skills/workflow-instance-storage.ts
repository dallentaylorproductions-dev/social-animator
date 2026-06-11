"use client";

import { generateId } from "@/lib/ids";
import type { SkillId } from "./types";
import type {
  WorkflowInstance,
  WorkflowInstanceResolvedPrimitives,
  WorkflowInstanceValidation,
} from "./workflow-instance";

/**
 * Per-record localStorage for WorkflowInstances (Substrate §9.5,
 * v1.47 / A3).
 *
 * Two-key storage shape — chosen over the single-blob shape used by
 * `src/lib/client-profile.ts` because (a) per-skill drafts can grow
 * large (SP draft may carry many comps + per-comp confidence maps +
 * pitch points), making whole-map rewrites on every keystroke
 * wasteful, and (b) per-id reads matter for the dashboard's
 * "resume the workflow at id=X" surface that later commits add.
 *
 *   workflowInstance:<instanceId>  →  WorkflowInstance JSON record
 *   workflowInstance:index         →  string[] of all known instanceIds
 *
 * The index is for listing only; the records are the source of truth.
 * Self-healing: if an index entry points at a missing record (which
 * can happen if the user manually nukes a record via devtools), the
 * lister silently drops the dangling id from its return value. If a
 * record exists without an index entry, `saveInstance` adds it on the
 * next write.
 *
 * Coexists with the legacy `*:draft` per-tool keys
 * (sellerIntelligenceReport:draft, openHousePrep:draft, …). No
 * migration in v1.47.
 *
 * SSR-safe. Every reader/writer checks `typeof window === 'undefined'`
 * and returns a safe default off-browser. The "use client" directive
 * is for any future React consumer that imports from this module;
 * the module itself contains no hooks.
 */

const RECORD_PREFIX = "workflowInstance:";
const INDEX_KEY = "workflowInstance:index";

function recordKey(instanceId: string): string {
  return `${RECORD_PREFIX}${instanceId}`;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readIndex(): string[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / storage-disabled
  }
}

function addToIndex(instanceId: string): void {
  const current = readIndex();
  if (current.includes(instanceId)) return;
  writeIndex([...current, instanceId]);
}

function removeFromIndex(instanceId: string): void {
  const current = readIndex();
  const next = current.filter((id) => id !== instanceId);
  if (next.length === current.length) return;
  writeIndex(next);
}

/**
 * Best-effort runtime guard for the persisted record shape. We don't
 * validate `draft` (opaque per-skill) or the cached `validation`
 * snapshot (A4 owns that shape) — just check that the structural
 * fields are present and well-typed. A failing check is treated as a
 * corrupt record (load returns null).
 */
function isWorkflowInstanceShape(raw: unknown): raw is WorkflowInstance {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.instanceId !== "string" || r.instanceId.length === 0) return false;
  if (typeof r.skillId !== "string" || r.skillId.length === 0) return false;
  if (!r.timestamps || typeof r.timestamps !== "object") return false;
  const ts = r.timestamps as Record<string, unknown>;
  if (typeof ts.createdAt !== "string") return false;
  if (typeof ts.updatedAt !== "string") return false;
  if (!r.resolvedPrimitives || typeof r.resolvedPrimitives !== "object") {
    return false;
  }
  return true;
}

export interface CreateInstanceInput<TDraft> {
  skillId: SkillId;
  draft: TDraft;
  resolvedPrimitives?: WorkflowInstanceResolvedPrimitives;
  currentStep?: string;
  validation?: WorkflowInstanceValidation;
  /**
   * SP-LIB — lowercased owner email, stamped from the server session so
   * the "Your pages" library can scope DRAFT cards to the authenticated
   * agent. Optional; omitting it leaves the instance unowned (and thus
   * invisible to the library, the safe default).
   */
  ownerEmail?: string;
}

/**
 * Mint + persist a new WorkflowInstance. instanceId is auto-assigned;
 * createdAt + updatedAt are stamped to now; lastOpenedAt / completedAt
 * stay unset (the wizard sets those explicitly). Adds to the index.
 *
 * Returns the materialized record so the caller has the instanceId
 * immediately.
 */
export function createInstance<TDraft>(
  input: CreateInstanceInput<TDraft>,
): WorkflowInstance<TDraft> {
  const now = new Date().toISOString();
  const record: WorkflowInstance<TDraft> = {
    instanceId: generateId("workflow"),
    skillId: input.skillId,
    draft: input.draft,
    resolvedPrimitives: input.resolvedPrimitives ?? {},
    currentStep: input.currentStep,
    validation: input.validation,
    timestamps: { createdAt: now, updatedAt: now },
    // SP-LIB — stamp owner from the (lowercased) session email when the
    // caller supplies it. Normalize here so the library's scope check
    // (`ownerEmail === session.email.toLowerCase()`) is a plain string
    // compare regardless of how the caller cased it.
    ownerEmail: input.ownerEmail ? input.ownerEmail.toLowerCase() : undefined,
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(recordKey(record.instanceId), JSON.stringify(record));
      addToIndex(record.instanceId);
    } catch {
      // ignore quota / storage-disabled; in-memory record is still returned
    }
  }
  return record;
}

/**
 * Load a single instance by id. Returns null for missing or corrupt
 * records; never throws. The caller specifies the expected draft
 * shape via the generic param — this is an unchecked narrowing at
 * the persistence boundary (the storage layer never inspects `draft`).
 */
export function loadInstance<TDraft = unknown>(
  instanceId: string,
): WorkflowInstance<TDraft> | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(recordKey(instanceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isWorkflowInstanceShape(parsed)) return null;
    return parsed as WorkflowInstance<TDraft>;
  } catch {
    return null;
  }
}

/**
 * Persist an existing instance. Bumps `updatedAt` to now and
 * preserves the caller's `createdAt`, `lastOpenedAt`, `completedAt`
 * as-is (those are set explicitly elsewhere — see `markOpened` for
 * lastOpenedAt; completedAt is wizard-controlled). Self-heals the
 * index: if the id isn't there yet, it's added.
 *
 * Returns the persisted record so callers can mirror the bumped
 * `updatedAt` into their in-memory state without a round-trip
 * through `loadInstance` (same pattern as `saveListingProfile`).
 */
export function saveInstance<TDraft>(
  instance: WorkflowInstance<TDraft>,
): WorkflowInstance<TDraft> {
  const persisted: WorkflowInstance<TDraft> = {
    ...instance,
    timestamps: {
      ...instance.timestamps,
      updatedAt: new Date().toISOString(),
    },
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(recordKey(persisted.instanceId), JSON.stringify(persisted));
      addToIndex(persisted.instanceId);
    } catch {
      // ignore quota / storage-disabled
    }
  }
  return persisted;
}

/**
 * SP-KEYSTONE — write a record into the local store VERBATIM, without
 * bumping `updatedAt`. This is the optimistic-cache primitive for the
 * server-drafts path: when the editor loads the authoritative server copy
 * (or pushes one), it mirrors that exact record into localStorage so the
 * device has an offline/crash fallback that matches the server byte-for-byte
 * (`saveInstance` can't be used for this — it would advance `updatedAt` and
 * desync the cache from the server's last-write-wins clock). Adds to the
 * index. No-op off-browser. Returns the record it wrote.
 */
export function cacheInstance<TDraft>(
  instance: WorkflowInstance<TDraft>,
): WorkflowInstance<TDraft> {
  if (hasStorage()) {
    try {
      window.localStorage.setItem(recordKey(instance.instanceId), JSON.stringify(instance));
      addToIndex(instance.instanceId);
    } catch {
      // ignore quota / storage-disabled
    }
  }
  return instance;
}

/**
 * Stamp `lastOpenedAt` to now and persist. The wizard calls this when
 * the agent re-opens an instance; it's distinct from `saveInstance`
 * (which fires on every keystroke during a session) so the dashboard
 * has a stable "last walked away from" signal.
 *
 * No-op + returns null if the instance doesn't exist.
 */
export function markOpened<TDraft = unknown>(
  instanceId: string,
): WorkflowInstance<TDraft> | null {
  const existing = loadInstance<TDraft>(instanceId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const persisted: WorkflowInstance<TDraft> = {
    ...existing,
    timestamps: {
      ...existing.timestamps,
      lastOpenedAt: now,
      updatedAt: now,
    },
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(recordKey(persisted.instanceId), JSON.stringify(persisted));
      addToIndex(persisted.instanceId);
    } catch {
      // ignore quota / storage-disabled
    }
  }
  return persisted;
}

/**
 * SP-LIB — record a successful publish onto the instance. Stamps
 * `publishedSlug` (the /h/<slug> the seller now sees) and `publishedAt`,
 * and bumps `updatedAt` to the SAME timestamp so the freshly-published
 * page is never mis-derived as "Live · edits pending" (which is
 * `updatedAt > publishedAt`). A later draft edit bumps `updatedAt` past
 * `publishedAt` and the pending state lights up — exactly the signal the
 * library needs so an agent never assumes the seller sees unpublished
 * edits.
 *
 * No-op + returns null if the instance doesn't exist (e.g. published from
 * a device whose localStorage was cleared). Mirror of `markOpened`.
 */
export function markPublished<TDraft = unknown>(
  instanceId: string,
  slug: string,
): WorkflowInstance<TDraft> | null {
  const existing = loadInstance<TDraft>(instanceId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const persisted: WorkflowInstance<TDraft> = {
    ...existing,
    publishedSlug: slug,
    publishedAt: now,
    timestamps: {
      ...existing.timestamps,
      updatedAt: now,
    },
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(recordKey(persisted.instanceId), JSON.stringify(persisted));
      addToIndex(persisted.instanceId);
    } catch {
      // ignore quota / storage-disabled
    }
  }
  return persisted;
}

/**
 * SP-LIB — set or clear the local archive flag on an instance (used for
 * DRAFT cards; published-page archival is a server handout mutation so
 * the public page stops serving). `archived: true` stamps `archivedAt`
 * to now; `false` clears it (restore). Does NOT bump `updatedAt` — an
 * archive/restore is library bookkeeping, not a draft edit, and bumping
 * it would falsely trip the edits-pending derivation on a Live card.
 *
 * No-op + returns null if the instance doesn't exist.
 */
export function setInstanceArchived<TDraft = unknown>(
  instanceId: string,
  archived: boolean,
): WorkflowInstance<TDraft> | null {
  const existing = loadInstance<TDraft>(instanceId);
  if (!existing) return null;
  const persisted: WorkflowInstance<TDraft> = {
    ...existing,
    archivedAt: archived ? new Date().toISOString() : undefined,
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(recordKey(persisted.instanceId), JSON.stringify(persisted));
      addToIndex(persisted.instanceId);
    } catch {
      // ignore quota / storage-disabled
    }
  }
  return persisted;
}

/**
 * List every instance the index points at, in index order. Silently
 * drops index entries whose record doesn't load (self-healing — see
 * the file header). Returns `WorkflowInstance<unknown>[]`; callers
 * filter by `skillId` and narrow per-skill.
 */
export function listInstances(): WorkflowInstance[] {
  const ids = readIndex();
  const out: WorkflowInstance[] = [];
  for (const id of ids) {
    const record = loadInstance(id);
    if (record) out.push(record);
  }
  return out;
}

/**
 * Just the ids. Cheaper than `listInstances` when the caller doesn't
 * need to read every record (e.g., a count, or a "does an instance for
 * this skill exist?" pre-check that loads one record).
 */
export function listInstanceIds(): string[] {
  return readIndex();
}

/**
 * The most recent IN-PROGRESS instance for a given skill, or null if
 * none. "In-progress" = `timestamps.completedAt` is unset — same
 * convention the per-skill runtime uses to derive
 * `SkillStatus.state === 'complete'`.
 *
 * Sort: `timestamps.updatedAt` descending. ISO 8601 strings compare
 * lexicographically the same as chronologically, so `localeCompare`
 * suffices — no Date parsing required.
 *
 * Use case: the Seller Presentation wizard's mount effect calls this
 * when the URL has no `?id=`, so a dashboard-tile reopen resumes the
 * agent's in-progress draft instead of starting an empty one (v1.47 /
 * A6.1 bug fix). Caller's generic param narrows the per-skill draft
 * shape — same unchecked-cast boundary as `loadInstance<TDraft>`.
 */
export function findLatestInProgress<TDraft = unknown>(
  skillId: SkillId,
): WorkflowInstance<TDraft> | null {
  const all = listInstances();
  const candidates = all.filter(
    (i) => i.skillId === skillId && !i.timestamps.completedAt,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    b.timestamps.updatedAt.localeCompare(a.timestamps.updatedAt),
  );
  return candidates[0] as WorkflowInstance<TDraft>;
}

/**
 * Remove the record + the index entry. Returns true if the record
 * existed, false otherwise (mirror of `removeClient`'s contract).
 */
export function deleteInstance(instanceId: string): boolean {
  if (!hasStorage()) return false;
  const existed = window.localStorage.getItem(recordKey(instanceId)) !== null;
  try {
    window.localStorage.removeItem(recordKey(instanceId));
    removeFromIndex(instanceId);
  } catch {
    // ignore quota / storage-disabled
  }
  return existed;
}
