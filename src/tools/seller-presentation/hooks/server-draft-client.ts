"use client";

import type { WorkflowInstance } from "@/skills/workflow-instance";
import type { SellerPresentationDraft } from "@/tools/seller-presentation/engine/types";

/**
 * Thin client transport for the server draft routes (SP-KEYSTONE).
 *
 * One small async surface over /api/seller-presentation/drafts so the editor
 * hook + the library never hand-roll fetch wiring. Every function:
 *   - is owner-scoped on the SERVER (these just carry the session cookie),
 *   - returns null / a falsy result on any non-OK response instead of
 *     throwing, so a caller can always fall back to the local cache and never
 *     lose work to a transient network blip (gate 1: never lose a draft).
 *
 * The full WorkflowInstance round-trips (unlike the publish path's
 * allowlisted payload) — a draft must come back whole so the agent can keep
 * editing it on another device.
 */

type Instance = WorkflowInstance<SellerPresentationDraft>;

const BASE = "/api/seller-presentation/drafts";

/** GET one draft by id. null = missing / not-owned (404) / network error. */
export async function fetchServerDraft(id: string): Promise<Instance | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      instance?: Instance;
    };
    if (!body.ok || !body.instance) return null;
    return body.instance;
  } catch {
    return null;
  }
}

/**
 * GET this agent's full draft list. null = the request FAILED (offline /
 * server error) — distinct from an empty array, which means "you own no
 * drafts." Callers MUST treat null as "unknown, fall back to local cache"
 * and an empty array as "authoritatively none," never conflating the two
 * (conflating them would make migration think the server is empty and is the
 * kind of thing that loses drafts).
 */
export async function fetchServerDrafts(): Promise<Instance[] | null> {
  try {
    const res = await fetch(BASE, { credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      drafts?: Instance[];
    };
    if (!body.ok || !Array.isArray(body.drafts)) return null;
    return body.drafts;
  } catch {
    return null;
  }
}

export interface PutDraftResult {
  ok: boolean;
  /** The server's stored copy (owner stamped) when ok. */
  instance?: Instance;
  /** True only for a transport/5xx failure the caller should retry. */
  retryable?: boolean;
}

/**
 * Idempotent upsert of a draft (create / autosave / migration push). Keyed
 * server-side by instanceId, so a retry after a flaky save never duplicates.
 * A 4xx (malformed / not-owned) is NOT retryable; a network error or 5xx is.
 */
export async function putServerDraft(instance: Instance): Promise<PutDraftResult> {
  try {
    const res = await fetch(BASE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ instance }),
    });
    if (!res.ok) {
      return { ok: false, retryable: res.status >= 500 };
    }
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      instance?: Instance;
    };
    if (!body.ok) return { ok: false, retryable: false };
    return { ok: true, instance: body.instance };
  } catch {
    // Network failure — the work is safe in the local cache; signal retry.
    return { ok: false, retryable: true };
  }
}

/** DELETE a draft by id. Returns whether the server confirmed removal. */
export async function deleteServerDraft(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return Boolean(body.ok);
  } catch {
    return false;
  }
}
