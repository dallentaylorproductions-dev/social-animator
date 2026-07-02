/**
 * Buyer Tour Brief — client engagement transport (BUYER_TOUR_ANALYTICS).
 *
 * A tiny module-level singleton that any part of the buyer page can call to fire a
 * funnel event, WITHOUT threading props through the component tree. The design
 * guarantees the page is never affected by tracking:
 *
 *   • NO-OP UNTIL INITIALIZED. `trackEngagement` returns immediately unless
 *     `initEngagement` has run with `enabled: true`. So when BUYER_TOUR_ANALYTICS is
 *     off (the tracker island is never mounted, so init never runs), every call a
 *     component makes is a cheap no-op — components can call `trackEngagement`
 *     unconditionally and stay byte-identical whether the flag is on or off.
 *   • FIRE-AND-FORGET. Sends via `navigator.sendBeacon` (queued by the browser,
 *     survives page unload), falling back to `fetch(..., {keepalive:true})`. Both are
 *     wrapped in try/catch; a slow or down endpoint changes NOTHING. There is no
 *     await in any caller's path.
 *   • DEDUPED PER LOAD. Each meaningful step fires once per page load (one scroll must
 *     not spam `reached_comparison`); different homes count separately.
 *   • ANONYMOUS. A per-load random `sessionId` (crypto.randomUUID, in memory only —
 *     never persisted, never a cookie) is the only identifier. NO PII is sent.
 *   • DO NOT TRACK honored. If the browser signals DNT, no events are sent at all.
 */

import {
  dedupeKey,
  type BuyerTourEvent,
  type HomeLetter,
} from "../engine/engagement";

const TRACK_ENDPOINT = "/api/buyer-tour/track";

interface EngagementState {
  slug: string;
  sessionId: string;
  fired: Set<string>;
}

/** Module singleton. Null until `initEngagement` runs with a valid, enabled config. */
let state: EngagementState | null = null;

/** Respect Do Not Track — skip ALL sends when the browser signals it. */
function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return false;
  const dnt =
    (navigator as unknown as { doNotTrack?: string }).doNotTrack ??
    (typeof window !== "undefined"
      ? (window as unknown as { doNotTrack?: string }).doNotTrack
      : undefined);
  return dnt === "1" || dnt === "yes";
}

function makeSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // Extremely defensive fallback (shouldn't run in any modern browser). Shape-matches
  // a uuid so the server validator accepts it.
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/**
 * Initialize (or reset) the tracker for one page load. Called ONLY by the
 * `EngagementTracker` island, which is mounted ONLY when analytics is enabled. When
 * `enabled` is false, or DNT is on, or the slug is missing, the singleton stays null
 * and every `trackEngagement` call is a no-op.
 *
 * Returns whether tracking is active — the island uses this to decide whether to set
 * up its observers/listeners at all.
 */
export function initEngagement(opts: {
  slug: string | undefined;
  enabled: boolean;
}): boolean {
  if (!opts.enabled || !opts.slug || doNotTrack()) {
    state = null;
    return false;
  }
  state = { slug: opts.slug, sessionId: makeSessionId(), fired: new Set() };
  return true;
}

/** Tear down at unmount so a client-side navigation can't leak a stale session. */
export function resetEngagement(): void {
  state = null;
}

/**
 * Fire one funnel event, fire-and-forget. No-op unless initialized+enabled. Deduped
 * per load (per event, or per event+home for per-home events). Never throws, never
 * awaits into the caller.
 */
export function trackEngagement(
  event: BuyerTourEvent,
  homeLetter?: HomeLetter,
): void {
  const s = state;
  if (!s) return; // not initialized => analytics off / DNT => no-op

  const key = dedupeKey(event, homeLetter);
  if (s.fired.has(key)) return;
  s.fired.add(key);

  const payload = {
    tourSlug: s.slug,
    event,
    sessionId: s.sessionId,
    ts: Date.now(),
    ...(homeLetter ? { homeLetter } : {}),
  };

  send(payload);
}

function send(payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      // Send the JSON as a plain string (text/plain beacon). The route reads the body
      // with `req.json()`, which parses the text regardless of content-type, so this is
      // functionally identical to an application/json Blob — and, unlike a Blob, the
      // body stays inspectable (which lets the e2e assert the payload shape / no-PII).
      const queued = navigator.sendBeacon(TRACK_ENDPOINT, body);
      if (queued) return;
    }
  } catch {
    /* fall through to fetch */
  }
  // Fallback: keepalive fetch, still fire-and-forget (no await, errors swallowed).
  try {
    void fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw into the page */
  }
}
