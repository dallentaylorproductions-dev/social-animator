import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Buyer Tour Brief — school-context PRESENTATION contract (GREATSCHOOLS_ENABLED, DARK).
 *
 * The design polish pass fixed the row layout so `SchoolContext` matches the locked
 * mock `buyer-tour-brief-v1-context-hub-mock-2h-editorial.html`: the "Nearest school"
 * caption sits on its OWN line above the school name (they must NEVER render as one
 * run-on string), the name is its own distinct tappable node, and every row carries a
 * fixed-width, vertically centered GreatSchools badge dock.
 *
 * There is no RTL/jsdom lane in this repo, so — consistent with the school-toggle and
 * pages-library passes — the layout is locked as a SOURCE contract (no browser). This
 * guards only presentation; the data/serializer/fetch/flag are proven elsewhere.
 */

const SRC = readFileSync(
  path.resolve(
    __dirname,
    "../src/tools/buyer-tour-brief/output/SchoolContext.tsx",
  ),
  "utf8",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

const CODE = stripComments(SRC);

/* ---- caption and name are separate nodes (no run-on collision) ------------- */

test("the 'Nearest school' caption is a block-level flex row, not inline-flex", () => {
  // inline-flex let the inline school-name anchor flow onto the SAME line, producing
  // "Nearest schoolLake Harriet Upper Elementary". A block-level flex row drops the
  // name to its own line below.
  expect(CODE).toContain("Nearest school");
  expect(CODE).not.toContain("inline-flex items-center gap-1.5");
  // The caption row is its own block: mb + flex, sizing to content with w-fit.
  expect(CODE).toMatch(/mb-\[5px\] flex w-fit items-center gap-1\.5/);
});

test("the caption and the school name are distinct JSX nodes in order", () => {
  const captionAt = CODE.indexOf("Nearest school");
  const nameAt = CODE.indexOf("{school.name}");
  expect(captionAt).toBeGreaterThan(-1);
  expect(nameAt).toBeGreaterThan(-1);
  // The caption text closes its own element before the name node opens.
  expect(nameAt).toBeGreaterThan(captionAt);
});

test("the school name wraps with comfortable line-height", () => {
  // Long names ("Lake Harriet Upper Elementary") must wrap cleanly, not crowd.
  expect(CODE).toContain("text-[15px] font-bold leading-[1.3] text-[#16211F]");
});

/* ---- badge dock: present per row, fixed width, vertically centered --------- */

test("every rated row carries a fixed-width, centered GreatSchools badge dock", () => {
  expect(CODE).toContain("btb-school-badge-");
  // Fixed 122px dock, flex-none, vertically + horizontally centered against the row.
  expect(CODE).toMatch(
    /flex w-\[122px\] flex-none items-center justify-center border-l/,
  );
  // The row itself stretches so the dock can center against the full text block.
  expect(CODE).toContain("flex items-stretch border-b");
  // The badge asset stays at the required unmodified minimum (97px), not shrunk.
  expect(CODE).toContain('width={97}');
});

test("the no-rating dock matches the rated dock width (consistent row rhythm)", () => {
  // Both the badge dock and the text fallback are w-[122px] so rows align evenly.
  const dockWidths = CODE.match(/w-\[122px\]/g) ?? [];
  expect(dockWidths.length).toBeGreaterThanOrEqual(2);
});

/* ---- copy stays clean ------------------------------------------------------ */

test("no em dash in the presentation copy", () => {
  expect(CODE).not.toContain("—");
});
