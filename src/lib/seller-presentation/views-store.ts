/**
 * Viewed signal (Phase 1) - per-page view store + pure derivation.
 *
 * The cheap, agent-only engagement layer for sent seller pages. A seller
 * opening a published /h/<slug> page fires one beacon per session
 * (PresentationPageMotion island) to POST /api/h/[slug]/view, which appends
 * here. Records live in their OWN KV namespace, `views:<slug>` - deliberately
 * NOT inside the `handout:<slug>` record - so a hot public-page write never
 * races a publish / edit / archive write on the handout, and the write path
 * stays a tiny O(1) read-modify-write.
 *
 * Privacy: this stores a count, two timestamps, and a bounded tail of
 * { at, opaque session id, afterReveal } only. No IP, no user-agent, no
 * identity, no cross-page profile. It is engagement on the agent's own page,
 * never surveillance of a person, and it is read back ONLY through the
 * auth-gated, owner-scoped pages route - never onto the seller's page.
 *
 * Everything that decides a count (session de-dupe, the reveal classification,
 * the recent cap) lives in the PURE `applyView` so the route, the unit tests,
 * and any future read path share one implementation and can never drift. The
 * KV wrappers (`recordView` / `getViews`) are the only impure surface.
 */

import { kv } from "@vercel/kv";

/** Newest-last bounded tail length. Keeps the record a few hundred bytes and the
 *  write O(1). Older entries age out; `count` / `firstViewedAt` are never lost. */
export const VIEWS_RECENT_CAP = 20;

/** One recorded open (de-duped per session). */
export interface PageViewEntry {
  /** ISO 8601 UTC - when this open was recorded (server clock). */
  at: string;
  /** Opaque per-session token from the beacon (sessionStorage). Never an identity. */
  sid: string;
  /** True iff this open happened AFTER the page's reveal (State A -> State B). */
  afterReveal: boolean;
  // ---- Phase 2 (engagement) - folded in by THIS session's later summary
  //      beacon (same sid). All optional + omitted-when-false, so a Phase-1
  //      entry (or a session that sent no summary) is byte-identical. ----
  /** The welcome video was played during this session. */
  videoPlayed?: boolean;
  /** The session scrolled through to the closing / CTA block. */
  reachedEnd?: boolean;
  /** Roughly how long the page was open this session (ms, clamped + coarse). */
  dwellMs?: number;
}

/** The persisted `views:<slug>` record. */
export interface PageViews {
  slug: string;
  /** Total opens, de-duped per session. */
  count: number;
  /** ISO 8601 UTC - first ever open. */
  firstViewedAt: string;
  /** ISO 8601 UTC - most recent open (drives "opened 2h ago"). */
  lastViewedAt: string;
  /** Bounded, newest-last tail. Drives the returned-after-reveal read. */
  recent: PageViewEntry[];
  // ---- Phase 2 (engagement) aggregate rollups - bounded scalars that SURVIVE
  //      the `recent` FIFO eviction, so "ever watched the video" stays true past
  //      VIEWS_RECENT_CAP sessions. All optional + omitted-when-false, so a
  //      Phase-1 record carries none of these and reads byte-identically. ----
  /** Any session ever played the welcome video. */
  everWatchedVideo?: boolean;
  /** Any session ever scrolled through to the closing / CTA block. */
  everReadToEnd?: boolean;
  /** The longest single-session dwell ever recorded (ms, clamped). */
  maxDwellMs?: number;
}

/**
 * Dwell at or above this (ms) reads as "spent time reading" - a meaningful
 * linger, not an accidental open-and-leave. 60s mirrors the scoping doc's
 * coarse >60s bucket; the raw number is NEVER surfaced, only this predicate.
 */
export const LINGER_DWELL_MS = 60_000;

/** Hard ceiling for a recorded dwell (ms) - a sane upper bound (24h) so a
 *  backgrounded-for-days tab or a tampered beacon can't store garbage. */
