import { test, expect } from "@playwright/test";

/**
 * Seller State A — v1.5x zone-polish pass (zones 1–4), rendered (browser).
 *
 * Re-implements the four finalized State A zones natively with ONE shared
 * proof-panel primitive. This spec proves the proposed structure + values render
 * at desktop and ~390px mobile, that the shared proof-panel carries the 2px teal
 * keyline in Z2/Z3/Z4, that mint is used ONLY as the Z1 caption status dot, that
 * each zone flexes out cleanly, that motion is gated + reduced-motion-safe, and
 * that State B / flag-off is untouched (no proof-panel leak).
 *
 *   Z1 welcome video — pedestal: eyebrow -> heading -> player -> caption pill
 *   Z2 brief trend   — tonal sparkline panel + coordinated light "+6%" proof pair
 *   Z3 valuation band— two tinted chips + dark "$580K – $700K" range proof panel
 *   Z4 trust strip   — unified panel: quote + light "101.3%" stat rail
 */

const STATE_A = "/seller-presentation-preview?fixture=state-a";
const STATE_A_MIN = "/seller-presentation-preview?fixture=state-a-minimal";
const NO_VIDEO = "/seller-presentation-preview?fixture=state-a-no-video";
const TREND_ONLY = "/seller-presentation-preview?fixture=state-a-trend-only";
const NO_STAT = "/seller-presentation-preview?fixture=state-a-no-stat";
const FULL = "/seller-presentation-preview?fixture=full";

async function cssOf(
  locator: import("@playwright/test").Locator,
  prop: string,
): Promise<string> {
  return locator.evaluate(
    (el, p) => getComputedStyle(el).getPropertyValue(p),
    prop,
  );
}

