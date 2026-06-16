import { test, expect } from "@playwright/test";
import {
  applyEngagement,
  applyView,
  clampDwellMs,
  deriveViewSignal,
  isBotUserAgent,
  LINGER_DWELL_MS,
  VIEWS_RECENT_CAP,
  type PageViews,
} from "../src/lib/seller-presentation/views-store";

/**
 * Viewed signal (Phase 1) - views-store pure model unit tests.
 *
 * Mirrors the pages-library spec: the count-deciding logic (session de-dupe, the
 * before/after-reveal classification, the recent cap) lives in PURE `applyView`
 * / `deriveViewSignal`, so it runs as a node-context Playwright spec - the only
 * runner this repo has. The KV wrappers (`recordView` / `getViews`) are the only
 * impure surface and are verified on preview per the build packet.
 *
 * Coverage: first open seeds the record; per-session de-dupe (the count-
 * integrity gate); a genuine new session counts; the recent tail caps at
 * VIEWS_RECENT_CAP; afterReveal classification incl. the absent-revealedAt =
 * "no reveal moment" rule; a blank sid is dropped; the agent-facing projection;
 * and the bot / link-unfurl guard.
 */

const SLUG = "abc12345";

test.describe("applyView - first open seeds the record", () => {
  test("an empty page records count 1 and stamps both timestamps", () => {
    const next = applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid: "s1" });
    expect(next).not.toBeNull();
    expect(next!.count).toBe(1);
    expect(next!.firstViewedAt).toBe("2026-06-15T10:00:00.000Z");
    expect(next!.lastViewedAt).toBe("2026-06-15T10:00:00.000Z");
    expect(next!.recent).toHaveLength(1);
    expect(next!.recent[0].sid).toBe("s1");
    expect(next!.recent[0].afterReveal).toBe(false);
  });

  test("a blank / whitespace sid is dropped (no write)", () => {
    expect(applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid: "" })).toBeNull();
    expect(applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid: "   " })).toBeNull();
  });
});

test.describe("applyView - per-session de-dupe", () => {
  const seed = applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid: "s1" })!;

  test("the same session re-opening (refresh) does NOT inflate count", () => {
    const again = applyView(seed, { slug: SLUG, at: "2026-06-15T10:05:00.000Z", sid: "s1" });
    expect(again).toBeNull();
  });

  test("a genuine new session DOES count and bumps lastViewedAt", () => {
    const returned = applyView(seed, { slug: SLUG, at: "2026-06-15T14:00:00.000Z", sid: "s2" });
    expect(returned).not.toBeNull();
    expect(returned!.count).toBe(2);
    expect(returned!.firstViewedAt).toBe("2026-06-15T10:00:00.000Z");
    expect(returned!.lastViewedAt).toBe("2026-06-15T14:00:00.000Z");
  });
});

test.describe("applyView - recent tail is bounded", () => {
  test(`recent never exceeds VIEWS_RECENT_CAP (${VIEWS_RECENT_CAP}), newest kept`, () => {
    let acc: PageViews | null = null;
    for (let i = 0; i < VIEWS_RECENT_CAP + 5; i++) {
      const at = `2026-06-15T10:${String(i).padStart(2, "0")}:00.000Z`;
      acc = applyView(acc, { slug: SLUG, at, sid: `sid-${i}` }) ?? acc;
    }
    expect(acc!.count).toBe(VIEWS_RECENT_CAP + 5);
    expect(acc!.recent).toHaveLength(VIEWS_RECENT_CAP);
    // The newest entry survived; the oldest aged out.
    expect(acc!.recent[acc!.recent.length - 1].sid).toBe(`sid-${VIEWS_RECENT_CAP + 4}`);
    expect(acc!.recent.some((e) => e.sid === "sid-0")).toBe(false);
  });
});

