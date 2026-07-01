/**
 * SYNTHETIC GreatSchools NearbySchools fixtures — FABRICATED data in the shape the
 * GreatSchools NearbySchools API v2 actually returns (confirmed live on a preview
 * deploy 2026-07-01; the real response is NOT committed — a committed response is a
 * stored copy, prohibited by ToS 3.2.2).
 *
 * ⚠️ NOT real GreatSchools data. Every id, name, coordinate, district, url, and
 * distance is invented. The band STRINGS reproduce the exact live vocabulary +
 * casing ("Above average" / "Average" / "Below average") and the live "no rating"
 * sentinel (the literal string "null") only so the tests can prove the normalizer
 * passes bands through verbatim and maps the "null" sentinel to a real null.
 *
 * CONFIRMED LIVE per-school keys (v2): `universal-id`, `nces-id`, `state-id`,
 * `name`, `school-summary`, `type`, `level-codes` ("e,m,h"), `level` (served-grades
 * LIST "KG,1,2,3,…"), `street`, `city`, `state`, `fipscounty`, `zip`, `phone`,
 * `fax`, `county`, `lat`, `lon`, `district-name`, `district-id`, `web-site`,
 * `overview-url`, `rating_band` (UNDERSCORE; "null" string when unrated),
 * `distance` (miles, float). NOTE: there is NO `grade-range` field.
 */

/** A well-formed response envelope: three schools spanning all three bands. */
export const SYNTHETIC_NEARBY_SCHOOLS_RAW = {
  schools: [
    {
      "universal-id": "0000001",
      "nces-id": "000000000001",
      name: "Fictional Creek Elementary",
      type: "public",
      "level-codes": "e",
      level: "KG,1,2,3,4,5",
      "district-name": "Made-Up Unified School District",
      lat: 30.111111,
      lon: -97.111111,
      "overview-url":
        "https://www.greatschools.org/example/fictional-creek-elementary/1/",
      rating_band: "Above average",
      distance: 0.4,
    },
    {
      "universal-id": "0000002",
      "nces-id": "000000000002",
      name: "Invented Ridge Middle School",
      type: "public",
      "level-codes": "m",
      level: "6,7,8",
      "district-name": "Made-Up Unified School District",
      lat: 30.122222,
      lon: -97.122222,
      "overview-url":
        "https://www.greatschools.org/example/invented-ridge-middle/2/",
      rating_band: "Average",
      distance: 1.2,
    },
    {
      "universal-id": "0000003",
      "nces-id": "000000000003",
      name: "Placeholder Valley High School",
      type: "public",
      "level-codes": "h",
      level: "9,10,11,12",
      "district-name": "Made-Up Unified School District",
      lat: 30.133333,
      lon: -97.133333,
      "overview-url":
        "https://www.greatschools.org/example/placeholder-valley-high/3/",
      rating_band: "Below average",
      distance: 2.7,
    },
  ],
  total_count: 3,
};

/** An UNRATED school — the live sentinel is the literal string "null". Must
 *  normalize to `ratingBand: null`, never the word "null" or a fabricated band. */
export const SYNTHETIC_NO_RATING_RAW = {
  schools: [
    {
      "universal-id": "0000004",
      name: "Unrated Charter Academy",
      type: "charter",
      "level-codes": "e,m",
      level: "KG,1,2,3,4,5,6,7,8",
      "district-name": null,
      lat: 30.144444,
      lon: -97.144444,
      "overview-url":
        "https://www.greatschools.org/example/unrated-charter-academy/4/",
      rating_band: "null", // ← literal string, the live "no rating" sentinel
      distance: 0.9,
    },
  ],
};

/** A partial/mixed response: one school with only name + url, one with a
 *  whitespace-only band. The normalizer must handle uneven results. */
export const SYNTHETIC_PARTIAL_RAW = {
  schools: [
    {
      "universal-id": "0000005",
      name: "Sparse Fields Elementary",
      "overview-url":
        "https://www.greatschools.org/example/sparse-fields-elementary/5/",
      // no level-codes, level, district-name, distance, or rating_band
    },
    {
      "universal-id": "0000006",
      name: "Whitespace Band Middle",
      "level-codes": "m",
      level: "6,7,8",
      "district-name": "Made-Up Unified School District",
      "overview-url":
        "https://www.greatschools.org/example/whitespace-band-middle/6/",
      rating_band: "   ", // whitespace-only → treated as no rating
      distance: 3.1,
    },
  ],
};

/** Empty result: a valid response envelope with zero schools nearby. */
export const SYNTHETIC_EMPTY_RAW = { schools: [], total_count: 0 };
