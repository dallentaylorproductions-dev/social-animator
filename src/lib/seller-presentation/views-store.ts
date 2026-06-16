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
}

/** The Phase 1 signal the agent surface reads. Pure projection of PageViews. */
export interface ViewSignal {
  /** count > 0. */
  opened: boolean;
  /** Repeat-open count across sessions. */
  count: number;
  /** ISO 8601 UTC of the most recent open, iff opened. */
  lastViewedAt?: string;
  /** Any retained open stamped after the reveal - the strongest buying signal. */
  returnedAfterReveal: boolean;
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
  };
}

/**
 * Project a stored record into the agent-facing signal. PURE. A missing record
 * (or a zero count) reads as "not opened" so the chip stays silent.
 */
export function deriveViewSignal(views: PageViews | null): ViewSignal {
  if (!views || views.count < 1) {
    return { opened: false, count: 0, returnedAfterReveal: false };
  }
  return {
    opened: true,
    count: views.count,
    lastViewedAt: views.lastViewedAt,
    returnedAfterReveal: views.recent.some((e) => e.afterReveal),
  };
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
