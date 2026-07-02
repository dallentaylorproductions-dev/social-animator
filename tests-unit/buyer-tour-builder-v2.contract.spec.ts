import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Buyer Tour Brief — BUILDER_V2 source contract (BUYER_TOUR_BUILDER_V2, DARK).
 *
 * There is no RTL/jsdom lane in this repo, so — consistent with the school-toggle and
 * pages-library passes — the V2 builder-friction pass is locked as a SOURCE contract
 * in the Node worker (no browser). It proves the invariants that keep flag-off
 * byte-identical and the flag ON→OFF story honest:
 *   • the route renders the WORKSPACE only when V2 is on, and the standalone BUILDER
 *     (same two props as today) when off — behind the BUYER_TOUR_BRIEF 404 gate;
 *   • every new BuyerTourBuilder prop DEFAULTS to today's behavior;
 *   • the middleware gate is conditioned on the V2 flag (byte-identical route when off);
 *   • the publish gate softens "why" ONLY under the V2 flag;
 *   • the client components never read the server-only flag;
 *   • the preview renders the REAL buyer page; the formatters are the flagship's.
 */

function read(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

const ROUTE = stripComments(read("src/app/buyer-tour/page.tsx"));
const BUILDER = stripComments(
  read("src/tools/buyer-tour-brief/components/BuyerTourBuilder.tsx"),
);
const WORKSPACE = stripComments(
  read("src/tools/buyer-tour-brief/components/BuyerTourWorkspace.tsx"),
);
const PREVIEW = stripComments(
  read("src/tools/buyer-tour-brief/components/BuyerTourPreview.tsx"),
);
const MIDDLEWARE = stripComments(read("src/middleware.ts"));
const PUBLISH = stripComments(read("src/app/api/buyer-tour/publish/route.ts"));
const TOURS = stripComments(read("src/app/api/buyer-tour/tours/route.ts"));
const FLAG = stripComments(read("src/lib/config/buyer-tour-builder-v2.ts"));

/* ---- flag: server-only env read ------------------------------------------- */

test("the flag is a server-only env read (mirrors the sibling buyer-tour flags)", () => {
  expect(FLAG).toContain('process.env.BUYER_TOUR_BUILDER_V2 === "true"');
  expect(FLAG).not.toContain("NEXT_PUBLIC");
});

/* ---- route: gate order + which experience renders ------------------------- */

test("the route 404s on BUYER_TOUR_BRIEF FIRST, before any V2 branching", () => {
  expect(ROUTE).toContain("if (!isBuyerTourBriefEnabled()) notFound()");
  // The gate runs before the V2 branch CALL (not the import), so BUYER_TOUR_BRIEF off
  // is byte-identical — the V2 flag is never even evaluated.
  expect(ROUTE.indexOf("notFound()")).toBeLessThan(
    ROUTE.indexOf("if (!isBuyerTourBuilderV2Enabled())"),
  );
});

test("V2 OFF renders the standalone builder with EXACTLY today's two props", () => {
  // The flag-off branch returns the builder — not the workspace — with the same
  // schoolLayerAvailable + analyticsAvailable props it has always received.
  expect(ROUTE).toMatch(/if \(!isBuyerTourBuilderV2Enabled\(\)\) \{/);
  const offBranch = ROUTE.slice(
    ROUTE.indexOf("if (!isBuyerTourBuilderV2Enabled())"),
    ROUTE.indexOf("const session = await auth()"),
  );
  expect(offBranch).toContain("<BuyerTourBuilder");
  expect(offBranch).toContain("schoolLayerAvailable={isGreatSchoolsEnabled()}");
  expect(offBranch).toContain("analyticsAvailable={isBuyerTourAnalyticsEnabled()}");
  expect(offBranch).not.toContain("BuyerTourWorkspace");
});

test("V2 ON renders the workspace with the server-resolved flags + owner email", () => {
  expect(ROUTE).toContain("<BuyerTourWorkspace");
  expect(ROUTE).toContain("ownerEmail={ownerEmail}");
  expect(ROUTE).toContain("previewV1={isBuyerTourBriefV1Enabled()}");
  // Owner email is resolved from the server session, only on the V2 path.
  expect(ROUTE).toContain("const session = await auth()");
});

/* ---- builder: every new prop defaults to today's behavior ----------------- */

test("all V2 opt-in props default to today's behavior (byte-identical when unset)", () => {
  expect(BUILDER).toMatch(/embedded\s*=\s*false/);
  expect(BUILDER).toMatch(/formatNumbers\s*=\s*false/);
  expect(BUILDER).toMatch(/softWhy\s*=\s*false/);
  expect(BUILDER).toMatch(/initialSlug\s*=\s*null/);
});

test("onStateChange is optional and invoked safely (no-op when the prop is absent)", () => {
  expect(BUILDER).toContain("onStateChange?.(");
});

test("the standalone shell + width are preserved on the default (non-embedded) path", () => {
  // Shell is <main> and container is the max-w-2xl centering unless embedded.
  expect(BUILDER).toContain('embedded ? "div" : "main"');
  expect(BUILDER).toContain("min-h-screen bg-neutral-950 text-neutral-100");
  expect(BUILDER).toContain("mx-auto w-full max-w-2xl px-4 py-8");
});

test("the plain number input for price/beds/baths/sqft is retained for the default path", () => {
  // The else branch (formatNumbers off) is verbatim today's number input.
  expect(BUILDER).toContain('type="number"');
  expect(BUILDER).toMatch(/const formatted =\s*\n?\s*formatNumbers && \(k === "price" \|\| k === "sqft"\)/);
});

test("Lever 4 formatters are the flagship's, not reinvented", () => {
  expect(BUILDER).toContain(
    'from "@/components/inputs/formatHelpers"',
  );
  expect(BUILDER).toContain("formatCurrency(raw)");
  expect(BUILDER).toContain("formatNumberWithCommas(raw)");
  expect(BUILDER).toContain("stripToDigits(e.target.value)");
});

test("the builder never reads the server-only flag or process.env", () => {
  expect(BUILDER).not.toContain("BUYER_TOUR_BUILDER_V2");
  expect(BUILDER).not.toContain("process.env");
});

/* ---- middleware: gate conditioned on the flag (byte-identical when off) ---- */

test("the /buyer-tour route is in the matcher", () => {
  expect(MIDDLEWARE).toContain('"/buyer-tour"');
  expect(MIDDLEWARE).toContain('"/buyer-tour/:path*"');
});

test("middleware early-returns for /buyer-tour when V2 is OFF (no auth gate = today)", () => {
  expect(MIDDLEWARE).toContain(
    'pathname.startsWith("/buyer-tour") && !isBuyerTourBuilderV2Enabled()',
  );
  // That early-return must precede the identity redirect so flag-off never redirects.
  const earlyReturnAt = MIDDLEWARE.indexOf(
    'pathname.startsWith("/buyer-tour") && !isBuyerTourBuilderV2Enabled()',
  );
  const identityGateAt = MIDDLEWARE.indexOf("if (!isLoggedIn)");
  expect(earlyReturnAt).toBeGreaterThan(-1);
  expect(earlyReturnAt).toBeLessThan(identityGateAt);
});

test("when V2 is on, /buyer-tour is identity-only (bypasses the subscription check)", () => {
  // After the identity gate, /buyer-tour returns next() before the paywall redirect.
  const subBypassAt = MIDDLEWARE.lastIndexOf('pathname.startsWith("/buyer-tour")');
  const paywallRedirectAt = MIDDLEWARE.indexOf('new URL("/paywall"');
  expect(subBypassAt).toBeGreaterThan(-1);
  expect(subBypassAt).toBeLessThan(paywallRedirectAt);
});

/* ---- publish: soften "why" ONLY under the flag ---------------------------- */

test("publish softens the per-home why ONLY when V2 is on (flag-off = today)", () => {
  expect(PUBLISH).toContain(
    "requireWhy: !isBuyerTourBuilderV2Enabled()",
  );
});

/* ---- workspace + preview: client isolation + real render ------------------ */

test("the workspace + preview never read the server-only flag or process.env", () => {
  for (const src of [WORKSPACE, PREVIEW]) {
    expect(src).not.toContain("BUYER_TOUR_BUILDER_V2");
    expect(src).not.toContain("process.env");
  }
});

test("the preview renders the REAL buyer page, read-only (no analytics/tracker)", () => {
  expect(PREVIEW).toContain("import { BuyerTourPage }");
  expect(PREVIEW).toContain("toBuyerTourPublicPayload");
  expect(PREVIEW).toContain("analytics={false}");
});

test("the workspace autosaves via the existing workflow-instance storage pattern", () => {
  expect(WORKSPACE).toContain('from "@/skills/workflow-instance-storage"');
  expect(WORKSPACE).toContain('const SKILL_ID = "buyer-tour"');
  expect(WORKSPACE).toContain("createInstance");
  expect(WORKSPACE).toContain("saveInstance");
  expect(WORKSPACE).toContain("markPublished");
  // Autosave + preview are debounced so typing is never blocked.
  expect(WORKSPACE).toContain("PREVIEW_DEBOUNCE_MS");
  expect(WORKSPACE).toContain("SAVE_DEBOUNCE_MS");
});

test("the workspace passes the V2 levers into the embedded builder", () => {
  expect(WORKSPACE).toContain("embedded");
  expect(WORKSPACE).toContain("formatNumbers");
  expect(WORKSPACE).toContain("softWhy");
  expect(WORKSPACE).toContain("onStateChange={onStateChange}");
});

/* ---- tours API: gated + owner-scoped -------------------------------------- */

test("the tours API is gated by both buyer-tour flags and requires auth", () => {
  expect(TOURS).toContain("isBuyerTourBuilderV2Enabled()");
  expect(TOURS).toContain("isBuyerTourBriefEnabled()");
  expect(TOURS).toContain("const session = await auth()");
  expect(TOURS).toContain("Not authenticated");
});

test("the tours API is owner-scoped and filtered to buyer-tour handouts", () => {
  expect(TOURS).toContain("listOwnerHandoutRecords(email)");
  expect(TOURS).toContain("r.type === BUYER_TOUR_HANDOUT_TYPE");
  // The single-tour fetch re-checks ownership before returning a payload.
  expect(TOURS).toContain("record.ownerEmail.toLowerCase() !== email.toLowerCase()");
});
