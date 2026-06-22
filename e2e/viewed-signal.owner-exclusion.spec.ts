import { test, expect } from "@playwright/test";
import { isOwnerSelfView } from "../src/lib/seller-presentation/views-store";
import { isViewedSignalOwnerExcludeEnabled } from "../src/lib/seller-presentation/viewed-signal";

/**
 * Viewed signal — owner self-view exclusion (Phase 1 correctness).
 *
 * The agent opening their OWN published page must never count as seller
 * engagement (it would pollute the "real seller engaged" signal the follow-up
 * wedge depends on). The POST /api/h/[slug]/view route resolves the signed-in
 * session email + the page owner email and asks the PURE `isOwnerSelfView`
 * guard for the verdict — so the count-deciding logic runs as a node-context
 * Playwright spec, the only runner this repo has. The route's impure surface
 * (auth() + KV) is verified on preview, exactly as the views-store suite
 * documents for recordView/getViews.
 *
 * The matching guarantee: a SELF-view is dropped; a non-owner / anonymous
 * seller view (no session email) is NEVER a self-view, so real views count.
 */

test.describe("isOwnerSelfView — the agent's own page open never counts", () => {
  test("owner viewing their own page IS a self-view (dropped)", () => {
    expect(isOwnerSelfView("agent@example.com", "agent@example.com")).toBe(true);
  });

  test("case + surrounding whitespace are normalized before compare", () => {
    expect(isOwnerSelfView("  Agent@Example.com ", "agent@example.com")).toBe(
      true,
    );
  });

  test("a different signed-in viewer is NOT a self-view (counts)", () => {
    expect(isOwnerSelfView("seller@example.com", "agent@example.com")).toBe(
      false,
    );
  });

  test("an anonymous seller (no session email) is NEVER a self-view", () => {
    // The common case: the beacon carries no session, so auth() yields no
    // email. Real seller views must still count.
    expect(isOwnerSelfView(null, "agent@example.com")).toBe(false);
    expect(isOwnerSelfView(undefined, "agent@example.com")).toBe(false);
    expect(isOwnerSelfView("", "agent@example.com")).toBe(false);
    expect(isOwnerSelfView("   ", "agent@example.com")).toBe(false);
  });

  test("a missing owner email never spuriously matches", () => {
    expect(isOwnerSelfView("agent@example.com", null)).toBe(false);
    expect(isOwnerSelfView("agent@example.com", undefined)).toBe(false);
    expect(isOwnerSelfView("", "")).toBe(false);
  });
});

test.describe("VIEWED_SIGNAL_OWNER_EXCLUDE — default-on rollback flag", () => {
  const original = process.env.VIEWED_SIGNAL_OWNER_EXCLUDE;

  test.afterEach(() => {
    if (original === undefined) delete process.env.VIEWED_SIGNAL_OWNER_EXCLUDE;
    else process.env.VIEWED_SIGNAL_OWNER_EXCLUDE = original;
  });

  test("ON by default (unset) — exclusion active", () => {
    delete process.env.VIEWED_SIGNAL_OWNER_EXCLUDE;
    expect(isViewedSignalOwnerExcludeEnabled()).toBe(true);
  });

  test('only the literal "false" disables it (rollback escape hatch)', () => {
    process.env.VIEWED_SIGNAL_OWNER_EXCLUDE = "false";
    expect(isViewedSignalOwnerExcludeEnabled()).toBe(false);
  });

  test('any other value keeps it on (e.g. "true", "1", "")', () => {
    process.env.VIEWED_SIGNAL_OWNER_EXCLUDE = "true";
    expect(isViewedSignalOwnerExcludeEnabled()).toBe(true);
    process.env.VIEWED_SIGNAL_OWNER_EXCLUDE = "";
    expect(isViewedSignalOwnerExcludeEnabled()).toBe(true);
  });
});
