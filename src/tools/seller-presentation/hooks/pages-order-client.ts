"use client";

/**
 * Thin client transport for the page-order route (SP-LIB-5).
 *
 * One small async surface over /api/seller-presentation/pages-order so the
 * library never hand-rolls fetch wiring. Both functions:
 *   - are owner-scoped on the SERVER (these just carry the session cookie),
 *   - return null on any non-OK response instead of throwing, so the caller
 *     can fall back to its localStorage cache and a transient blip never
 *     drops the agent's custom arrangement.
 */

const BASE = "/api/seller-presentation/pages-order";

/** GET this agent's saved order. null = request failed (fall back to cache). */
export async function fetchPageOrder(): Promise<string[] | null> {
  try {
    const res = await fetch(BASE, { credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      order?: string[];
    };
    if (!body.ok || !Array.isArray(body.order)) return null;
    return body.order;
  } catch {
    return null;
  }
}

/**
 * Replace the saved order with `order` (one debounced write per reorder).
 * Idempotent overwrite server-side. Returns whether the server confirmed.
 */
export async function putPageOrder(order: string[]): Promise<boolean> {
  try {
    const res = await fetch(BASE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ order }),
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return Boolean(body.ok);
  } catch {
    return false;
  }
}
