import { test, expect } from "@playwright/test";
import {
  isQualifyingSchool,
  parseNearestSchool,
  parseNearestPlace,
  nearestPlaceChip,
  haversineMeters,
  formatMiles,
  type MapsKv,
} from "@/lib/buyer-tour-brief/google-maps";
import type { LatLng } from "@/tools/buyer-tour-brief/engine/types";

/**
 * Buyer Tour Brief — map "School locations" proximity-layer ACCURACY (BUYER_TOUR_BRIEF,
 * LIVE v0). The Google Places school lookup used to take the geometrically nearest
 * result of `type=school`, so a loosely school-tagged yoga studio / scuba center / gym
 * won ("0.1 mi to Thai Yoga Bodywork"). The fix qualifies results by their `types`:
 * must carry a real school type AND no disqualifying non-school type, and picks the
 * nearest QUALIFYING result (graceful empty when none). This is scoped to the school
 * layer; parks/coffee/grocery/commute are unchanged. NOT the GreatSchools section.
 */

/* ---- an in-memory KV that records every key written (to prove cache versioning) -- */

function memKv(): MapsKv & { keys: string[] } {
  const store = new Map<string, unknown>();
  const keys: string[] = [];
  return {
    keys,
    async get<T>(k: string): Promise<T | null> {
      return (store.has(k) ? (store.get(k) as T) : null) ?? null;
    },
    async set(k: string, v: unknown): Promise<unknown> {
      keys.push(k);
      store.set(k, v);
      return "OK";
    },
  };
}

