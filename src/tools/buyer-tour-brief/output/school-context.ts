/**
 * Buyer Tour Brief V1 — pure helpers for the GreatSchools "School context" section
 * (GREATSCHOOLS_ENABLED). No I/O, no persistence — presentation logic only, so it
 * can be unit-tested without a network. The live fetch lives in the server module
 * `@/lib/buyer-tour-brief/greatschools` and is called at render time in the page.
 *
 * FAIR HOUSING + ToS: Studio never rates/ranks/interprets. These helpers only
 * SELECT which sourced school to show and FORMAT sourced facts for display; the
 * rating band string itself is passed through verbatim (never re-cased/paraphrased),
 * and the band→icon lookup is case-insensitive (spike finding #4). Nothing here
 * stores or derives a competing dataset.
 */

import type { NormalizedSchool } from "@/lib/buyer-tour-brief/greatschools";

/** One resolved school row on the buyer page: the home's stop + its chosen school. */
export interface SchoolRow {
  /** 1-based stop (1→A, 2→B …) — matches the home's tour order. */
  stop: number;
  school: NormalizedSchool;
}

/** The four band icon slugs shipped in `public/greatschools/`. */
export type BandIconSlug =
  | "above-average"
  | "average"
  | "below-average"
  | "not-available";

/**
 * Per-home selection rule (spike finding #5): dense areas return private/unrated
 * schools closest, so the geometrically-nearest result is often an unrated private
 * school. Prefer the NEAREST school that carries a usable rating band (only public
 * schools get a band in the data); fall back to the nearest overall when none is
 * rated (it renders the honest "no rating" state). Input is already closest-first
 * (the API returns by distance and the module preserves that order). Never throws.
 */
export function selectSchoolForHome(
  schools: readonly NormalizedSchool[],
): NormalizedSchool | null {
  if (!Array.isArray(schools) || schools.length === 0) return null;
  const rated = schools.find((s) => s.ratingBand !== null);
  return rated ?? schools[0];
}

/**
 * Map a rating band string to its badge SVG slug, CASE-INSENSITIVELY (finding #4:
 * live bands are sentence-case "Above average"; never rely on exact casing for the
 * lookup). Returns null for `null`/blank/unknown so the caller renders the no-rating
 * state instead of a wrong badge. The DISPLAYED band string stays verbatim elsewhere.
 */
export function bandToIconSlug(band: string | null): Exclude<BandIconSlug, "not-available"> | null {
  if (typeof band !== "string") return null;
  switch (band.trim().toLowerCase()) {
    case "above average":
      return "above-average";
    case "average":
      return "average";
    case "below average":
      return "below-average";
    default:
      return null;
  }
}

/** Format the API distance (miles, float) as the buyer-facing "0.3 mi" chip. */
export function formatSchoolDistance(distanceMi: number | null): string | null {
  if (typeof distanceMi !== "number" || !Number.isFinite(distanceMi)) return null;
  if (distanceMi < 0.1) return "<0.1 mi";
  return `${distanceMi.toFixed(1)} mi`;
}

/** One grade token → its display form (e.g. "KG" → "K", "PK"/"TK" → "PK"). */
function gradeToken(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (t === "KG") return "K";
  if (t === "TK") return "PK";
  return t; // PK, UG, or a numeric grade
}

/**
 * Format the API `gradeRange` (a served-grades LIST like "KG,1,2,3,4,5" — there is
 * NO range field) into the mock's "Grades K to 5" line. Single grade → "Grade K".
 * Returns null for blank input. Display formatting of sourced facts only.
 */
export function formatGradeRange(gradeList: string | null): string | null {
  if (typeof gradeList !== "string") return null;
  const parts = gradeList
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const first = gradeToken(parts[0]);
  const last = gradeToken(parts[parts.length - 1]);
  return first === last ? `Grade ${first}` : `Grades ${first} to ${last}`;
}

/**
 * The one-line subhead under the school name: "0.3 mi · Grades K to 5 · District".
 * Any missing segment is dropped (uneven results never look broken — finding #8).
 */
export function schoolSubline(school: NormalizedSchool): string {
  return [
    formatSchoolDistance(school.distanceMi),
    formatGradeRange(school.gradeRange),
    school.district,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" · ");
}

/**
 * Derive the GreatSchools CITY directory URL for the "See middle & high schools"
 * link-out from a school profile URL. GS profile URLs are
 * `https://www.greatschools.org/{state}/{city}/{id-slug}/`; the directory is
 * `…/{state}/{city}/schools/`. Falls back to the profile URL if the shape is
 * unexpected (never fabricates a broken link).
 */
export function cityDirectoryUrl(profileUrl: string | null): string | null {
  if (typeof profileUrl !== "string" || profileUrl.length === 0) return null;
  try {
    const u = new URL(profileUrl);
    const segs = u.pathname.split("/").filter((s) => s.length > 0);
    if (segs.length >= 2) {
      return `${u.origin}/${segs[0]}/${segs[1]}/schools/`;
    }
    return profileUrl;
  } catch {
    return profileUrl;
  }
}
