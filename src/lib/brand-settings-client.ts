"use client";

import type { BrandSettings } from "@/lib/brand";

/**
 * Thin client transport for the brand-settings server route (mirrors
 * src/tools/seller-presentation/hooks/server-draft-client.ts).
 *
 * One small async surface over /api/brand-settings so the `useBrandSettings`
 * hook never hand-rolls fetch wiring. Every function:
 *   - is owner-scoped on the SERVER (these just carry the session cookie),
 *   - returns null / a falsy result on any non-OK response instead of throwing,
 *     so the caller can always fall back to the localStorage cache and never
 *     lose an edit to a transient network blip (or the flag being off → 503).
 */

const BASE = "/api/brand-settings";

export interface ServerBrandSettings {
  settings: BrandSettings;
  /** ISO 8601 — the server's stored edit time, for last-write-wins reconcile. */
  updatedAt: string;
}

export interface ServerBrandLoad {
  /** The authenticated owner email (lowercased), echoed by the load route. */
  email: string;
  /** The stored record, or null when the server authoritatively has NONE yet. */
  record: ServerBrandSettings | null;
}

/**
 * GET this agent's server brand settings.
 *   - returns `{ email, record }` when the request succeeds — `record` is the
 *     stored settings, or null when the server authoritatively has NONE yet
 *     (the migration's "nothing on server, push the owned local copy" signal).
 *     `email` is the authenticated owner, which the caller needs to gate the
 *     migration to only-already-owned settings.
 *   - returns null on ANY failure (offline / 503 flag-off / 401 anon / 5xx);
 *     the caller treats that the same as "use the local cache" and migrates
 *     nothing (no owner to scope to).
 *
 * Unlike drafts (where conflating "empty" with "offline" could lose a draft),
 * brand settings are a single record the local cache always still holds, so a
 * failed load loses nothing — it just defers the server sync.
 */
export async function fetchServerBrandSettings(): Promise<ServerBrandLoad | null> {
  try {
    const res = await fetch(BASE, { credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      email?: string;
      settings?: BrandSettings | null;
      updatedAt?: string;
    };
    if (!body.ok || typeof body.email !== "string" || body.email.length === 0) {
      return null;
    }
    const hasRecord =
      !!body.settings && typeof body.settings.agentName === "string";
    return {
      email: body.email,
      record: hasRecord
        ? {
            settings: body.settings as BrandSettings,
            updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : "",
          }
        : null,
    };
  } catch {
    return null;
  }
}

export interface PutBrandResult {
  ok: boolean;
  /** The server's stored copy (after last-write-wins) when ok. */
  record?: ServerBrandSettings;
  /** True only for a transport/5xx failure the caller should retry. */
  retryable?: boolean;
}

/**
 * Idempotent upsert of this agent's brand settings (autosave + migration push
 * both funnel through here). Keyed server-side by the owner email, so a retry
 * after a flaky save never duplicates. A 4xx (malformed / anon) is NOT
 * retryable; a network error or 5xx is. The returned `record` is the server's
 * post-LWW copy, so the caller can reconcile if a fresher edit won elsewhere.
 */
export async function putServerBrandSettings(
  settings: BrandSettings,
  updatedAt: string,
): Promise<PutBrandResult> {
  try {
    const res = await fetch(BASE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ settings, updatedAt }),
    });
    if (!res.ok) {
      return { ok: false, retryable: res.status >= 500 };
    }
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      settings?: BrandSettings;
      updatedAt?: string;
    };
    if (!body.ok || !body.settings) return { ok: false, retryable: false };
    return {
      ok: true,
      record: {
        settings: body.settings,
        updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : updatedAt,
      },
    };
  } catch {
    // Network failure — the edit is safe in the local cache; signal retry.
    return { ok: false, retryable: true };
  }
}
