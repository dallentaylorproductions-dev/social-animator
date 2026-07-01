import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bandToIconSlug,
  cityDirectoryUrl,
  formatGradeRange,
  formatSchoolDistance,
  schoolSubline,
  selectSchoolForHome,
} from "../src/tools/buyer-tour-brief/output/school-context";
import type { NormalizedSchool } from "../src/lib/buyer-tour-brief/greatschools";

/**
 * Buyer Tour Brief V1 school section — pure presentation-logic locks
 * (GREATSCHOOLS_ENABLED). Proves the per-home selection rule (finding #5), the
 * case-insensitive band→icon lookup with verbatim display (finding #4), the
 * sourced-fact formatters, the link-out URL derivation, and a no-persistence source
 * contract on the helper module.
 */

function school(overrides: Partial<NormalizedSchool> = {}): NormalizedSchool {
  return {
    name: "Test School",
    level: "e",
    gradeRange: "KG,1,2,3,4,5",
    district: "Test District",
    ratingBand: "Average",
    profileUrl: "https://www.greatschools.org/texas/austin/1-Test-School/",
    distanceMi: 0.5,
    ...overrides,
  };
}

/* ---- selection rule (finding #5) ------------------------------------------ */

test("selection prefers the nearest RATED school over a closer unrated one", () => {
  // closest-first: an unrated private school is closest, a rated public one is next.
  const schools = [
    school({ name: "Closest Private", ratingBand: null, district: null, distanceMi: 0.1 }),
    school({ name: "Nearby Public", ratingBand: "Above average", distanceMi: 0.6 }),
  ];
  expect(selectSchoolForHome(schools)?.name).toBe("Nearby Public");
});

test("selection falls back to the nearest overall when NONE is rated", () => {
  const schools = [
    school({ name: "Closest Unrated", ratingBand: null, distanceMi: 0.1 }),
    school({ name: "Farther Unrated", ratingBand: null, distanceMi: 0.9 }),
  ];
  expect(selectSchoolForHome(schools)?.name).toBe("Closest Unrated");
});

test("selection returns the first rated even when the very first is already rated", () => {
  const schools = [
    school({ name: "Rated First", ratingBand: "Below average", distanceMi: 0.2 }),
    school({ name: "Also Rated", ratingBand: "Average", distanceMi: 0.3 }),
  ];
  expect(selectSchoolForHome(schools)?.name).toBe("Rated First");
});

test("selection on an empty list returns null", () => {
  expect(selectSchoolForHome([])).toBeNull();
});

/* ---- band → icon, case-insensitive; display stays verbatim (finding #4) --- */

test("band→icon maps the live sentence-case strings", () => {
  expect(bandToIconSlug("Above average")).toBe("above-average");
  expect(bandToIconSlug("Average")).toBe("average");
  expect(bandToIconSlug("Below average")).toBe("below-average");
});

test("band→icon is case-insensitive (never relies on exact source casing)", () => {
  expect(bandToIconSlug("above average")).toBe("above-average");
  expect(bandToIconSlug("ABOVE AVERAGE")).toBe("above-average");
  expect(bandToIconSlug("Below Average")).toBe("below-average");
  expect(bandToIconSlug("  average  ")).toBe("average");
});

test("band→icon returns null for no-rating / unknown (renders the text row, not a wrong badge)", () => {
  expect(bandToIconSlug(null)).toBeNull();
  expect(bandToIconSlug("")).toBeNull();
  expect(bandToIconSlug("null")).toBeNull();
  expect(bandToIconSlug("Excellent")).toBeNull();
});

/* ---- formatters ----------------------------------------------------------- */

test("formatGradeRange turns the served-grades LIST into the mock's 'Grades K to 5'", () => {
  expect(formatGradeRange("KG,1,2,3,4,5")).toBe("Grades K to 5");
  expect(formatGradeRange("6,7,8")).toBe("Grades 6 to 8");
  expect(formatGradeRange("9,10,11,12")).toBe("Grades 9 to 12");
  expect(formatGradeRange("PK,KG,1,2,3,4,5,6,7,8")).toBe("Grades PK to 8");
  expect(formatGradeRange("KG")).toBe("Grade K");
  expect(formatGradeRange(null)).toBeNull();
  expect(formatGradeRange("")).toBeNull();
});

test("formatSchoolDistance renders miles like the mock", () => {
  expect(formatSchoolDistance(0.3)).toBe("0.3 mi");
  expect(formatSchoolDistance(1.24)).toBe("1.2 mi");
  expect(formatSchoolDistance(0.04)).toBe("<0.1 mi");
  expect(formatSchoolDistance(null)).toBeNull();
});

test("schoolSubline joins present segments and drops missing ones", () => {
  expect(schoolSubline(school({ distanceMi: 0.3, gradeRange: "KG,1,2,3,4,5", district: "Edina Public Schools" }))).toBe(
    "0.3 mi · Grades K to 5 · Edina Public Schools",
  );
  // A private school with no district / no grades → just the distance, never broken.
  expect(schoolSubline(school({ distanceMi: 0.2, gradeRange: null, district: null }))).toBe("0.2 mi");
});

/* ---- link-out URL derivation ---------------------------------------------- */

test("cityDirectoryUrl derives the GreatSchools city schools directory from a profile URL", () => {
  expect(
    cityDirectoryUrl("https://www.greatschools.org/minnesota/edina/1201-Concord-Elementary-School/"),
  ).toBe("https://www.greatschools.org/minnesota/edina/schools/");
  // Falls back to the profile URL on an unexpected shape (never a broken link).
  expect(cityDirectoryUrl("https://www.greatschools.org/onlyoneseg/")).toBe(
    "https://www.greatschools.org/onlyoneseg/",
  );
  expect(cityDirectoryUrl(null)).toBeNull();
  expect(cityDirectoryUrl("not a url")).toBe("not a url");
});

/* ---- no-persistence source contract --------------------------------------- */

test("the school-context helpers have NO persistence path (no kv/cache/storage/network)", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../src/tools/buyer-tour-brief/output/school-context.ts"),
    "utf8",
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  expect(code).not.toContain("@vercel/kv");
  expect(code).not.toMatch(/\b(kv|store|cache)\s*\.\s*set\s*\(/);
  expect(code).not.toContain("fetch(");
  expect(code).not.toContain("localStorage");
  expect(code).not.toContain("writeFile");
});
