import { test, expect } from "@playwright/test";
import {
  applyEvent,
  BUYER_TOUR_EVENTS,
  dedupeKey,
  emptyEngagement,
  isOverWriteCap,
  summarizeEngagement,
  toFollowUpBossSignal,
  TOUR_ENGAGEMENT_WRITE_CAP,
  validateTrackPayload,
  type BuyerTourTrackPayload,
  type TourEngagement,
} from "../src/tools/buyer-tour-brief/engine/engagement";

/**
 * Buyer Tour Brief — first-party engagement, pure core locks (BUYER_TOUR_ANALYTICS).
 * Proves the NO-PII allow-list validation, the event vocabulary boundary, the per-load
 * de-dupe key, the aggregate fold, the write cap, the calm readout summarizer (+ empty
 * state), and the future FUB "viewed / engaged" mapping. No KV, no browser — this is
 * the privacy + correctness spine under the endpoint and the readout.
 */

const SLUG = "prev1234"; // valid 8-char Crockford base32
const SESSION = "12345678-1234-4123-8123-1234567890ab";

function goodPayload(
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return { tourSlug: SLUG, event: "tour_opened", sessionId: SESSION, ts: 1720000000000, ...over };
}

test.describe("validateTrackPayload — allow-list + NO PII", () => {
  test("accepts a well-formed non-per-home event", () => {
    const r = validateTrackPayload(goodPayload());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.event).toBe("tour_opened");
      expect(r.payload.homeLetter).toBeUndefined();
    }
  });

  test("accepts every allow-listed event name", () => {
    for (const ev of BUYER_TOUR_EVENTS) {
      const perHome = ["home_expander_opened", "map_pin_tapped", "pin_summary_opened"].includes(ev);
      const r = validateTrackPayload(goodPayload({ event: ev, ...(perHome ? { homeLetter: "A" } : {}) }));
      expect(r.ok, ev).toBe(true);
    }
  });

  test("rejects an unknown event name", () => {
    const r = validateTrackPayload(goodPayload({ event: "buyer_bought_house" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad-event");
  });

  test("REJECTS any stray field — PII cannot ride along", () => {
    for (const pii of ["name", "email", "phone", "ip", "userAgent", "fingerprint"]) {
      const r = validateTrackPayload(goodPayload({ [pii]: "leak" }));
      expect(r.ok, pii).toBe(false);
      if (!r.ok) expect(r.reason).toContain("unknown-field");
    }
  });

  test("returned payload contains ONLY the allow-listed keys (no passthrough)", () => {
    const r = validateTrackPayload(goodPayload({ event: "map_pin_tapped", homeLetter: "B" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.payload).sort()).toEqual(
        ["event", "homeLetter", "sessionId", "tourSlug", "ts"].sort(),
      );
    }
  });

  test("rejects malformed slug, session id, and ts", () => {
    expect(validateTrackPayload(goodPayload({ tourSlug: "TOO-LONG-slug" })).ok).toBe(false);
    expect(validateTrackPayload(goodPayload({ tourSlug: "iiiiiiii" })).ok).toBe(false); // i not in alphabet
    expect(validateTrackPayload(goodPayload({ sessionId: "not-a-uuid" })).ok).toBe(false);
    expect(validateTrackPayload(goodPayload({ ts: "nope" })).ok).toBe(false);
  });

  test("rejects a homeLetter on a non-per-home event", () => {
    const r = validateTrackPayload(goodPayload({ event: "cta_clicked", homeLetter: "A" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unexpected-homeLetter");
  });

  test("rejects a bad homeLetter on a per-home event", () => {
    const r = validateTrackPayload(goodPayload({ event: "home_expander_opened", homeLetter: "Z9" }));
    expect(r.ok).toBe(false);
  });

  test("allows a per-home event to omit the letter", () => {
    expect(validateTrackPayload(goodPayload({ event: "map_pin_tapped" })).ok).toBe(true);
  });

  test("rejects non-objects", () => {
    expect(validateTrackPayload(null).ok).toBe(false);
    expect(validateTrackPayload("x").ok).toBe(false);
    expect(validateTrackPayload([goodPayload()]).ok).toBe(false);
  });
});

test.describe("dedupeKey", () => {
  test("keys per event, and per event+home for per-home events", () => {
    expect(dedupeKey("reached_comparison")).toBe("reached_comparison");
    expect(dedupeKey("home_expander_opened", "A")).toBe("home_expander_opened:A");
    expect(dedupeKey("home_expander_opened", "B")).not.toBe(
      dedupeKey("home_expander_opened", "A"),
    );
  });
});

test.describe("applyEvent — aggregate fold", () => {
  const ev = (event: string, homeLetter?: string): BuyerTourTrackPayload =>
    ({ tourSlug: SLUG, event, sessionId: SESSION, ts: 1, ...(homeLetter ? { homeLetter } : {}) }) as BuyerTourTrackPayload;

  test("counts globally and per-home; firstSeen fixed, lastSeen moves", () => {
    let agg = applyEvent(null, ev("tour_opened"), "2026-01-01T00:00:00.000Z");
    agg = applyEvent(agg, ev("tour_opened"), "2026-01-02T00:00:00.000Z");
    agg = applyEvent(agg, ev("home_expander_opened", "A"), "2026-01-03T00:00:00.000Z");
    agg = applyEvent(agg, ev("map_pin_tapped", "A"), "2026-01-04T00:00:00.000Z");

    expect(agg.events.tour_opened).toBe(2);
    expect(agg.homeEvents.A?.home_expander_opened).toBe(1);
    expect(agg.homeEvents.A?.map_pin_tapped).toBe(1);
    expect(agg.firstSeen).toBe("2026-01-01T00:00:00.000Z");
    expect(agg.lastSeen).toBe("2026-01-04T00:00:00.000Z");
    expect(agg.totalWrites).toBe(4);
  });
});

test.describe("write cap", () => {
  test("isOverWriteCap: null never over; at cap => over", () => {
    expect(isOverWriteCap(null)).toBe(false);
    const under = emptyEngagement(SLUG, "2026-01-01T00:00:00.000Z");
    under.totalWrites = TOUR_ENGAGEMENT_WRITE_CAP - 1;
    expect(isOverWriteCap(under)).toBe(false);
    const at = { ...under, totalWrites: TOUR_ENGAGEMENT_WRITE_CAP };
    expect(isOverWriteCap(at)).toBe(true);
  });
});

test.describe("summarizeEngagement — calm readout + empty state", () => {
  test("null / zero opens => empty", () => {
    expect(summarizeEngagement(null).empty).toBe(true);
    const noOpens: TourEngagement = emptyEngagement(SLUG, "t");
    expect(summarizeEngagement(noOpens).empty).toBe(true);
  });

  test("aggregates into calm factual lines", () => {
    const agg: TourEngagement = {
      slug: SLUG,
      firstSeen: "t",
      lastSeen: "t",
      events: {
        tour_opened: 3,
        reached_comparison: 1,
        school_section_viewed: 1,
        cta_clicked: 1,
      },
      homeEvents: {
        A: { home_expander_opened: 1 },
        C: { map_pin_tapped: 2 },
      },
      totalWrites: 8,
    };
    const s = summarizeEngagement(agg);
    expect(s.empty).toBe(false);
    expect(s.opens).toBe(3);
    expect(s.homesTouched).toEqual(["A", "C"]);
    expect(s.lines).toContain("Opened 3 times.");
    expect(s.lines).toContain("Reached the comparison.");
    expect(s.lines).toContain("Tapped Home A and Home C.");
    expect(s.lines).toContain("Viewed a school.");
    expect(s.lines).toContain("Tapped your contact button.");
    // No hype language anywhere.
    expect(s.lines.join(" ")).not.toMatch(/interested|!!|excited/i);
  });

  test("singular open + single home phrasing", () => {
    const agg: TourEngagement = {
      slug: SLUG,
      firstSeen: "t",
      lastSeen: "t",
      events: { tour_opened: 1 },
      homeEvents: { B: { map_pin_tapped: 1 } },
      totalWrites: 2,
    };
    const s = summarizeEngagement(agg);
    expect(s.lines).toContain("Opened once.");
    expect(s.lines).toContain("Tapped Home B.");
  });

  test("reached_end without a CTA click reports read-to-end", () => {
    const agg: TourEngagement = {
      slug: SLUG,
      firstSeen: "t",
      lastSeen: "t",
      events: { tour_opened: 1, reached_end: 1 },
      homeEvents: {},
      totalWrites: 2,
    };
    expect(summarizeEngagement(agg).lines).toContain("Read to the end.");
  });
});

test.describe("toFollowUpBossSignal — future FUB mapping (no rewrite needed)", () => {
  test("viewed = any open; engaged = any deeper step", () => {
    expect(toFollowUpBossSignal(null)).toBeNull();

    const openedOnly: TourEngagement = {
      slug: SLUG, firstSeen: "t", lastSeen: "2026-01-01T00:00:00.000Z",
      events: { tour_opened: 1 }, homeEvents: {}, totalWrites: 1,
    };
    expect(toFollowUpBossSignal(openedOnly)).toMatchObject({
      tourSlug: SLUG, viewed: true, engaged: false, lastSeen: "2026-01-01T00:00:00.000Z",
    });

    const engaged: TourEngagement = {
      ...openedOnly, events: { tour_opened: 1, cta_clicked: 1 },
    };
    expect(toFollowUpBossSignal(engaged)?.engaged).toBe(true);
  });
});
