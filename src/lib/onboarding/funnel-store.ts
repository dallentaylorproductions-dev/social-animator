/**
 * Onboarding funnel - server-side KV store (Onboarding redesign, Pass 2).
 *
 * Append-only, owner-scoped event log under `onboarding:funnel:<email>`. The
 * same KV substrate the viewed-signal store uses; kept in its own namespace so
 * it never races with publish or page-view writes.
 *
 * Bounded: we keep the most recent ONBOARDING_FUNNEL_CAP events per agent (a
 * first run emits well under that). The tail is enough to reconstruct the
 * funnel - path chosen, time-to-first-preview, time-to-first-publish,
 * per-step drop-off - without unbounded growth.
 *
 * No PII beyond the owner key (the agent's own email, which already scopes
 * every other owner record). Event props are coarse: path, step, ok/thin.
 */
import { kv } from "@vercel/kv";
import type { OnboardingFunnelEvent } from "./events";

export const ONBOARDING_FUNNEL_CAP = 200;

function funnelKey(email: string): string {
  return `onboarding:funnel:${email.toLowerCase()}`;
}

/**
 * Append one event to the owner's funnel log, newest last, capped. Pure-ish:
 * the only side effect is the KV read+write; callers stamp nothing (the route
 * stamps `at` before calling).
 */
export async function appendOnboardingEvent(
  email: string,
  event: OnboardingFunnelEvent,
): Promise<void> {
  const key = funnelKey(email);
  const existing = (await kv.get<OnboardingFunnelEvent[]>(key)) ?? [];
  const next = [...existing, event];
  // Keep the most recent CAP - a runaway client can't grow the record.
  const trimmed =
    next.length > ONBOARDING_FUNNEL_CAP
      ? next.slice(next.length - ONBOARDING_FUNNEL_CAP)
      : next;
  await kv.set(key, trimmed);
}

/** Read the owner's funnel log (newest last). Empty when none. */
export async function readOnboardingFunnel(
  email: string,
): Promise<OnboardingFunnelEvent[]> {
  return (await kv.get<OnboardingFunnelEvent[]>(funnelKey(email))) ?? [];
}
