import { test, expect } from "@playwright/test";
import {
  applyView,
  deriveViewSignal,
  isBotUserAgent,
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
    expect(sig).toEqual({ opened: false, count: 0, returnedAfterReveal: false });
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
