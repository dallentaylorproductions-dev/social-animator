"use client";

/**
 * Studio Profile funnel — client emitter (Slice 1).
 *
 * Fire-and-forget, mirroring the onboarding emitter: navigator.sendBeacon with
 * a fetch+keepalive fallback, so a capture failure never blocks the guided flow
 * and a slow network never stalls a step transition. The server
 * (POST /api/studio-profile/event) is flag-gated by STUDIO_PROFILE_SETUP and
 * owner-scoped, so this is inert when the flag is off and can only ever write
 * the caller's own funnel.
 *
 * Naming lives in events.ts (the shared vocabulary); this module only does the
 * transport.
 */
import { STUDIO_EVENTS, type StudioEventName } from "./events";

const ENDPOINT = "/api/studio-profile/event";

/** Emit one funnel event. Never throws; never awaited by callers. */
export function emitStudioEvent(
  event: StudioEventName,
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
export { STUDIO_EVENTS };
