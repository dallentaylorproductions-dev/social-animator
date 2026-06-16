import { test, expect } from "@playwright/test";

/**
 * Seller State A — v1.5x zone-polish pass (rendered, browser).
 *
 * The finalized State A zones with ONE shared proof-panel primitive, after the
 * v1.5x ruthless pass:
 *   Z1 welcome video — rebalanced pedestal (300px player / 468px slab) + the
 *      teal audio-WAVEFORM play affordance (mint RETIRED).
 *   Z2 brief trend   — the fuller §05 chart (gridlines + $k y-axis + month
 *      x-labels + teal area fill + halo) over a STACKED two-stat proof column:
 *      the market `+X%` trend over the RELOCATED agent track-record stat.
 *   Z3 valuation band— two tinted chips + dark "$580K – $700K" range proof panel.
 *   Reviews strip    — quote + a confident reviews block (sized-up 5.0 + stars +
 *      a clearly-clickable teal pill link-out; Zillow TEXT-ONLY, no logo).
 *
 * Proves the proposed structure + values render at desktop and ~390px mobile,
 * the shared proof-panel carries the 2px teal keyline, the 101.3% stat is in the
 * chart column and NOT the trust strip, mint is gone, motion is reduced-motion
 * safe, and State B / flag-off is untouched.
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

// Resolve a State-A CSS color token to an rgb() string in the page's own context
// (the page BRAND-DERIVES --teal-700 / --mint, so we compare resolved values).
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
  test("Z1 welcome video: rebalanced pedestal + the teal waveform play affordance", async ({
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
    const player = hello.locator(".sa-hero__video-player");
    await expect(player).toHaveCount(1);
    // Rebalance: the larger player renders at a real, non-zero box (never the
    // 0x1px collapse) — and noticeably bigger than the old 182px frame.
    const box = await player.boundingBox();
    expect(box, "player must have a rendered box").not.toBeNull();
    expect(box!.width, "player width is the rebalanced ~300px").toBeGreaterThan(
      240,
    );
    expect(box!.height, "player height must be non-zero").toBeGreaterThan(150);
    const poster = await player.getAttribute("poster");
    expect(poster, "the player shows the chosen poster before play").toBeTruthy();
    // The WAVEFORM affordance (replaces the mint "Press play" pill): play glyph +
    // bars + runtime, one play target (role=button, data-wave-play), on the solid
    // surface. NO "Press play" text, NO mint dot.
    const wave = page.getByTestId("fs-sa-hello-cap");
    await expect(wave).toHaveClass(/sa-hello__wave/);
    await expect(wave).toHaveAttribute("data-wave-play");
    await expect(wave).toHaveAttribute("role", "button");
    await expect(wave.locator(".sa-hello__wave-bars i").first()).toBeVisible();
    await expect(wave).toContainText("2 min 14 sec");
    await expect(page.locator(".sa-hello__cap-dot")).toHaveCount(0);
  });

  test("the waveform is a play target: clicking it plays the same video", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const wave = page.getByTestId("fs-sa-hello-cap");
    await wave.scrollIntoViewIfNeeded();
    // Stub play() so we don't actually start media; assert it fires on click.
    await page
      .locator(".sa-hello__pedestal video.sa-hero__video-player")
      .evaluate((v: HTMLVideoElement) => {
        (window as unknown as { __played: boolean }).__played = false;
        v.play = async () => {
          (window as unknown as { __played: boolean }).__played = true;
        };
      });
    await wave.click();
    expect(
      await page.evaluate(
        () => (window as unknown as { __played: boolean }).__played,
      ),
    ).toBe(true);
  });

  test("Z2 brief trend: the fuller chart + a stacked two-stat proof column", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const activity = page.getByTestId("fs-sa-brief-activity");
    await expect(activity).toBeVisible();
    // The fuller chart (reuses the §05 vocabulary): gridlines, a $k y-axis, month
    // x-labels, a teal area fill, and the current-point halo.
    const chart = activity.getByTestId("fs-sa-brief-spark");
    await expect(chart).toBeVisible();
    // Structure via count/text (the grid + axis fade in on reveal, so don't gate
    // on visibility here): 3 gridlines, a $k y-axis, an area fill, a halo.
    await expect(chart.locator(".sa-chart__grid")).toHaveCount(3);
    await expect(chart.locator(".sa-chart__area")).toHaveCount(1);
    await expect(chart.locator(".sa-chart__halo")).toHaveCount(1);
    await expect(chart.locator(".sa-chart__ylabel").first()).toContainText("$");
    await expect(chart).toContainText("Jul '25");
    await expect(activity).toContainText("Up about 6% this year");
    // The stacked two-stat column: the MARKET +6% over the AGENT 101.3%, both in
    // the one shared light proof treatment, with crystal-clear market-vs-agent
    // labels.
    const col = activity.locator(".sa-trend__proofs");
    await expect(col).toBeVisible();
    const z2 = page.getByTestId("fs-sa-proof-z2");
    await expect(z2).toHaveAttribute("data-variant", "light");
    await expect(z2.locator(".sa-proof__label")).toContainText("Neighborhood");
    await expect(z2.locator(".sa-proof__num")).toHaveText("+6%");
    const stat = page.getByTestId("fs-sa-credibility");
    await expect(stat).toHaveAttribute("data-variant", "light");
    await expect(stat.locator(".sa-proof__num")).toHaveText("101.3%");
    await expect(stat.locator(".sa-proof__label")).toContainText("sale-to-list");
    // RELOCATION GUARD: the stat lives in the chart column, NOT the trust strip.
    await expect(
      page.getByTestId("fs-sa-testimonial").getByTestId("fs-sa-credibility"),
    ).toHaveCount(0);
  });

  test("Z3 valuation band: two tinted chips + dark range proof panel", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const chips = page.getByTestId("fs-sa-valuation-label");
    await expect(chips.locator(".sa-val__chip")).toHaveCount(2);
    await expect(chips).toContainText("Prepared estimate");
    await expect(chips).toContainText("Pending walkthrough");
    await expect(
      chips.locator(".sa-val__chip--status .sa-val__dot"),
    ).toHaveCount(1);
    const proof = page.getByTestId("fs-sa-proof-z3");
    await expect(proof).toBeVisible();
    await expect(proof).toHaveAttribute("data-variant", "dark");
    await expect(proof.locator(".sa-range")).toContainText("$580K");
    await expect(proof.locator(".sa-range")).toContainText("$700K");
    await expect(page.getByTestId("fs-sa-valuation-context")).toContainText(
      "Homes near you recently sold between $580,000 and $700,000",
    );
  });

  test("Reviews strip: quote + a confident reviews block (text-only Zillow link-out)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const section = page.getByTestId("fs-sa-testimonial");
    await expect(section).toBeVisible();
    // The section header is kept (its own intentional moment, not a leftover).
    await expect(section.locator(".head")).toContainText("their words");
    const panel = section.locator(".sa-quote__panel");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/sa-quote__panel--solo/);
    await expect(panel.locator(".sa-quote__main")).toBeVisible();
    // The reviews block: a sized-up 5.0 rating + stars + a clearly-clickable link.
    const block = section.getByTestId("fs-sa-reviews");
    await expect(block).toBeVisible();
    await expect(block.locator(".sa-reviews__score")).toHaveText("5.0");
    const link = section.getByTestId("fs-sa-reviews-outlink");
    await expect(link).toBeVisible();
    await expect(link).toContainText("See all of Marisol's reviews");
    // It is a real anchor to the review platform, opening in a new tab.
    expect(await link.evaluate((el) => el.tagName)).toBe("A");
    await expect(link).toHaveAttribute(
      "href",
      "https://www.zillow.com/profile/marisolreyes",
    );
    // COMPLIANCE: Zillow is a TEXT mark ("Zillow"), never a logo image.
    await expect(section).toContainText("Zillow");
    await expect(section.locator("img")).toHaveCount(0);
  });

  test("the shared proof-panel carries a 2px teal keyline in Z2/Z3/credibility", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const teal700 = await resolveVar(page, "--teal-700");
    const teal500 = await resolveVar(page, "--teal-500");
    for (const [id, keyline] of [
      ["fs-sa-proof-z2", teal700],
      ["fs-sa-proof-z3", teal500],
      ["fs-sa-credibility", teal700],
    ] as const) {
      const proof = page.getByTestId(id);
      expect(await cssOf(proof, "border-left-width"), id).toBe("2px");
      expect(await cssOf(proof, "border-left-style"), id).toBe("solid");
      expect(await cssOf(proof, "border-left-color"), id).toBe(keyline);
    }
  });

  test("mint is RETIRED: no caption dot, no true-mint element, the waveform is teal", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const TRUE_MINT = "rgb(78, 242, 217)"; // --sa-mint #4EF2D9, now unused
    // The one earned mint moment (the Z1 caption dot) is gone.
    await expect(page.locator(".sa-hello__cap-dot")).toHaveCount(0);
    // No State-A element renders the true mint as a background or border color.
    const mintCount = await page.evaluate((mint) => {
      let n = 0;
      for (const el of Array.from(
        document.querySelectorAll(".fs-page.state-a *"),
      )) {
        const s = getComputedStyle(el);
        if (s.backgroundColor === mint || s.borderTopColor === mint) n++;
      }
      return n;
    }, TRUE_MINT);
    expect(mintCount).toBe(0);
    // The waveform bars are the brand teal (re-hued per agent), not mint.
    const bar = page.locator(".sa-hello__wave-bars i").first();
    expect(await cssOf(bar, "background-color")).not.toBe(TRUE_MINT);
    // --mint (the brand-derived blue-grey hero cue) is a DIFFERENT token and may
    // still be used by the hero dots — it must not equal the true mint.
    expect(await resolveVar(page, "--mint")).not.toBe(TRUE_MINT);
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
    await expect(page.getByTestId("fs-sa-brief")).toBeVisible();
  });

  test("Z2 no proofs: chart full-width, the two-stat column collapses", async ({
    page,
  }) => {
    await page.goto(TREND_ONLY);
    const activity = page.getByTestId("fs-sa-brief-activity");
    await expect(activity).toBeVisible();
    await expect(activity.getByTestId("fs-sa-brief-spark")).toBeVisible();
    await expect(activity).toContainText("this year");
    // Neither proof is backed -> no orphaned slot; the grid collapses to solo.
    await expect(page.getByTestId("fs-sa-proof-z2")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-credibility")).toHaveCount(0);
    await expect(activity.locator(".sa-trend__proofs")).toHaveCount(0);
    await expect(activity.locator(".sa-trend--solo")).toHaveCount(1);
  });

  test("Z2 stat-absent: the chart column shows the market trend alone", async ({
    page,
  }) => {
    await page.goto(NO_STAT);
    const activity = page.getByTestId("fs-sa-brief-activity");
    await expect(activity).toBeVisible();
    // The market +6% still renders; the agent stat flexes out (no empty panel).
    await expect(page.getByTestId("fs-sa-proof-z2")).toBeVisible();
    await expect(page.getByTestId("fs-sa-credibility")).toHaveCount(0);
    await expect(activity.locator(".sa-trend--solo")).toHaveCount(0);
  });

  test("Z3 range-absent: band composed on heading + chips alone", async ({
    page,
  }) => {
    await page.goto(STATE_A_MIN);
    await expect(page.getByTestId("fs-sa-valuation")).toBeVisible();
    await expect(page.getByTestId("fs-sa-valuation-label")).toContainText(
      "Prepared estimate",
    );
    await expect(page.getByTestId("fs-sa-proof-z3")).toHaveCount(0);
    await expect(page.getByTestId("fs-sa-valuation-context")).toHaveCount(0);
  });

  test("Reviews minimal: no reviews/outlink -> the whole section drops", async ({
    page,
  }) => {
    await page.goto(STATE_A_MIN);
    await expect(page.getByTestId("seller-presentation-state-a")).toBeVisible();
    await expect(page.getByTestId("fs-sa-testimonial")).toHaveCount(0);
  });
});

test.describe("State A zones — mobile reflow (~390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the proof keyline moves to a top border on stacked panels", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    // Both chart-column proofs stack beneath the chart: the 2px teal keyline is a
    // top border (the relocated credibility stat included).
    const stat = page.getByTestId("fs-sa-credibility");
    expect(await cssOf(stat, "border-top-width")).toBe("2px");
    expect(await cssOf(stat, "border-left-width")).toBe("0px");
    const z2 = page.getByTestId("fs-sa-proof-z2");
    expect(await cssOf(z2, "border-top-width")).toBe("2px");
    expect(await cssOf(z2, "border-left-width")).toBe("0px");
    // The reviews block stacks full-width beneath the quote with a top keyline.
    const reviews = page.getByTestId("fs-sa-reviews");
    expect(await cssOf(reviews, "border-top-width")).toBe("2px");
    expect(await cssOf(reviews, "border-left-width")).toBe("0px");
  });

  test("the welcome-video pedestal + every zone still render at 390px", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-hello")).toBeVisible();
    await expect(page.getByTestId("fs-sa-proof-z2")).toBeVisible();
    await expect(page.getByTestId("fs-sa-credibility")).toBeVisible();
    await expect(page.getByTestId("fs-sa-proof-z3")).toBeVisible();
    await expect(page.getByTestId("fs-sa-reviews")).toBeVisible();
  });
});

test.describe("State A zones — reduced motion lands everything drawn", () => {
  test("chart renders drawn; proof numbers + waveform do not animate", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(STATE_A);
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    const line = page.getByTestId("fs-sa-brief-spark").locator(".sa-spark__line");
    expect(parseFloat(await cssOf(line, "stroke-dashoffset"))).toBe(0);
    const num = page.getByTestId("fs-sa-proof-z2").locator(".sa-proof__num");
    expect(await cssOf(num, "opacity")).toBe("1");
    expect(["none", ""]).toContain(await cssOf(num, "transform"));
    // The always-on waveform is static under reduced motion (no transform sway).
    const bar = page.locator(".sa-hello__wave-bars i").first();
    expect(["none", ""]).toContain(await cssOf(bar, "transform"));
  });
});

test.describe("State B / flag-off is untouched (no State-A primitives leak)", () => {
  test("the full (revealed) fixture renders no State A primitives", async ({
    page,
  }) => {
    await page.goto(FULL);
    await expect(page.getByTestId("seller-presentation-state-a")).toHaveCount(0);
    await expect(page.locator(".sa-proof")).toHaveCount(0);
    await expect(page.locator(".sa-quote__panel")).toHaveCount(0);
    await expect(page.locator(".sa-reviews")).toHaveCount(0);
    await expect(page.locator(".sa-hello__wave")).toHaveCount(0);
    await expect(page.locator(".sa-chart")).toHaveCount(0);
  });
});
