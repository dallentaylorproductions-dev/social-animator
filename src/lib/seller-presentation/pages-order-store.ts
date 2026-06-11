/**
 * Server-side per-owner PAGE ORDER store (SP-LIB-5, PAGES_REORDER_ENABLED).
 *
 * The agent's manually-arranged order for the "Your pages" Active tab. It is
 * the keystone-era complement to the server draft store (draft-store.ts): now
 * that drafts live server-side and a draft's `instanceId` is stable across
 * devices, a single owner-scoped order list can follow the agent everywhere.
 *
 *   user:<email>:sep-pages-order  →  JSON array of card KEYS (instanceId | slug)
 *
 * The order is a plain list of `card.key` strings (see pages-library.ts) — it
 * names cards, it does not store them. A key whose card no longer exists is
 * harmless: `applyManualOrder` skips it. We persist the WHOLE list on each
 * reorder (idempotent overwrite), so there is no per-key mutation to race.
 *
 * ONE absolute gate, identical in shape to the draft store's: never cross
 * agents. The key is namespaced by the AUTHENTICATED session email (lowercased,
 * never trusted from the client body), so an agent can only ever read or write
 * THEIR OWN order. There is no cross-owner read path to leak — the namespace is
 * the scope. The order carries no private content (only keys the agent already
 * sees in their own library), but it is still owner-private and gated the same.
 *
 * The KV touch is thin; the only real logic — coercing an untrusted blob into a
 * clean key list — is the PURE `sanitizePageOrder` in pages-library.ts, shared
 * with the route + client so a corrupt order can never be stored or rendered.
 */

import { kv } from "@vercel/kv";
import { sanitizePageOrder } from "./pages-library";

function orderKey(ownerEmail: string): string {
  return `user:${ownerEmail.toLowerCase()}:sep-pages-order`;
}

/**
 * This agent's saved page order, or [] when none is stored yet (or the stored
 * value is somehow corrupt). Owner-scoped by the namespaced key — it can only
 * read the caller's own order.
 */
export async function getOwnedPageOrder(email: string): Promise<string[]> {
  const raw = await kv.get<unknown>(orderKey(email));
  return sanitizePageOrder(raw);
}

/**
 * Replace this agent's page order with `order` (idempotent overwrite). The
 * incoming list is sanitized first, so only a clean key list is ever persisted.
 * Returns the stored (sanitized) list so the caller can re-sync its local copy.
 */
export async function putOwnedPageOrder(
  email: string,
  order: unknown,
): Promise<string[]> {
  const clean = sanitizePageOrder(order);
  await kv.set(orderKey(email), clean);
  return clean;
}