const MAX_DWELL_MS = 24 * 60 * 60 * 1000;

/**
 * Clamp a wire-supplied dwell to a finite, non-negative, bounded integer ms, or
 * undefined when it isn't a usable number. Defense-at-boundary: the beacon body
 * is untrusted.
 */
export function clampDwellMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.min(Math.floor(value), MAX_DWELL_MS);
}

/** The signal the agent surface reads. Pure projection of PageViews. Phase 1
 *  fields (opened / count / lastViewedAt / returnedAfterReveal) plus the Phase 2
 *  engagement predicates (always derivable; the route gates whether they reach
 *  the chip behind VIEWED_SIGNAL_ENGAGEMENT_ENABLED). */
export interface ViewSignal {
  /** count > 0. */
  opened: boolean;
  /** Repeat-open count across sessions. */
  count: number;
  /** ISO 8601 UTC of the most recent open, iff opened. */
  lastViewedAt?: string;
  /** Any retained open stamped after the reveal - the strongest buying signal. */
  returnedAfterReveal: boolean;
  // ---- Phase 2 engagement predicates (derived from the aggregate rollups). ----
  /** Ever played the welcome video. */
  watchedVideo: boolean;
  /** Ever scrolled through to the closing / CTA. */
  readToEnd: boolean;
  /** Lingered: the longest session dwell met LINGER_DWELL_MS. */
  lingered: boolean;
}

function viewsKey(slug: string): string {
  return `views:${slug}`;
}

/**
 * Lightweight bot / link-unfurl guard. The JS beacon already skips non-JS
 * crawlers (they never run the island), so this is a backstop for headless
 * fetchers + the link preview bots (iMessage, Slack, WhatsApp, Discord, etc.)
 * that DO execute scripts or hit the route directly. Conservative by design:
 * a real mobile Safari / Chrome UA never matches. An absent UA is treated as a
 * bot (a real browser always sends one).
 */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|slackbot|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot|embedly|quora|pinterest|redditbot|preview|headless|lighthouse|chrome-lighthouse|google|bingpreview|curl|wget|python-requests|axios|node-fetch|okhttp/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return true;
  return BOT_UA_RE.test(userAgent);
}

/**
 * Owner self-view guard (Phase 1 correctness). True when the signed-in viewer
 * IS the page owner — the agent opening their OWN published page must never
 * count as seller engagement, since that pollutes the "real seller engaged"
 * signal the follow-up wedge depends on. Case-insensitive.
 *
 * A blank / absent viewer email — the anonymous seller, which is the normal
 * case — is NEVER a self-view, so genuine (non-owner) views still count.
 * Pure, like `isBotUserAgent`: the route resolves the session email + the page
 * owner email and asks this for the verdict.
 */
export function isOwnerSelfView(
  viewerEmail: string | null | undefined,
  ownerEmail: string | null | undefined,
): boolean {
  const viewer = viewerEmail?.trim().toLowerCase();
  const owner = ownerEmail?.trim().toLowerCase();
  if (!viewer || !owner) return false;
  return viewer === owner;
}

/**
 * Append one open to a page's views, PURELY. Returns the next record, or `null`
 * when the open should be DROPPED (no write needed):
 *   - per-session de-dupe: a `sid` already present in the retained tail is an
 *     in-session refresh / re-render, so it does not inflate `count`. A genuine
 *     later return opens a new tab (new sessionStorage -> new sid) and DOES count.
 *   - a blank `sid` is dropped (a real beacon always sends one).
 *
 * `afterReveal` = the open's timestamp is strictly after `revealedAt`. Both are
 * server-stamped ISO 8601 UTC, so the lexicographic compare is chronological.
 * An absent `revealedAt` (a born-revealed normal page, or a pre-feature page)
 * yields `afterReveal: false` - the "returned after reveal" read only ever fires
 * for a page that actually transitioned out of a State A invitation.
 */