// Resolve a State-A CSS color token to an rgb() string in the page's own context.
// The page BRAND-DERIVES --teal-700 / --mint (consumerRoleVars), so the proof
// teal + the mint dot re-hue per agent — we compare against the resolved value,
// never a hardcoded literal.
async function resolveVar(
  page: import("@playwright/test").Page,
  varName: string,
): Promise<string> {
  return page.evaluate((name) => {
    const root = document.querySelector(".fs-page.state-a")!;
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    root.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, varName);
}

test.describe("State A zones — structure + values (rich fixture)", () => {
  test("Z1 welcome video pedestal: eyebrow, heading, caption pill with mint dot", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const hello = page.getByTestId("fs-sa-hello");
    await expect(hello).toBeVisible();
    await expect(hello.locator(".sa-hello__pedestal")).toBeVisible();
    await expect(hello.locator(".sa-hello__eyebrow")).toHaveText("Before We Meet");
    await expect(hello).toContainText("A quick hello from Marisol");
    // The relocated player is preserved verbatim inside the pedestal.
    await expect(hello.getByTestId("fs-sa-hero-video")).toBeVisible();
    await expect(hello.locator(".sa-hero__video-player")).toHaveCount(1);
    // Caption pill on the solid surface (never over the video): prompt + runtime.
    const cap = page.getByTestId("fs-sa-hello-cap");
    await expect(cap).toContainText("Press play");
    await expect(cap).toContainText("2 min 14 sec");
  });

  test("Z2 brief trend: tonal sparkline panel + coordinated light +6% proof pair", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const activity = page.getByTestId("fs-sa-brief-activity");
    await expect(activity).toBeVisible();
    // The sparkline + its month axis live in the tonal trend panel.
    await expect(activity.getByTestId("fs-sa-brief-spark")).toBeVisible();
    const axis = activity.locator(".sa-trend__axis");
    await expect(axis).toContainText("Jul '25");
    await expect(axis).toContainText("Jun '26");
    await expect(activity).toContainText("Up about 6% this year");
    // The coordinated proof pair: a LIGHT panel, label + "+6%" number + caption.
    const proof = page.getByTestId("fs-sa-proof-z2");
    await expect(proof).toBeVisible();
    await expect(proof).toHaveAttribute("data-variant", "light");
    await expect(proof.locator(".sa-proof__label")).toContainText(
      "Neighborhood",
    );
    await expect(proof.locator(".sa-proof__num")).toHaveText("+6%");
    await expect(proof.locator(".sa-proof__cap")).toHaveText("vs. last year");
  });

  test("Z3 valuation band: two tinted chips + dark range proof panel", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    // The single combined label split into two chips (verbatim copy each).
    const chips = page.getByTestId("fs-sa-valuation-label");
    await expect(chips.locator(".sa-val__chip")).toHaveCount(2);
    await expect(chips).toContainText("Prepared estimate");
    await expect(chips).toContainText("Pending walkthrough");
    // The prepared chip carries the status dot; pending does not.
    await expect(
      chips.locator(".sa-val__chip--status .sa-val__dot"),
    ).toHaveCount(1);
    // The dark range proof panel: abbreviated range + the filled/open dot track.
    const proof = page.getByTestId("fs-sa-proof-z3");
    await expect(proof).toBeVisible();
    await expect(proof).toHaveAttribute("data-variant", "dark");
    await expect(proof.locator(".sa-proof__label")).toContainText(
      "Recently sold nearby",
    );
    await expect(proof.locator(".sa-range")).toContainText("$580K");
    await expect(proof.locator(".sa-range")).toContainText("$700K");
    await expect(proof.locator(".sa-range__dot--fill")).toHaveCount(1);
    await expect(proof.locator(".sa-range__dot--open")).toHaveCount(1);
    // The full-form context sentence stays (verbatim), beneath the panel.
    await expect(page.getByTestId("fs-sa-valuation-context")).toContainText(
      "Homes near you recently sold between $580,000 and $700,000",
    );
  });

  test("Z4 trust strip: unified panel with quote + light 101.3% stat rail", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const panel = page.locator(".sa-quote__panel");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/sa-quote__panel--solo/);
    await expect(panel.locator(".sa-quote__main")).toBeVisible();
    // The stat is the shared light proof-panel rail (keeps the credibility hook).
    const rail = page.getByTestId("fs-sa-credibility");
    await expect(rail).toHaveClass(/sa-proof/);
    await expect(rail).toHaveAttribute("data-variant", "light");
    await expect(rail.locator(".sa-proof__num")).toHaveText("101.3%");
    await expect(rail.locator(".sa-proof__label")).toContainText("sale-to-list");
    await expect(rail.locator(".sa-proof__label")).toContainText(
      "recent listings",
    );
  });

  test("the shared proof-panel carries a 2px teal keyline in Z2/Z3/Z4", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const teal700 = await resolveVar(page, "--teal-700"); // light keyline
    const teal500 = await resolveVar(page, "--teal-500"); // dark keyline
    for (const [id, keyline] of [
      ["fs-sa-proof-z2", teal700],
      ["fs-sa-proof-z3", teal500],
      ["fs-sa-credibility", teal700],
    ] as const) {
      const proof = page.getByTestId(id);
      // Desktop default: the keyline is a 2px solid left border (not the top one).
      expect(await cssOf(proof, "border-left-width"), id).toBe("2px");
      expect(await cssOf(proof, "border-left-style"), id).toBe("solid");
      // It is the brand teal keyline (light -> teal-700, dark -> teal-500).
      expect(await cssOf(proof, "border-left-color"), id).toBe(keyline);
    }
  });

  test("mint is used ONLY as the Z1 caption status dot", async ({ page }) => {
    await page.goto(STATE_A);
    const mint = await resolveVar(page, "--mint");
    const teal700 = await resolveVar(page, "--teal-700");
    expect(mint, "mint + teal must be distinguishable").not.toBe(teal700);
    // The Z1 caption dot is the (brand-derived) mint.
    const dot = page.locator(".sa-hello__cap-dot");
    expect(await cssOf(dot, "background-color")).toBe(mint);
    // No proof panel (Z2/Z3/Z4) uses mint as a fill or keyline.
    for (const id of ["fs-sa-proof-z2", "fs-sa-proof-z3", "fs-sa-credibility"]) {
      const proof = page.getByTestId(id);
      expect(await cssOf(proof, "background-color"), id).not.toBe(mint);
      expect(await cssOf(proof, "border-left-color"), id).not.toBe(mint);
    }
  });
});

