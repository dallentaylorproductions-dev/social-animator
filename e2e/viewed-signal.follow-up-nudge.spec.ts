import { test, expect } from "@playwright/test";
import {
  deriveFollowUpNudge,
  FOLLOW_UP_WINDOW_MS,
  type PageViews,
} from "../src/lib/seller-presentation/views-store";
import {
  countWorthFollowUp,
  followUpMarkerLabel,
  listMetaLine,
  secondaryRowActions,
  type PageCard,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Viewed signal (Phase 3) - advisory follow-up nudge pure tests.
 *
 * The nudge is pure read-side derivation: `deriveFollowUpNudge` turns the Phase
 * 2 `views:<slug>` aggregate (+ the owner `followedUpAt`) into a `worthFollowUp`
 * predicate per the locked rule, and the library helpers project it onto the
 * card marker / header count / List meta. These pin the rule (meaningful +
 * recent + not-yet-cleared), the recency ageing-out, the dismiss + re-qualify
 * behavior, and - the hard requirement - that a card with NO nudge fields (the
 * flag-off shape) renders byte-identically to Phase 1/2.
 */

const SLUG = "abc12345";
// A fixed "now"; the sample sessions below sit at known offsets from it.
const NOW = Date.parse("2026-06-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function isoBefore(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function views(over: Partial<PageViews> = {}): PageViews {
  return {
    slug: SLUG,
    count: 1,
    firstViewedAt: isoBefore(2 * HOUR),
    lastViewedAt: isoBefore(2 * HOUR),
    recent: [{ at: isoBefore(2 * HOUR), sid: "s1", afterReveal: false }],
    ...over,
  };
}

test.describe("deriveFollowUpNudge - the qualifying rule", () => {
  test("no record / zero count is never worth a follow-up", () => {
    expect(deriveFollowUpNudge(null, { nowMs: NOW }).worthFollowUp).toBe(false);
    expect(
      deriveFollowUpNudge(views({ count: 0, recent: [] }), { nowMs: NOW })
        .worthFollowUp,
    ).toBe(false);
  });

  test("a plain single 'opened' is too thin to qualify", () => {
    const nudge = deriveFollowUpNudge(views(), { nowMs: NOW });
    expect(nudge.worthFollowUp).toBe(false);
    expect(nudge.reasons).toEqual([]);
  });

  test("watched the video qualifies, with the concrete reason", () => {
    const nudge = deriveFollowUpNudge(
      views({
        recent: [
          { at: isoBefore(2 * HOUR), sid: "s1", afterReveal: false, videoPlayed: true },
        ],
      }),
      { nowMs: NOW },
    );
    expect(nudge.worthFollowUp).toBe(true);
    expect(nudge.reasons).toEqual(["Watched your video"]);
  });

  test("read to the end qualifies", () => {
    const nudge = deriveFollowUpNudge(
      views({
        recent: [
          { at: isoBefore(2 * HOUR), sid: "s1", afterReveal: false, reachedEnd: true },
        ],
      }),
      { nowMs: NOW },
    );
    expect(nudge.worthFollowUp).toBe(true);
    expect(nudge.reasons).toEqual(["Read to the end"]);
  });

  test("returned after the reveal qualifies and leads the reasons", () => {
    const nudge = deriveFollowUpNudge(
      views({
        recent: [
          { at: isoBefore(2 * HOUR), sid: "s1", afterReveal: true, videoPlayed: true, reachedEnd: true },
        ],
      }),
      { nowMs: NOW },
    );
    expect(nudge.worthFollowUp).toBe(true);
    expect(nudge.reasons).toEqual([
      "Returned after the reveal",
      "Watched your video",
      "Read to the end",
    ]);
  });
});

test.describe("deriveFollowUpNudge - recency window", () => {
  test("meaningful engagement within ~14 days qualifies", () => {
    const nudge = deriveFollowUpNudge(
      views({
        recent: [
          { at: isoBefore(13 * DAY), sid: "s1", afterReveal: false, videoPlayed: true },
        ],
      }),
      { nowMs: NOW },
    );
    expect(nudge.worthFollowUp).toBe(true);
  });

  test("the same engagement older than the window ages out and stops nudging", () => {
    const nudge = deriveFollowUpNudge(
      views({
        recent: [
          { at: isoBefore(15 * DAY), sid: "s1", afterReveal: false, videoPlayed: true },
        ],
      }),
      { nowMs: NOW },
    );
    expect(nudge.worthFollowUp).toBe(false);
  });

  test("FOLLOW_UP_WINDOW_MS is ~14 days", () => {
    expect(FOLLOW_UP_WINDOW_MS).toBe(14 * DAY);
  });
});

test.describe("deriveFollowUpNudge - dismiss + re-qualify", () => {
  const watched: Partial<PageViews> = {
    recent: [
      { at: isoBefore(3 * DAY), sid: "s1", afterReveal: false, videoPlayed: true },
    ],
  };

  test("marking followed-up after the engagement clears the nudge", () => {
    const nudge = deriveFollowUpNudge(views(watched), {
      nowMs: NOW,
      followedUpAt: isoBefore(2 * DAY), // marked AFTER the s1 session
    });
    expect(nudge.worthFollowUp).toBe(false);
  });

  test("a fresh session AFTER the follow-up mark re-qualifies (clear up to here, not forever)", () => {
    const nudge = deriveFollowUpNudge(
      views({
        count: 2,
        recent: [
          { at: isoBefore(3 * DAY), sid: "s1", afterReveal: false, videoPlayed: true },
          { at: isoBefore(1 * DAY), sid: "s2", afterReveal: false, reachedEnd: true },
        ],
      }),
      { nowMs: NOW, followedUpAt: isoBefore(2 * DAY) },
    );
    expect(nudge.worthFollowUp).toBe(true);
    expect(nudge.reasons).toEqual(["Read to the end"]);
  });
});

test.describe("deriveFollowUpNudge - lastMeaningfulAt (V2 group recency key)", () => {
  test("no nudge → no timestamp", () => {
    expect(deriveFollowUpNudge(views(), { nowMs: NOW }).lastMeaningfulAt).toBeUndefined();
  });

  test("a single qualifying session stamps its own time", () => {
    const at = isoBefore(2 * HOUR);
    const nudge = deriveFollowUpNudge(
      views({ recent: [{ at, sid: "s1", afterReveal: false, videoPlayed: true }] }),
      { nowMs: NOW },
    );
    expect(nudge.lastMeaningfulAt).toBe(at);
  });

  test("the MOST-RECENT qualifying session wins, regardless of recent[] order", () => {
    const older = isoBefore(5 * DAY);
    const newer = isoBefore(1 * DAY);
    const nudge = deriveFollowUpNudge(
      views({
        count: 2,
        // newest-first order on purpose — the max, not the last element, wins
        recent: [
          { at: newer, sid: "s2", afterReveal: false, reachedEnd: true },
          { at: older, sid: "s1", afterReveal: false, videoPlayed: true },
        ],
      }),
      { nowMs: NOW },
    );
    expect(nudge.lastMeaningfulAt).toBe(newer);
  });

  test("a non-meaningful (plain opened) session never sets the timestamp", () => {
    const nudge = deriveFollowUpNudge(
      views({
        count: 2,
        recent: [
          { at: isoBefore(3 * DAY), sid: "s1", afterReveal: false, videoPlayed: true },
          { at: isoBefore(1 * DAY), sid: "s2", afterReveal: false }, // plain open, newer
        ],
      }),
      { nowMs: NOW },
    );
    // The newer plain-open does NOT move the stamp; the meaningful s1 owns it.
    expect(nudge.lastMeaningfulAt).toBe(isoBefore(3 * DAY));
  });
});

// ── library projection: marker / header count / List meta / row menu ──

function liveCard(over: Partial<PageCard> = {}): PageCard {
  return {
    key: SLUG,
    status: "live",
    slug: SLUG,
    publicUrl: "/h/abc12345",
    propertyLine: "123 Main St",
    updatedAt: isoBefore(3 * HOUR),
    ...over,
  };
}

test.describe("followUpMarkerLabel", () => {
  test("a card not worth a follow-up (flag-off shape) yields no marker", () => {
    expect(followUpMarkerLabel(liveCard())).toBeUndefined();
    expect(followUpMarkerLabel(liveCard({ viewCount: 1 }))).toBeUndefined();
  });

  test("a qualifying card reads 'Worth a follow-up' with capped reasons", () => {
    const label = followUpMarkerLabel(
      liveCard({
        worthFollowUp: true,
        followUpReasons: ["Returned after the reveal", "Watched your video", "Read to the end"],
      }),
    );
    // capped at 2 reasons so it stays a glance
    expect(label).toBe(
      "Worth a follow-up · Returned after the reveal · Watched your video",
    );
  });

  test("worth a follow-up with no reasons is still a quiet marker", () => {
    expect(followUpMarkerLabel(liveCard({ worthFollowUp: true }))).toBe(
      "Worth a follow-up",
    );
  });
});

test.describe("countWorthFollowUp", () => {
  test("counts only the cards flagged worth a follow-up", () => {
    const cards = [
      liveCard({ key: "a", worthFollowUp: true }),
      liveCard({ key: "b" }),
      liveCard({ key: "c", worthFollowUp: true }),
    ];
    expect(countWorthFollowUp(cards)).toBe(2);
  });

  test("a flag-off list (no nudge fields) yields 0, so the header shows nothing", () => {
    expect(countWorthFollowUp([liveCard(), liveCard({ key: "b" })])).toBe(0);
  });
});

test.describe("listMetaLine + secondaryRowActions - flag-off byte-identical", () => {
  test("a flag-off card's meta line has no follow-up token", () => {
    expect(listMetaLine(liveCard({ sellerLine: "The Smiths" }), NOW)).toBe(
      "The Smiths",
    );
  });

  test("a worth-a-follow-up card appends the quiet token to the dense List line", () => {
    expect(
      listMetaLine(
        liveCard({ sellerLine: "The Smiths", worthFollowUp: true }),
        NOW,
      ),
    ).toBe("The Smiths · Worth a follow-up");
  });

  test("the row menu surfaces 'mark-followed-up' first, only when worth a follow-up", () => {
    expect(secondaryRowActions(liveCard())).not.toContain("mark-followed-up");
    expect(secondaryRowActions(liveCard({ worthFollowUp: true }))[0]).toBe(
      "mark-followed-up",
    );
  });
});