export function applyView(
  existing: PageViews | null,
  opts: { slug: string; at: string; sid: string; revealedAt?: string | null },
): PageViews | null {
  const sid = opts.sid?.trim();
  if (!sid) return null;
  if (existing && existing.recent.some((e) => e.sid === sid)) return null;

  const afterReveal = !!opts.revealedAt && opts.at > opts.revealedAt;
  const entry: PageViewEntry = { at: opts.at, sid, afterReveal };

  if (!existing) {
    return {
      slug: opts.slug,
      count: 1,
      firstViewedAt: opts.at,
      lastViewedAt: opts.at,
      recent: [entry],
    };
  }

  return {
    slug: existing.slug,
    count: existing.count + 1,
    firstViewedAt: existing.firstViewedAt,
    lastViewedAt: opts.at,
    recent: [...existing.recent, entry].slice(-VIEWS_RECENT_CAP),
    // Preserve the Phase 2 engagement rollups across a later open — an open
    // beacon must never wipe accumulated engagement (and they survive the
    // recent[] FIFO eviction by living at the top level). Absent on a
    // Phase-1 record, so they spread to nothing (byte-identical).
    ...(existing.everWatchedVideo ? { everWatchedVideo: true } : {}),
    ...(existing.everReadToEnd ? { everReadToEnd: true } : {}),
    ...(existing.maxDwellMs ? { maxDwellMs: existing.maxDwellMs } : {}),
  };
}

/**
 * Fold ONE session's engagement summary into the page's views, PURELY. Returns
 * the next record, or `null` when there is nothing to write:
 *   - no existing record, or a blank `sid`, or no session entry matching the sid
 *     (engagement attaches ONLY to a counted session - it never creates a view;
 *     the open beacon owns the count). A genuinely lost open beacon means this
 *     session's engagement is dropped (best-effort, cheap, rare).
 *   - the summary carries nothing usable (no video, no reached-end, no dwell),
 *     or folding it would change nothing (a duplicate / weaker summary).
 *
 * Folds are MONOTONIC: a flag only ever flips false->true, and dwell only ever
 * rises (max), so a later, weaker summary for the same session can never erase a
 * stronger earlier one. Updates BOTH the per-session entry (for the future
 * timeline) AND the aggregate rollups (which survive `recent` eviction).
 */
export function applyEngagement(
  existing: PageViews | null,
  opts: {
    sid: string;
    videoPlayed?: boolean;
    reachedEnd?: boolean;
    dwellMs?: unknown;
  },
): PageViews | null {
  if (!existing) return null;
  const sid = opts.sid?.trim();
  if (!sid) return null;
  const idx = existing.recent.findIndex((e) => e.sid === sid);
  if (idx < 0) return null;

  const dwell = clampDwellMs(opts.dwellMs);
  const video = !!opts.videoPlayed;
  const reached = !!opts.reachedEnd;
  if (!video && !reached && dwell === undefined) return null;

  const entry = existing.recent[idx];
  const nextVideo = entry.videoPlayed || video;
  const nextReached = entry.reachedEnd || reached;
  const nextDwell = Math.max(entry.dwellMs ?? 0, dwell ?? 0);

  // No-op guard: if the fold changes nothing on this session's entry, skip the
  // write (a re-sent or weaker summary).
  const changed =
    nextVideo !== !!entry.videoPlayed ||
    nextReached !== !!entry.reachedEnd ||
    nextDwell !== (entry.dwellMs ?? 0);
  if (!changed) return null;

  const foldedEntry: PageViewEntry = {
    at: entry.at,
    sid: entry.sid,
    afterReveal: entry.afterReveal,
    ...(nextVideo ? { videoPlayed: true } : {}),
    ...(nextReached ? { reachedEnd: true } : {}),
    ...(nextDwell > 0 ? { dwellMs: nextDwell } : {}),
  };
  const recent = [...existing.recent];
  recent[idx] = foldedEntry;

  const everVideo = existing.everWatchedVideo || nextVideo;
  const everReached = existing.everReadToEnd || nextReached;
  const maxDwell = Math.max(existing.maxDwellMs ?? 0, nextDwell);

  return {
    slug: existing.slug,
    count: existing.count,
    firstViewedAt: existing.firstViewedAt,
    lastViewedAt: existing.lastViewedAt,
    recent,
    ...(everVideo ? { everWatchedVideo: true } : {}),
    ...(everReached ? { everReadToEnd: true } : {}),
    ...(maxDwell > 0 ? { maxDwellMs: maxDwell } : {}),
  };
}