test.describe("State A zones — flex-out (each zone reads complete)", () => {
  test("Z1 no video: the welcome section drops, the hero stays intact", async ({
    page,
  }) => {
    await page.goto(NO_VIDEO);
    await expect(page.getByTestId("seller-presentation-state-a")).toBeVisible();
    await expect(page.getByTestId("fs-sa-hello")).toHaveCount(0);
    await expect(page.getByTestId("fs-hero")).toBeVisible();
    // No empty band: the brief follows directly after the hero.
    await expect(page.getByTestId("fs-sa-brief")).toBeVisible();
  });

  test("Z2 trend-only: sparkline panel full-width, the +6% proof collapses", async ({
    page,
  }) => {
    await page.goto(TREND_ONLY);
    const activity = page.getByTestId("fs-sa-brief-activity");
    await expect(activity).toBeVisible();
    // The sparkline + its narration line still read complete.
    await expect(activity.getByTestId("fs-sa-brief-spark")).toBeVisible();
    await expect(activity).toContainText("this year");
    // No orphaned proof slot, and the grid collapses to a single full-width column.
    await expect(page.getByTestId("fs-sa-proof-z2")).toHaveCount(0);
    await expect(activity.locator(".sa-trend--solo")).toHaveCount(1);
  });

  test("Z3 range-absent: band composed on heading + chips alone", async ({
    page,
  }) => {
    await page.goto(STATE_A_MIN);
    const valuation = page.getByTestId("fs-sa-valuation");
    await expect(valuation).toBeVisible();
    await expect(page.getByTestId("fs-sa-valuation-label")).toContainText(
      "Prepared estimate",
    );
    // No comps -> the range proof panel + the context sentence both drop.
    await expect(page.getByTestId("fs-sa-proof-z3")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-valuation-context")).toHaveCount(0);
  });

  test("Z4 stat-absent: quote centers into a complete panel, the rail is removed", async ({
    page,
  }) => {
    await page.goto(NO_STAT);
    const panel = page.locator(".sa-quote__panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveClass(/sa-quote__panel--solo/);
    await expect(panel.locator(".sa-quote__main")).toBeVisible();
    // The 101.3% rail is removed entirely (no empty rail, no top-border stub).
    await expect(page.getByTestId("fs-sa-credibility")).toHaveCount(0);
  });
});

test.describe("State A zones — mobile reflow (~390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the proof keyline moves to a top border on stacked panels", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    // Z4 stat rail stacks beneath the quote: the 2px teal keyline is a top border.
    const rail = page.getByTestId("fs-sa-credibility");
    expect(await cssOf(rail, "border-top-width")).toBe("2px");
    expect(await cssOf(rail, "border-left-width")).toBe("0px");
    // Z2 proof likewise stacks beneath the sparkline panel.
    const z2 = page.getByTestId("fs-sa-proof-z2");
    expect(await cssOf(z2, "border-top-width")).toBe("2px");
    expect(await cssOf(z2, "border-left-width")).toBe("0px");
  });

  test("the welcome-video pedestal + every zone still render at 390px", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-hello")).toBeVisible();
    await expect(page.getByTestId("fs-sa-proof-z2")).toBeVisible();
    await expect(page.getByTestId("fs-sa-proof-z3")).toBeVisible();
    await expect(page.getByTestId("fs-sa-credibility")).toBeVisible();
  });
});

test.describe("State A zones — reduced motion lands everything drawn", () => {
  test("sparkline renders already-drawn; proof numbers do not animate", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(STATE_A);
    // Confirm the emulation took (the gate's whole point).
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    const line = page.getByTestId("fs-sa-brief-spark").locator(".sa-spark__line");
    // Already-drawn: the dash offset is forced to 0 (no draw-on animation).
    expect(parseFloat(await cssOf(line, "stroke-dashoffset"))).toBe(0);
    // The proof numbers sit at their final state (no fade/rise transform).
    const num = page.getByTestId("fs-sa-proof-z2").locator(".sa-proof__num");
    expect(await cssOf(num, "opacity")).toBe("1");
    expect(["none", ""]).toContain(await cssOf(num, "transform"));
  });
});

test.describe("State B / flag-off is untouched (no proof-panel leak)", () => {
  test("the full (revealed) fixture renders no State A proof panels", async ({
    page,
  }) => {
    await page.goto(FULL);
    await expect(page.getByTestId("seller-presentation-state-a")).toHaveCount(0);
    // None of the new State A primitives leak into the revealed page.
    await expect(page.locator(".sa-proof")).toHaveCount(0);
    await expect(page.locator(".sa-quote__panel")).toHaveCount(0);
  });
});
