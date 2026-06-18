"use client";

/**
 * Onboarding funnel - client emitter (Onboarding redesign, Pass 2).
 *
 * Fire-and-forget. Reuses the viewed-signal beacon shape (navigator.sendBeacon
 * with a fetch+keepalive fallback) so a capture failure never blocks the
 * agent's flow and a slow network never stalls a step transition. The server
 * (POST /api/onboarding/event) is flag-gated and owner-scoped, so this is inert
 * when ONBOARDING_FIRST_RUN is off and can only ever write the caller's own
 * funnel.
 *
 * Naming + props live in events.ts (the shared vocabulary). This module only
 * does the transport.
 */
import { ONBOARDING_EVENTS, type OnboardingEventName } from "./events";

const ENDPOINT = "/api/onboarding/event";

/** Emit one funnel event. Never throws; never awaited by callers. */
export function emitOnboardingEvent(
  event: OnboardingEventName,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ event, props });
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      navigator.sendBeacon(
        ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
    } else {
      void fetch(ENDPOINT, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Best-effort: capture must never affect the flow.
  }
}

/** Convenience re-export so callers import one symbol for names + emit. */
export { ONBOARDING_EVENTS };