/**
 * Project a stored record into the agent-facing signal. PURE. A missing record
 * (or a zero count) reads as "not opened" so the chip stays silent. The Phase 2
 * engagement predicates are always derived here; the pages route decides whether
 * to forward them onto the chip (gated by VIEWED_SIGNAL_ENGAGEMENT_ENABLED).
 */
export function deriveViewSignal(views: PageViews | null): ViewSignal {
  if (!views || views.count < 1) {
    return {
      opened: false,
      count: 0,
      returnedAfterReveal: false,
      watchedVideo: false,
      readToEnd: false,
      lingered: false,
    };
  }
  return {
    opened: true,
    count: views.count,
    lastViewedAt: views.lastViewedAt,
    returnedAfterReveal: views.recent.some((e) => e.afterReveal),
    watchedVideo: !!views.everWatchedVideo,
    readToEnd: !!views.everReadToEnd,
    lingered: (views.maxDwellMs ?? 0) >= LINGER_DWELL_MS,
  };
}

/**
 * Viewed signal (Phase 3) - the recency window (ms) for the advisory follow-up
 * nudge. Meaningful engagement OLDER than this ages out and stops nudging, so a
 * page the seller engaged with weeks ago no longer suggests a fresh follow-up.
 * ~14 days, per the locked product rule. Pure read-side; the raw number is never
 * surfaced, only the derived `worthFollowUp` predicate.
 */
export const FOLLOW_UP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** The advisory follow-up nudge for one page. Pure projection of PageViews. */
export interface FollowUpNudge {
  /** This page has meaningful + recent engagement the agent has not yet cleared. */
  worthFollowUp: boolean;
  /**
   * The concrete reasons it qualifies, PRIORITIZED + capped, reusing the calm
   * Phase 2 voice. Empty unless `worthFollowUp`. Returned-after-reveal leads (the
   * strongest buying signal), then watched-video, then read-to-end.
   */
  reasons: string[];
  /**
   * ISO 8601 UTC of the MOST-RECENT qualifying (meaningful + recent + not-yet-
   * cleared) session. Drives the V2 cockpit's "Worth a follow-up" group sort
   * (most-recent meaningful engagement first). Undefined unless `worthFollowUp`.
   */
  lastMeaningfulAt?: string;
}

/**
 * Derive the advisory follow-up nudge for a page, PURELY. A page is "worth a
 * follow-up" iff a RETAINED open is, per the locked rule (Phase 3):
 *   - meaningful: that session watched the welcome video OR read to the end OR
 *     returned after the reveal (a plain "opened once" is too thin and never
 *     qualifies), AND
 *   - recent: its open timestamp is within `windowMs` of `nowMs` (older
 *     engagement ages out and stops nudging), AND
 *   - not yet cleared: its open timestamp is strictly after `followedUpAt` (the
 *     bounded owner-scoped dismiss). A page marked followed-up drops out; if the
 *     seller engages AGAIN after that mark, the new session re-qualifies, so the
 *     dismiss is "clear up to here", never permanent suppression.
 *
 * Derived from the bounded `recent` tail's per-session flags + timestamps, so the
 * recency + meaningfulness are tied to a real moment (NOT the timestamp-less
 * aggregate rollups, which only drive the always-on chip facts). No new capture;
 * pure projection the route gates behind VIEWED_SIGNAL_NUDGE_ENABLED.
 */