test.describe("applyView - afterReveal classification", () => {
  test("an open AFTER revealedAt is flagged afterReveal", () => {
    const next = applyView(null, {
      slug: SLUG,
      at: "2026-06-15T12:00:00.000Z",
      sid: "s1",
      revealedAt: "2026-06-15T11:00:00.000Z",
    });
    expect(next!.recent[0].afterReveal).toBe(true);
  });

  test("an open BEFORE revealedAt is NOT afterReveal", () => {
    const next = applyView(null, {
      slug: SLUG,
      at: "2026-06-15T10:00:00.000Z",
      sid: "s1",
      revealedAt: "2026-06-15T11:00:00.000Z",
    });
    expect(next!.recent[0].afterReveal).toBe(false);
  });

  test("absent revealedAt = no reveal moment = never afterReveal", () => {
    const next = applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid: "s1" });
    expect(next!.recent[0].afterReveal).toBe(false);
    const nullRevealed = applyView(null, {
      slug: SLUG,
      at: "2026-06-15T10:00:00.000Z",
      sid: "s2",
      revealedAt: null,
    });
    expect(nullRevealed!.recent[0].afterReveal).toBe(false);
  });
});

test.describe("deriveViewSignal", () => {
  test("a missing record reads as not opened", () => {
    const sig = deriveViewSignal(null);
    expect(sig).toEqual({
      opened: false,
      count: 0,
      returnedAfterReveal: false,
      watchedVideo: false,
      readToEnd: false,
      lingered: false,
    });
  });

  test("opened with no after-reveal opens reports opened + count, not returned", () => {
    const views = applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid: "s1" })!;
    const sig = deriveViewSignal(views);
    expect(sig.opened).toBe(true);
    expect(sig.count).toBe(1);
    expect(sig.lastViewedAt).toBe("2026-06-15T10:00:00.000Z");
    expect(sig.returnedAfterReveal).toBe(false);
  });

  test("any retained after-reveal open flips returnedAfterReveal", () => {
    let views = applyView(null, {
      slug: SLUG,
      at: "2026-06-15T10:00:00.000Z",
      sid: "s1",
      revealedAt: "2026-06-15T11:00:00.000Z",
    })!;
    views = applyView(views, {
      slug: SLUG,
      at: "2026-06-15T12:00:00.000Z",
      sid: "s2",
      revealedAt: "2026-06-15T11:00:00.000Z",
    })!;
    const sig = deriveViewSignal(views);
    expect(sig.count).toBe(2);
    expect(sig.returnedAfterReveal).toBe(true);
  });
});

// ===========================================================================
// Phase 2 (engagement) — applyEngagement fold + clamp + derived predicates.
// ===========================================================================

const SEEDED = (sid = "s1"): PageViews =>
  applyView(null, { slug: SLUG, at: "2026-06-15T10:00:00.000Z", sid })!;

test.describe("clampDwellMs", () => {
  test("accepts a finite non-negative number, floored", () => {
    expect(clampDwellMs(1234.9)).toBe(1234);
    expect(clampDwellMs(0)).toBe(0);
  });
  test("rejects non-numbers / negative / non-finite", () => {
    expect(clampDwellMs("60000")).toBeUndefined();
    expect(clampDwellMs(-5)).toBeUndefined();
    expect(clampDwellMs(Number.NaN)).toBeUndefined();
    expect(clampDwellMs(Infinity)).toBeUndefined();
    expect(clampDwellMs(undefined)).toBeUndefined();
  });
  test("clamps to the 24h ceiling (garbage / backgrounded-for-days)", () => {
    const DAY = 24 * 60 * 60 * 1000;
    expect(clampDwellMs(DAY * 30)).toBe(DAY);
  });
});

