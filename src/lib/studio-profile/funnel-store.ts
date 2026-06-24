/**
 * Studio Profile funnel — server-side KV store (Slice 1).
 *
 * Append-only, owner-scoped event log under `studio:funnel:<email>`. The same
 * KV substrate + bounded-tail posture as the onboarding funnel store; kept in
 * its own namespace so it never races with the onboarding, publish, or
 * page-view writes. No PII beyond the owner key (the agent's own email).
 */
import { kv } from "@vercel/kv";
import type { StudioFunnelEvent } from "./events";

export const STUDIO_FUNNEL_CAP = 200;

function funnelKey(email: string): string {
  return `studio:funnel:${email.toLowerCase()}`;
}

/**
 * Append one event to the owner's funnel log, newest last, capped. The only
 * side effect is the KV read+write; the route stamps `at` before calling.
 */
export async function appendStudioEvent(
  email: string,
  event: StudioFunnelEvent,
): Promise<void> {
  const key = funnelKey(email);
  const existing = (await kv.get<StudioFunnelEvent[]>(key)) ?? [];
  const next = [...existing, event];
  const trimmed =
    next.length > STUDIO_FUNNEL_CAP
      ? next.slice(next.length - STUDIO_FUNNEL_CAP)
      : next;
  await kv.set(key, trimmed);
}

/** Read the owner's funnel log (newest last). Empty when none. */
export async function readStudioFunnel(
  email: string,
): Promise<StudioFunnelEvent[]> {
  return (await kv.get<StudioFunnelEvent[]>(funnelKey(email))) ?? [];
}