export function deriveFollowUpNudge(
  views: PageViews | null,
  opts: { nowMs: number; followedUpAt?: string | null; windowMs?: number },
): FollowUpNudge {
  const NONE: FollowUpNudge = { worthFollowUp: false, reasons: [] };
  if (!views || views.count < 1) return NONE;

  const windowMs = opts.windowMs ?? FOLLOW_UP_WINDOW_MS;
  const cutoff = opts.nowMs - windowMs;
  const followedUpMs = opts.followedUpAt ? Date.parse(opts.followedUpAt) : NaN;

  let returned = false;
  let video = false;
  let reached = false;
  // Newest qualifying session's timestamp — the recency key the V2 cockpit
  // sorts the follow-up group by. recent[] is newest-LAST but not guaranteed
  // sorted, so take the max rather than the last element.
  let lastMeaningfulAt: string | undefined;
  for (const e of views.recent) {
    const atMs = Date.parse(e.at);
    if (Number.isNaN(atMs)) continue;
    if (atMs < cutoff) continue; // aged out of the recency window
    if (!Number.isNaN(followedUpMs) && atMs <= followedUpMs) continue; // already cleared
    const meaningful = e.afterReveal || !!e.videoPlayed || !!e.reachedEnd;
    if (e.afterReveal) returned = true;
    if (e.videoPlayed) video = true;
    if (e.reachedEnd) reached = true;
    if (meaningful && (!lastMeaningfulAt || e.at > lastMeaningfulAt)) {
      lastMeaningfulAt = e.at;
    }
  }

  if (!returned && !video && !reached) return NONE;
  const reasons: string[] = [];
  if (returned) reasons.push("Returned after the reveal");
  if (video) reasons.push("Watched your video");
  if (reached) reasons.push("Read to the end");
  return { worthFollowUp: true, reasons, lastMeaningfulAt };
}

/** Read a page's views record (or null if none recorded). */
export async function getViews(slug: string): Promise<PageViews | null> {
  return (await kv.get<PageViews>(viewsKey(slug))) ?? null;
}

/**
 * Record one open. Reads the current record, applies the pure `applyView`, and
 * writes back ONLY when the open is kept (a de-duped refresh writes nothing, so
 * the cost is a single read). Best-effort: callers fire-and-forget from the
 * beacon route, so a transient KV hiccup never affects the seller's page.
 */
export async function recordView(opts: {
  slug: string;
  sid: string;
  revealedAt?: string | null;
  at?: string;
}): Promise<void> {
  const at = opts.at ?? new Date().toISOString();
  const existing = await getViews(opts.slug);
  const next = applyView(existing, {
    slug: opts.slug,
    at,
    sid: opts.sid,
    revealedAt: opts.revealedAt,
  });
  if (!next) return;
  await kv.set(viewsKey(opts.slug), next);
}

/**
 * Fold one session's engagement summary into the page's views (Phase 2). Reads
 * the current record, applies the pure `applyEngagement`, and writes back ONLY
 * when something changed (a summary with no usable signal, or for an unknown
 * session, writes nothing). Best-effort: the summary arrives via a fire-and-
 * forget `sendBeacon` on pagehide, so a transient KV hiccup never surfaces to
 * the seller. Engagement NEVER creates a view - the open beacon owns the count.
 */
export async function recordEngagement(opts: {
  slug: string;
  sid: string;
  videoPlayed?: boolean;
  reachedEnd?: boolean;
  dwellMs?: unknown;
}): Promise<void> {
  const existing = await getViews(opts.slug);
  const next = applyEngagement(existing, {
    sid: opts.sid,
    videoPlayed: opts.videoPlayed,
    reachedEnd: opts.reachedEnd,
    dwellMs: opts.dwellMs,
  });
  if (!next) return;
  await kv.set(viewsKey(opts.slug), next);
}