test.describe("applyEngagement — folds into the session, never creates a view", () => {
  test("folds video + reachedEnd + dwell into the matching session entry", () => {
    const next = applyEngagement(SEEDED(), {
      sid: "s1",
      videoPlayed: true,
      reachedEnd: true,
      dwellMs: 90_000,
    });
    expect(next).not.toBeNull();
    // Count is UNCHANGED — engagement never creates a view.
    expect(next!.count).toBe(1);
    expect(next!.recent[0].videoPlayed).toBe(true);
    expect(next!.recent[0].reachedEnd).toBe(true);
    expect(next!.recent[0].dwellMs).toBe(90_000);
    // Aggregate rollups set.
    expect(next!.everWatchedVideo).toBe(true);
    expect(next!.everReadToEnd).toBe(true);
    expect(next!.maxDwellMs).toBe(90_000);
  });

  test("an unknown sid (no counted session) is dropped — no phantom view", () => {
    expect(
      applyEngagement(SEEDED(), { sid: "ghost", videoPlayed: true }),
    ).toBeNull();
  });

  test("a null record / blank sid / empty summary writes nothing", () => {
    expect(applyEngagement(null, { sid: "s1", videoPlayed: true })).toBeNull();
    expect(applyEngagement(SEEDED(), { sid: "  ", videoPlayed: true })).toBeNull();
    expect(applyEngagement(SEEDED(), { sid: "s1" })).toBeNull();
    expect(
      applyEngagement(SEEDED(), {
        sid: "s1",
        videoPlayed: false,
        reachedEnd: false,
      }),
    ).toBeNull();
  });

  test("folds are monotonic — a later weaker summary cannot erase a stronger one", () => {
    const strong = applyEngagement(SEEDED(), {
      sid: "s1",
      videoPlayed: true,
      reachedEnd: true,
      dwellMs: 120_000,
    })!;
    // A weaker re-send (no video, shorter dwell) changes nothing → no write.
    const weaker = applyEngagement(strong, {
      sid: "s1",
      videoPlayed: false,
      reachedEnd: false,
      dwellMs: 5_000,
    });
    expect(weaker).toBeNull();
    expect(strong.everWatchedVideo).toBe(true);
    expect(strong.maxDwellMs).toBe(120_000);
  });

  test("engagement is per-session: a second session's depth folds into ITS entry", () => {
    let views = SEEDED("s1");
    views = applyView(views, {
      slug: SLUG,
      at: "2026-06-15T14:00:00.000Z",
      sid: "s2",
    })!;
    const next = applyEngagement(views, { sid: "s2", videoPlayed: true })!;
    expect(next.count).toBe(2);
    // s1 untouched; s2 carries the engagement.
    expect(next.recent.find((e) => e.sid === "s1")!.videoPlayed).toBeUndefined();
    expect(next.recent.find((e) => e.sid === "s2")!.videoPlayed).toBe(true);
  });

  test("everWatchedVideo survives recent[] FIFO eviction (aggregate rollup)", () => {
    // Session 0 watches the video, then VIEWS_RECENT_CAP+5 fresh sessions push
    // it out of the bounded tail. The aggregate must still report watched.
    let views = SEEDED("sid-0");
    views = applyEngagement(views, { sid: "sid-0", videoPlayed: true })!;
    for (let i = 1; i <= VIEWS_RECENT_CAP + 5; i++) {
      views = applyView(views, {
        slug: SLUG,
        at: `2026-06-16T10:${String(i).padStart(2, "0")}:00.000Z`,
        sid: `sid-${i}`,
      })!;
    }
    expect(views.recent.some((e) => e.sid === "sid-0")).toBe(false); // evicted
    expect(views.everWatchedVideo).toBe(true); // rollup survives
    expect(deriveViewSignal(views).watchedVideo).toBe(true);
  });
});

test.describe("deriveViewSignal — engagement predicates", () => {
  test("a missing record reports every engagement predicate false", () => {
    const sig = deriveViewSignal(null);
    expect(sig.watchedVideo).toBe(false);
    expect(sig.readToEnd).toBe(false);
    expect(sig.lingered).toBe(false);
  });

  test("lingered fires only at or above the dwell threshold", () => {
    const below = applyEngagement(SEEDED(), {
      sid: "s1",
      dwellMs: LINGER_DWELL_MS - 1,
    })!;
    expect(deriveViewSignal(below).lingered).toBe(false);
    const at = applyEngagement(SEEDED(), {
      sid: "s1",
      dwellMs: LINGER_DWELL_MS,
    })!;
    expect(deriveViewSignal(at).lingered).toBe(true);
  });

  test("watched + read predicates mirror the aggregate rollups", () => {
    const v = applyEngagement(SEEDED(), {
      sid: "s1",
      videoPlayed: true,
      reachedEnd: true,
    })!;
    const sig = deriveViewSignal(v);
    expect(sig.watchedVideo).toBe(true);
    expect(sig.readToEnd).toBe(true);
  });
});

test.describe("isBotUserAgent", () => {
  test("real mobile / desktop browser UAs are NOT bots", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  test("link-unfurl + crawler UAs ARE bots", () => {
    for (const ua of [
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "WhatsApp/2.23",
      "TelegramBot (like TwitterBot)",
      "Discordbot/2.0",
      "Twitterbot/1.0",
      "Googlebot/2.1",
      "curl/8.4.0",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });

  test("an absent UA is treated as a bot (a real browser always sends one)", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });
});