/** A fake fetch returning a fixed Places JSON payload, matching what fetchJson expects. */
function fetchReturning(payload: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

const HOME: LatLng = { lat: 44.906, lng: -93.316 }; // Xerxes Ave S, Minneapolis-ish

function place(name: string, types: string[], lat: number, lng: number) {
  return { name, types, geometry: { location: { lat, lng } } };
}

/* A distance-sorted (rankby=distance) response like the reported bug: the two nearest
 * hits are a yoga studio and a gym both tagged loosely, the real school is third. */
const REAL_SCHOOL = place(
  "Lake Harriet Community School",
  ["primary_school", "school", "point_of_interest", "establishment"],
  44.912,
  -93.31,
);
const MIXED_RESPONSE = {
  status: "OK",
  results: [
    place(
      "Thai Yoga Bodywork",
      ["school", "health", "spa", "point_of_interest", "establishment"],
      44.9061,
      -93.3161,
    ),
    place(
      "Southside Strength Gym",
      ["gym", "health", "point_of_interest", "establishment"],
      44.9065,
      -93.3155,
    ),
    REAL_SCHOOL,
  ],
};

/* ---- isQualifyingSchool: the type filter ---------------------------------- */

test("a real school qualifies (real school type, no disqualifier)", () => {
  expect(
    isQualifyingSchool(["primary_school", "school", "point_of_interest"]),
  ).toBe(true);
  expect(isQualifyingSchool(["secondary_school", "school"])).toBe(true);
  // A school Google only tags with the umbrella `school` still qualifies.
  expect(isQualifyingSchool(["school", "point_of_interest", "establishment"])).toBe(
    true,
  );
  // A preschool / daycare is a real school per the v0 decision.
  expect(isQualifyingSchool(["preschool", "school"])).toBe(true);
});

test("a yoga/scuba/gym 'school' is excluded by its non-school types", () => {
  // Carries `school` but also spa/health → not a school.
  expect(
    isQualifyingSchool(["school", "health", "spa", "point_of_interest"]),
  ).toBe(false);
  // A gym with no school type at all.
  expect(isQualifyingSchool(["gym", "health", "point_of_interest"])).toBe(false);
  // A zen / meditation center: excluded because it carries NO school type.
  expect(
    isQualifyingSchool(["place_of_worship", "point_of_interest", "establishment"]),
  ).toBe(false);
});

test("a real parochial/religious K-12 school is NOT excluded by place_of_worship", () => {
  // A church-affiliated school carries place_of_worship AND a real school type — it
  // must still qualify (excluding all religious schools would be a wrong regression).
  expect(
    isQualifyingSchool(["primary_school", "school", "place_of_worship"]),
  ).toBe(true);
});

test("a point-of-interest-only place (no school type) never qualifies", () => {
  expect(isQualifyingSchool(["point_of_interest", "establishment"])).toBe(false);
  expect(isQualifyingSchool([])).toBe(false);
  expect(isQualifyingSchool(undefined)).toBe(false);
  expect(isQualifyingSchool("school")).toBe(false); // not an array
});

/* ---- parseNearestSchool: nearest QUALIFYING selection --------------------- */

test("picks the nearest QUALIFYING school, skipping nearer non-schools", () => {
  const got = parseNearestSchool(MIXED_RESPONSE);
  expect(got).not.toBeNull();
  // Not the yoga studio or the gym that sit closer in the list.
  expect(got?.name).toBe("Lake Harriet Community School");
  expect(got?.location).toEqual({ lat: 44.912, lng: -93.31 });
});

test("returns null (graceful empty) when NO result qualifies", () => {
  const noneQualify = {
    status: "OK",
    results: [
      place("Thai Yoga Bodywork", ["school", "spa", "health"], 44.9, -93.3),
      place("Southside Strength Gym", ["gym"], 44.9, -93.3),
      place("Corner Store", ["point_of_interest", "establishment"], 44.9, -93.3),
    ],
  };
  expect(parseNearestSchool(noneQualify)).toBeNull();
});

test("returns null on ZERO_RESULTS / non-OK / malformed", () => {
  expect(parseNearestSchool({ status: "ZERO_RESULTS", results: [] })).toBeNull();
  expect(parseNearestSchool({ status: "OK", results: [] })).toBeNull();
  expect(parseNearestSchool(null)).toBeNull();
  expect(parseNearestSchool("nope")).toBeNull();
  // A qualifying school missing a coordinate is skipped, not returned half-formed.
  expect(
    parseNearestSchool({
      status: "OK",
      results: [{ name: "No Geo School", types: ["school"] }],
    }),
  ).toBeNull();
});

/* ---- nearestPlaceChip: end-to-end for schools + regression for others ----- */

test("schools chip resolves to the real school, not the nearer yoga studio", async () => {
  const kvImpl = memKv();
  const chip = await nearestPlaceChip(HOME, "schools", "test-key", {
    fetchImpl: fetchReturning(MIXED_RESPONSE),
    kvImpl,
  });
  expect(chip).not.toBeNull();
  expect(chip?.category).toBe("schools");
  expect(chip?.label).toBe("Lake Harriet Community School");
  expect(chip?.value).toBe(formatMiles(haversineMeters(HOME, REAL_SCHOOL.geometry.location)));
  // School layer writes under a bumped v2 cache key so a stale loose chip can't survive.
  expect(kvImpl.keys.some((k) => k.startsWith("btb:place:v2:schools:"))).toBe(true);
});

test("schools chip is empty (null) when nothing nearby qualifies", async () => {
  const noneQualify = {
    status: "OK",
    results: [place("Thai Yoga Bodywork", ["school", "spa"], 44.9, -93.3)],
  };
  const chip = await nearestPlaceChip(HOME, "schools", "test-key", {
    fetchImpl: fetchReturning(noneQualify),
    kvImpl: memKv(),
  });
  expect(chip).toBeNull();
});

test("REGRESSION: coffee/parks/grocery keep nearest-result behavior on v1 cache", async () => {
  // A cafe layer must still take results[0] (the nearest cafe) and must NOT run the
  // school qualification filter — proving the change is scoped to the school layer.
  const cafeResp = {
    status: "OK",
    results: [
      place("Nearest Cafe", ["cafe", "point_of_interest"], 44.907, -93.316),
      place("Farther Cafe", ["cafe"], 44.95, -93.35),
    ],
  };
  const kvImpl = memKv();
  const chip = await nearestPlaceChip(HOME, "coffee", "test-key", {
    fetchImpl: fetchReturning(cafeResp),
    kvImpl,
  });
  expect(chip?.category).toBe("coffee");
  expect(chip?.label).toBe("Nearest Cafe");
  // Non-school layers stay on the v1 cache key (untouched).
  expect(kvImpl.keys.some((k) => k.startsWith("btb:place:v1:coffee:"))).toBe(true);
  expect(kvImpl.keys.some((k) => k.includes("v2"))).toBe(false);
  // And the shared nearest-result parser is unchanged for non-schools.
  expect(parseNearestPlace(cafeResp)?.name).toBe("Nearest Cafe");
});
