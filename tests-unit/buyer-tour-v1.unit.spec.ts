import { test, expect } from "@playwright/test";
import {
  deriveComparison,
  deriveQuickRead,
  parseMiles,
  parseMinutes,
  stopLetter,
} from "../src/tools/buyer-tour-brief/output/buyer-tour-v1";
import type {
  BuyerTourPublicPayload,
  PublicHome,
} from "../src/tools/buyer-tour-brief/output/public-payload";

/**
 * Buyer Tour Brief V1 context hub — pure derivation locks (BUYER_TOUR_BRIEF_V1).
 * Proves the value parsers, the strongest-match-PER-AXIS comparison (never an overall
 * best), the size axis direction (higher is better), graceful omission, and the Quick
 * Read leaders. No render — this is the data spine under the comparison card.
 */

function home(stop: number, over: Partial<PublicHome> = {}): PublicHome {
  return {
    stop,
    address: `${stop} Main St`,
    whyOnList: "",
    watchFor: "",
    proximity: [],
    ...over,
  };
}

function payload(homes: PublicHome[], priorities: BuyerTourPublicPayload["priorities"] = ["commute", "schools", "parks", "coffee"]): BuyerTourPublicPayload {
  return {
    templateVersion: 1,
    buyerName: "Maya",
    tourDate: "Sat",
    priorities,
    buyerPriorities: [],
    homes,
    agent: {},
  };
}

/* ---- helpers -------------------------------------------------------------- */

test("stopLetter maps 1→A, 2→B, 3→C", () => {
  expect(stopLetter(1)).toBe("A");
  expect(stopLetter(2)).toBe("B");
  expect(stopLetter(3)).toBe("C");
  expect(stopLetter(26)).toBe("Z");
});

test("parseMiles handles mi, <0.1, and rejects junk", () => {
  expect(parseMiles("0.4 mi")).toBe(0.4);
  expect(parseMiles("1.2 mi")).toBe(1.2);
  expect(parseMiles("<0.1 mi")).toBeCloseTo(0.09, 2);
  expect(parseMiles("18 min drive")).toBeNull();
  expect(parseMiles(null)).toBeNull();
});

test("parseMinutes handles min, hr, hr+min", () => {
  expect(parseMinutes("18 min drive")).toBe(18);
  expect(parseMinutes("1 hr drive")).toBe(60);
  expect(parseMinutes("1 hr 5 min drive")).toBe(65);
  expect(parseMinutes("0.3 mi")).toBeNull();
});

/* ---- comparison: strongest match PER AXIS --------------------------------- */

function chip(category: PublicHome["proximity"][number]["category"], value: string) {
  return { category, label: category, value };
}

test("comparison marks the leader on EACH axis, never an overall best", () => {
  const homes = [
    home(1, {
      // A: closest school, mid commute
      proximity: [chip("commute", "18 min drive"), chip("schools", "0.3 mi"), chip("coffee", "0.3 mi")],
      sqft: 2540,
    }),
    home(2, {
      // B: biggest, farthest school
      proximity: [chip("commute", "24 min drive"), chip("schools", "0.7 mi"), chip("coffee", "0.6 mi")],
      sqft: 3100,
    }),
    home(3, {
      // C: shortest commute + closest coffee
      proximity: [chip("commute", "9 min drive"), chip("schools", "0.5 mi"), chip("coffee", "0.1 mi")],
      sqft: 1800,
    }),
  ];
  const axes = deriveComparison(payload(homes));
  const byKey = Object.fromEntries(axes.map((a) => [a.key, a]));

  expect(byKey.commute.bestStop).toBe(3); // 9 min wins
  expect(byKey.schools.bestStop).toBe(1); // 0.3 mi wins
  expect(byKey.coffee.bestStop).toBe(3); // 0.1 mi wins
  expect(byKey.size.bestStop).toBe(2); // 3100 sqft wins (higher is better)

  // Exactly ONE best cell per axis.
  for (const axis of axes) {
    expect(axis.cells.filter((c) => c.isBest)).toHaveLength(1);
  }
  // Values pass through verbatim + A/B/C letters present.
  expect(byKey.commute.cells.map((c) => c.letter)).toEqual(["A", "B", "C"]);
  expect(byKey.size.cells.find((c) => c.stop === 2)?.value).toBe("3,100 sqft");
});

test("an axis with fewer than two comparable homes is omitted (graceful)", () => {
  const homes = [
    home(1, { proximity: [chip("parks", "0.4 mi")] }),
    home(2, { proximity: [] }), // no parks value
  ];
  const axes = deriveComparison(payload(homes, ["parks"]));
  expect(axes.find((a) => a.key === "parks")).toBeUndefined();
});

test("comparison prefers proximityAll over the capped inline proximity", () => {
  const homes = [
    home(1, {
      proximity: [chip("commute", "18 min drive")], // capped inline
      proximityAll: [chip("commute", "18 min drive"), chip("grocery", "0.5 mi")],
    }),
    home(2, {
      proximity: [chip("commute", "24 min drive")],
      proximityAll: [chip("commute", "24 min drive"), chip("grocery", "0.9 mi")],
    }),
  ] as PublicHome[];
  const axes = deriveComparison(payload(homes, ["commute", "grocery"]));
  // grocery only exists in proximityAll — it must still produce an axis.
  expect(axes.find((a) => a.key === "grocery")?.bestStop).toBe(1);
});

test("fewer than two homes → no comparison at all", () => {
  expect(deriveComparison(payload([home(1)]))).toEqual([]);
});

/* ---- Quick Read ----------------------------------------------------------- */

test("Quick Read names each axis leader, capped, in priority order", () => {
  const homes = [
    home(1, { proximity: [chip("commute", "18 min drive"), chip("schools", "0.3 mi"), chip("parks", "0.4 mi"), chip("coffee", "0.5 mi")], sqft: 2000 }),
    home(2, { proximity: [chip("commute", "9 min drive"), chip("schools", "0.7 mi"), chip("parks", "0.2 mi"), chip("coffee", "0.1 mi")], sqft: 2200 }),
  ];
  const qr = deriveQuickRead(payload(homes), 4);
  expect(qr).toHaveLength(4); // capped
  expect(qr[0]).toMatchObject({ key: "commute", label: "Shortest commute", letter: "B" });
  const schools = qr.find((c) => c.key === "schools");
  expect(schools).toMatchObject({ label: "Closest to a school", letter: "A" });
});

test("Quick Read is empty when nothing is comparable", () => {
  expect(deriveQuickRead(payload([home(1)]))).toEqual([]);
});
