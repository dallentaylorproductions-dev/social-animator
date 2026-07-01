import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EMPTY_BUYER_TOUR_DRAFT } from "../src/tools/buyer-tour-brief/engine/types";

/**
 * Buyer Tour Brief — school-context builder TOGGLE source contract
 * (GREATSCHOOLS_ENABLED, DARK). The data + serializer + public render already
 * exist on main (PR #131). This pass adds ONLY the agent-facing on/off control that
 * sets the existing `schoolLayer` boolean, gated server-side.
 *
 * There is no RTL/jsdom lane in this repo, so — consistent with the pages-library
 * pass — the control is locked as a SOURCE contract in the Node worker (no browser):
 *   • the /buyer-tour route reads GREATSCHOOLS_ENABLED server-side and passes it down;
 *   • the client component NEVER reads the server-only flag itself;
 *   • the toggle is gated on that prop (absent when the flag is off — dark);
 *   • it binds to `draft.schoolLayer` through the EXISTING `patch` save path;
 *   • it defaults OFF (the empty draft carries no `schoolLayer`);
 *   • the copy is the plain, Fair-Housing-safe, em-dash-free packet copy.
 *
 * The publish projection (payload includes `schoolLayer` when on, defaults off, drops
 * a tampered non-boolean) is already proven in e2e/buyer-tour.public-payload.spec.ts.
 */

const ROUTE = readFileSync(
  path.resolve(__dirname, "../src/app/buyer-tour/page.tsx"),
  "utf8",
);
const BUILDER = readFileSync(
  path.resolve(
    __dirname,
    "../src/tools/buyer-tour-brief/components/BuyerTourBuilder.tsx",
  ),
  "utf8",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

const ROUTE_CODE = stripComments(ROUTE);
const BUILDER_CODE = stripComments(BUILDER);

/* ---- server-side visibility gate ------------------------------------------ */

test("the /buyer-tour route reads GREATSCHOOLS_ENABLED server-side and passes it down", () => {
  expect(ROUTE_CODE).toContain(
    'import { isGreatSchoolsEnabled } from "@/lib/config/greatschools"',
  );
  // The flag is resolved on the server and handed to the client component as a prop.
  expect(ROUTE_CODE).toMatch(
    /schoolLayerAvailable=\{isGreatSchoolsEnabled\(\)\}/,
  );
  // Gate order: the BUYER_TOUR_BRIEF 404 guard still runs FIRST, so with that flag
  // off the route is byte-identical (isGreatSchoolsEnabled is never even evaluated).
  expect(ROUTE_CODE.indexOf("notFound()")).toBeLessThan(
    ROUTE_CODE.indexOf("schoolLayerAvailable"),
  );
});

test("the client builder never reads the server-only flag directly", () => {
  // GREATSCHOOLS_ENABLED / isGreatSchoolsEnabled must be resolved server-side only;
  // reading it in this "use client" file would silently be false in the browser.
  expect(BUILDER_CODE).not.toContain("isGreatSchoolsEnabled");
  expect(BUILDER_CODE).not.toContain("GREATSCHOOLS_ENABLED");
  expect(BUILDER_CODE).not.toContain("process.env");
});

/* ---- the toggle: gated, bound, default off -------------------------------- */

test("the builder accepts the schoolLayerAvailable prop, defaulting OFF (dark)", () => {
  expect(BUILDER_CODE).toMatch(/schoolLayerAvailable\s*=\s*false/);
});

test("the toggle section is gated on schoolLayerAvailable (absent when the flag is off)", () => {
  // The whole School context section renders only inside the prop guard.
  expect(BUILDER_CODE).toMatch(/\{schoolLayerAvailable\s*&&\s*\(/);
  const guardAt = BUILDER_CODE.indexOf("{schoolLayerAvailable &&");
  const sectionAt = BUILDER_CODE.indexOf('data-testid="btb-school-context"');
  const toggleAt = BUILDER_CODE.indexOf('data-testid="btb-school-layer-toggle"');
  expect(guardAt).toBeGreaterThan(-1);
  expect(sectionAt).toBeGreaterThan(guardAt);
  expect(toggleAt).toBeGreaterThan(guardAt);
});

test("the toggle binds to draft.schoolLayer through the existing patch save path", () => {
  // Reads the draft value...
  expect(BUILDER_CODE).toContain("draft.schoolLayer === true");
  // ...and flips it via the SAME patch() the other tour-level fields use — no new
  // persistence path, so it survives save/reload and rides publish.
  expect(BUILDER_CODE).toMatch(
    /patch\(\{\s*schoolLayer:\s*!draft\.schoolLayer\s*\}\)/,
  );
  // Reflected to assistive tech as a real switch.
  expect(BUILDER_CODE).toMatch(/role="switch"/);
  expect(BUILDER_CODE).toContain("aria-checked={draft.schoolLayer === true}");
});

test("the empty draft carries no schoolLayer, so a new/old tour defaults OFF", () => {
  // Old drafts lacking the field, and every new draft, are undefined → the toggle
  // reads OFF (=== true is false) and the payload projects nothing.
  expect(EMPTY_BUYER_TOUR_DRAFT.schoolLayer).toBeUndefined();
});

test("the initial builder state does not pre-set schoolLayer on", () => {
  // The useState initializer seeds priorities + homes but never schoolLayer.
  const initBlock = BUILDER_CODE.slice(
    BUILDER_CODE.indexOf("useState<BuyerTourDraft>"),
    BUILDER_CODE.indexOf("const [copied"),
  );
  expect(initBlock).not.toContain("schoolLayer");
});

/* ---- copy: plain, Fair-Housing-safe, no em dash --------------------------- */

test("copy is the packet's plain, Fair-Housing-safe wording", () => {
  expect(BUILDER_CODE).toContain("Show nearby school-ratings");
  expect(BUILDER_CODE).toContain(
    "Adds a GreatSchools school-ratings section to this tour",
  );
  expect(BUILDER_CODE).toContain("shown the same way for every home");
  expect(BUILDER_CODE).toContain(
    "Sourced from GreatSchools, not your or Studio",
  );
});

test("the school toggle copy carries no em dash and no bare 'school rating' claim", () => {
  // No em dash in the user-facing copy (Dallen reads it as an AI tell; the packet
  // forbids it). Scanned over comment-stripped code, matching the repo's em-dash
  // gate, so pre-existing JSDoc dashes elsewhere in the file are out of scope.
  expect(BUILDER_CODE).not.toContain("—");
  // The Fair-Housing gate bans the bare substring "school rating"; the copy uses the
  // hyphenated compound "school-ratings" so Studio never appears to rate schools.
  // (Comments stripped so the JSDoc naming the rule doesn't self-trip.)
  expect(BUILDER_CODE.toLowerCase()).not.toContain("school rating");
});
