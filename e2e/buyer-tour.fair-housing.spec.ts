import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  FOOTER_DISCLAIMER,
  LAYER_LABELS,
} from "../src/tools/buyer-tour-brief/output/copy";

/**
 * Buyer Tour Brief — Fair Housing guard (BUYER_TOUR_BRIEF, hard constraint).
 *
 * Studio renders agent text + FACTUAL proximity; Studio never generates a
 * qualitative school/neighborhood claim. This guard scans every Studio-generated
 * surface (the output components, copy, engine, AND the render fixtures that feed
 * the buyer page) for banned quality-judgment substrings and fails on any hit.
 *
 * Comments are stripped before scanning — JSDoc deliberately NAMES the banned
 * phrasing to explain the rule, which is not user-facing copy.
 *
 * Pure-Node test — the same shape as the truthful-copy / em-dash gates.
 */

const SCAN_ROOT = path.resolve(__dirname, "../src/tools/buyer-tour-brief");

// Banned substrings (case-insensitive). Quality judgments about schools,
// neighborhoods, or who a place is "for". Lives HERE (not in scanned source) so
// the scan can't match its own definition.
const FAIR_HOUSING_BANNED = [
  "great school",
  "best school",
  "good school",
  "top school",
  "top-rated",
  "highly rated",
  "school rating",
  "safe area",
  "safe neighborhood",
  "family neighborhood",
  "family-friendly",
  "perfect for kids",
  "good for families",
  "great for families",
  "young families",
  "ideal for retirees",
  "desirable neighborhood",
  "up-and-coming",
];

function collectSource(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(collectSource(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

test.describe("buyer-tour Fair Housing gate", () => {
  test("no banned quality-judgment copy in any Studio surface or fixture", () => {
    const files = collectSource(SCAN_ROOT);
    // Sanity: the surfaces we care about are in scope.
    expect(files.some((f) => f.endsWith("BuyerTourPage.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("copy.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__fixtures__"))).toBe(true);

    const violations: string[] = [];
    for (const file of files) {
      const lower = stripComments(readFileSync(file, "utf8")).toLowerCase();
      for (const phrase of FAIR_HOUSING_BANNED) {
        if (lower.includes(phrase)) {
          violations.push(
            `${path.relative(process.cwd(), file)} → "${phrase}"`,
          );
        }
      }
    }
    expect(
      violations,
      `Fair Housing banned copy found:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  test("school layer label is the factual 'School locations', never qualitative", () => {
    expect(LAYER_LABELS.schools).toBe("School locations");
  });

  test("footer disclaimer is present and carries the required reassurances", () => {
    const lower = FOOTER_DISCLAIMER.toLowerCase();
    expect(lower).toContain("orientation only");
    expect(lower).toContain("not a rating, recommendation, or representation");
    expect(lower).toContain("all buyers are welcome and served equally");
  });

  test("shipped fixtures model no familial-status language", () => {
    // The agent's free text isn't banned by construction, but the SAMPLE we ship
    // must not MODEL familial-status phrasing. Scan the fixture file specifically.
    const FAMILIAL_STATUS = [
      "with the kids",
      "for the kids",
      "your kids",
      "the children",
      "for families",
      "young family",
      "growing family",
      "perfect for kids",
      "good for raising",
      "great for raising",
    ];
    const file = path.resolve(SCAN_ROOT, "output/__fixtures__/sample-payload.ts");
    const lower = stripComments(readFileSync(file, "utf8")).toLowerCase();
    const hits = FAMILIAL_STATUS.filter((p) => lower.includes(p));
    expect(hits, `Familial-status copy in fixtures: ${hits.join(", ")}`).toEqual(
      [],
    );
  });

  test("no hardcoded region (JBLM / Tacoma / South Sound) in product code", () => {
    // National usability: region-specific words may live ONLY in __fixtures__
    // (sample data). Product code must stay generic — every commute label comes
    // from the tour's commuteAnchor.label at runtime.
    const REGION_WORDS = [/\bjblm\b/i, /\btacoma\b/i, /south sound/i];
    const productTrees = [
      SCAN_ROOT,
      path.resolve(__dirname, "../src/lib/buyer-tour-brief"),
    ];
    const offenders: string[] = [];
    for (const file of productTrees.flatMap(collectSource)) {
      if (file.includes("__fixtures__")) continue; // sample data is exempt
      // Strip comments — a doc example is not a region ASSUMPTION in the logic
      // (consistent with the banned-copy scan above).
      const src = stripComments(readFileSync(file, "utf8"));
      for (const re of REGION_WORDS) {
        if (re.test(src)) {
          offenders.push(`${path.relative(process.cwd(), file)} → ${re}`);
        }
      }
    }
    expect(
      offenders,
      `Hardcoded region in product code:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("detector self-test: a seeded banned phrase is caught", () => {
    const seeded = "These are the best schools in a safe neighborhood.".toLowerCase();
    const hits = FAIR_HOUSING_BANNED.filter((p) => seeded.includes(p));
    expect(hits.length).toBeGreaterThan(0);
  });
});
