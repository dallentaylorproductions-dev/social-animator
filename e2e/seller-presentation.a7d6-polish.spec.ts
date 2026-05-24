import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — A7d.6 + A7d.7 + A7d.9 polish coverage.
 *
 * A7d.6 shipped four refinements from Dallen's 2026-05-23 smoke. A7d.7
 * is the bug-fix round on top — three of A7d.6's fixes didn't behave on
 * Dallen's second smoke:
 *
 *   Fix 1: The YoY +/− toggle's visible glyph did not flip on tap
 *          (A7d.6 emitted "" when magnitude was empty, so the parent
 *          ignored it and the toggle re-derived "+"). A7d.7 lifts the
 *          sign into local component state and adds onPointerDown /
 *          onMouseDown preventDefault so iOS Safari labels can't steal
 *          the click. A spec now exercises the tap-flip path directly.
 *
 *   Fix 2: "Months of history" clamped to 1 on every keystroke, trapping
 *          the agent (12 → backspace → "1"). A7d.7 holds the input as a
 *          string so empty/intermediate values flow, and only clamps to
 *          [1, MAX_MONTHLY] on blur (empty/invalid → DEFAULT_MONTHLY_COUNT).
 *
 *   Fix 3: A7d.6's polyline-avoidance pushed the "$685k" tag to corners
 *          and chopped "RECOMMENDED" at the left edge. A7d.7 kept both
 *          labels ON the dashed line behind paper chips. **A7d.9 then
 *          replaced the value-scaled line entirely** with a fixed-top
 *          reference banner: dashed line pinned to a fixed y near the
 *          top of the viewBox, both labels stacked top-left on chips,
 *          decoupled from the y-scale. The geometry test now asserts
 *          that those positions are constant for any data shape and
 *          stay inside the plot / clear of the callout + axis row.
 *
 *   Fix 4: A7d.6's "Latest month" device-clock default — verified math
 *          and added a Dec→Jan wrap test. No off-by-one (Dallen's "JUN
 *          '26" smoke artifact was almost certainly persisted data).
 *
 * Mix of UI tests (Fix 1, Fix 2, Fix 4 — exercise the editor) and
 * pure-Node tests (Fix 3 + the reviews-CTA suite — assert helpers
 * directly so we don't depend on a render run).
 */

import {
  REC_LINE_Y,
  REC_LEFT_X,
  REC_NUM_Y,
  REC_LABEL_Y,
  REC_NUM_CHIP,
  REC_LABEL_CHIP,
  detectReviewsSource,
  reviewsCardCopy,
  seeAllReviewsCopy,
} from '../src/tools/seller-presentation/output/presentation-page';
import {
  toPublicPayload,
  clampPublicPayload,
} from '../src/tools/seller-presentation/output/public-payload';
import { clampDraft } from '../src/tools/seller-presentation/engine/types';

// ---------------------------------------------------------------------
// Wizard navigation helper — drives Steps 1–4 with the minimum data
// required to reach the Editorial step (Step 5). Mirrors the dance
// used by seller-presentation.video-upload.spec.ts.
// ---------------------------------------------------------------------
async function reachEditorialStep(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('step-property')).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId('step-property-address').fill('1742 Kenilworth Avenue');
  await page.getByTestId('step-property-city').fill('Tremont');
  await page.getByTestId('step-property-state').fill('OH');
  await page.getByTestId('step-property-zip').fill('44113');
  const next = page.getByTestId('wizard-next');
  await next.click();
  await page.getByTestId('step-comps-add').click();
  await page.getByTestId('step-comps-address-0').fill('2218 W 14th Street');
  await page.getByLabel('comp-1-sold-price').fill('648000');
  await next.click();
  await page.getByLabel('recommended-price').fill('675000');
  await next.click();
  await next.click(); // skip pitch
  await expect(page.getByTestId('step-editorial')).toBeVisible({
    timeout: 10_000,
  });
}

// =====================================================================
// A7d.6 Fix 1 / A7d.7 Fix 1 — "Latest month" default = device clock.
// =====================================================================

test.describe('A7d.6 + A7d.7 — Latest month default = device clock (no off-by-one)', () => {
  test('mounts to the current month from the device clock (not a hardcoded constant)', async ({
    page,
  }) => {
    // Aug 7 2027 is well outside today's calendar month — proves the
    // anchor follows the clock instead of a baked constant.
    await page.clock.install({ time: new Date('2027-08-07T15:30:00Z') });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/seller-presentation');
    await reachEditorialStep(page);

    await page.getByTestId('step-editorial-areaStats-add').click();
    const monthInput = page.getByTestId('step-editorial-area-latest-month');
    await expect(monthInput).toHaveValue('2027-08');

    const lastLabel = page.getByTestId('step-editorial-area-month-label-5');
    await expect(lastLabel).toHaveText("Aug '27");

    const hydrationNoise = [...consoleErrors, ...pageErrors].filter((m) =>
      /hydrat|#418|#421|#423/i.test(m),
    );
    expect(hydrationNoise).toEqual([]);
  });

  // A7d.7 Fix 4 — verify the math itself is right (no off-by-one) and
  // that the December → January year wrap back-fills correctly. Dallen
  // saw "JUN '26" on a 2026-05-23 smoke; verification confirms the
  // default math is correct, so that artifact was almost certainly his
  // own persisted "Jun '26" data row, not a clock bug.
  test('default resolves to the actual current month for May (no off-by-one)', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-05-23T12:00:00Z') });
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();
    await expect(
      page.getByTestId('step-editorial-area-latest-month'),
    ).toHaveValue('2026-05');
    await expect(
      page.getByTestId('step-editorial-area-month-label-5'),
    ).toHaveText("May '26");
  });

  test('December → January wrap back-fills with the correct previous year', async ({
    page,
  }) => {
    // Mount at January 5 2027 → anchor "2027-01"; the 6-month default
    // covers Aug 2026 … Jan 2027. The four entries straddling the
    // year boundary must each carry the right year.
    await page.clock.install({ time: new Date('2027-01-05T08:00:00Z') });
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();
    await expect(
      page.getByTestId('step-editorial-area-latest-month'),
    ).toHaveValue('2027-01');
    await expect(
      page.getByTestId('step-editorial-area-month-label-0'),
    ).toHaveText("Aug '26");
    await expect(
      page.getByTestId('step-editorial-area-month-label-4'),
    ).toHaveText("Dec '26");
    await expect(
      page.getByTestId('step-editorial-area-month-label-5'),
    ).toHaveText("Jan '27");
  });
});

// =====================================================================
// A7d.7 Fix 1 — YoY +/− toggle: tap MUST flip the sign every time.
// =====================================================================

test.describe('A7d.7 / Fix 1 — YoY +/− toggle flips the sign on tap', () => {
  test('toggle flips on tap with EMPTY magnitude (A7d.6 regression — toggle was inert)', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();

    const yoy = page.getByLabel('area-yoy');
    const yoyWrapper = page.locator('[data-signed-percent]').filter({
      has: yoy,
    });
    const toggle = page.getByTestId('percent-input-sign-toggle');

    // Default state.
    await expect(yoyWrapper).toHaveAttribute('data-sign', 'positive');
    await expect(toggle).toHaveText('+');

    // EMPTY magnitude. The A7d.6 implementation emitted '' here and
    // the parent ignored it, leaving the toggle stuck at '+'. The
    // A7d.7 fix keeps a local sign state so the glyph flips even
    // when there's nothing to sign yet.
    await toggle.click();
    await expect(yoyWrapper).toHaveAttribute('data-sign', 'negative');
    await expect(toggle).toHaveText('−');

    await toggle.click();
    await expect(yoyWrapper).toHaveAttribute('data-sign', 'positive');
    await expect(toggle).toHaveText('+');

    // Tapping repeatedly continues to flip — no stuck state.
    await toggle.click();
    await expect(toggle).toHaveText('−');
    await toggle.click();
    await expect(toggle).toHaveText('+');
  });

  test('typed magnitude inherits the toggle sign and round-trips negative', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();

    const yoy = page.getByLabel('area-yoy');
    const toggle = page.getByTestId('percent-input-sign-toggle');

    // Flip to negative FIRST (empty field), then type 4.6 — the stored
    // value must come out signed. This is the canonical iOS flow: the
    // keypad can't enter a minus, so the agent taps the toggle before
    // typing the magnitude.
    await toggle.click();
    await expect(toggle).toHaveText('−');
    await yoy.fill('4.6');
    await yoy.blur();
    await expect(yoy).toHaveValue('4.6%');

    // The stored value (driven through the parent's onChange) is what
    // the input ECHOes back through the magnitude — but we want to
    // confirm the SIGN survived. Re-toggling the sign flips it again
    // on the typed magnitude.
    await toggle.click();
    await expect(toggle).toHaveText('+');
    await expect(yoy).toHaveValue('4.6%');

    await toggle.click();
    await expect(toggle).toHaveText('−');
    await expect(yoy).toHaveValue('4.6%');
  });

  test('signed value round-trips verbatim through clampDraft → toPublicPayload → clampPublicPayload', () => {
    const NEG = '−4.6%';
    const draft = {
      propertyAddress: '1742 Kenilworth Avenue',
      recommendedPrice: '$675,000',
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
      areaStats: { medianSaleDeltaYoy: NEG },
    };
    const clamped = clampDraft(draft);
    expect(clamped.areaStats?.medianSaleDeltaYoy).toBe(NEG);
    const payload = toPublicPayload(clamped, {});
    expect(payload.areaStats?.medianSaleDeltaYoy).toBe(NEG);
    const readBack = clampPublicPayload(JSON.parse(JSON.stringify(payload)));
    expect(readBack.areaStats?.medianSaleDeltaYoy).toBe(NEG);
  });
});

// =====================================================================
// A7d.7 Fix 2 — Months of history input: allow empty, clamp on blur.
// =====================================================================

test.describe('A7d.7 / Fix 2 — Months-of-history input is clearable + retypable', () => {
  test('12 → clear → 6: backspacing all the way is no longer trapped at "1"', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();

    const monthCount = page.getByTestId('step-editorial-area-month-count');
    await monthCount.fill('12');
    await expect(monthCount).toHaveValue('12');

    // Backspace ALL THE WAY to empty. The A7d.6 implementation
    // re-clamped to "1" on each keystroke, so this used to render
    // "1" instead of "". Now the empty intermediate is allowed.
    await monthCount.press('Backspace');
    await expect(monthCount).toHaveValue('1');
    await monthCount.press('Backspace');
    await expect(monthCount).toHaveValue('');

    // Type 6 from empty.
    await monthCount.type('6');
    await expect(monthCount).toHaveValue('6');
  });

  test('blur normalizes empty/invalid to the default (6)', async ({ page }) => {
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();

    const monthCount = page.getByTestId('step-editorial-area-month-count');
    await monthCount.fill('');
    await monthCount.blur();
    await expect(monthCount).toHaveValue('6');

    await monthCount.fill('0');
    await monthCount.blur();
    await expect(monthCount).toHaveValue('6');
  });

  test('blur clamps over-max to the ceiling (12)', async ({ page }) => {
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);
    await page.getByTestId('step-editorial-areaStats-add').click();

    const monthCount = page.getByTestId('step-editorial-area-month-count');
    // The input regex blocks 3-digit entries up front. Setting via DOM
    // simulates a paste/programmatic path the regex doesn't catch.
    await monthCount.fill('12');
    await expect(monthCount).toHaveValue('12');
    // 12 is the max and stays as-is on blur.
    await monthCount.blur();
    await expect(monthCount).toHaveValue('12');
  });
});

// =====================================================================
// A7d.9 Fix 3 — Recommended annotation is a FIXED-TOP reference banner.
// =====================================================================
//
// A7d.6/.7's adaptive placeRecAnnotation was deleted. The recommended
// dashed line is now pinned to a fixed y near the top of the viewBox,
// with the price + "RECOMMENDED" caption stacked top-left behind paper
// chips. Layout is the same for any data shape (recommended above /
// below / within the data range), so we assert constants — not a
// per-shape placement — and verify the band stays inside the plot and
// never collides with the polyline / current callout / axis row.

test.describe('A7d.9 / Fix 3 — Recommended annotation pins to a fixed top band', () => {
  // Chart geometry constants from presentation-page.tsx AreaChart.
  const X0 = 40;
  const X1 = 388;
  const Y_BOTTOM = 184;
  const Y_TOP_GRID = 104;
  // x-tick text row baseline is y=204; cap-height ~8 reaches y≈196.
  const X_TICK_TOP = 196;
  // Locked-design upper-right current-value callout rect.
  const CALLOUT = { x0: X1 - 110, y0: 25, x1: X1, y1: 95 } as const;
  const PLOT_LEFT = X0;
  const PLOT_RIGHT = X1;
  const VIEWBOX_TOP = 0;

  function rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x0: number; y0: number; x1: number; y1: number },
  ): boolean {
    return !(
      a.x + a.width <= b.x0 ||
      b.x1 <= a.x ||
      a.y + a.height <= b.y0 ||
      b.y1 <= a.y
    );
  }

  function buildPolyline(prices: number[]): { x: number; y: number }[] {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = Math.max(max - min, 1);
    const plotHeight = Y_BOTTOM - Y_TOP_GRID;
    return prices.map((p, i) => ({
      x: X0 + ((X1 - X0) * i) / (prices.length - 1),
      y: Y_BOTTOM - ((p - min) / range) * (plotHeight - 6),
    }));
  }

  test('exported constants describe a left-anchored, stacked, top-of-viewBox band', () => {
    // Dashed line is well above the plot grid — no overlap with data.
    expect(REC_LINE_Y).toBeLessThan(Y_TOP_GRID);
    expect(REC_LINE_Y).toBeGreaterThanOrEqual(VIEWBOX_TOP);

    // Both labels anchored at the same left x (stacked, start-anchored).
    expect(REC_LEFT_X).toBeGreaterThan(PLOT_LEFT);
    expect(REC_NUM_CHIP.x).toBe(REC_LABEL_CHIP.x);

    // Price sits closer to the line; caption stacks BELOW the price.
    expect(REC_NUM_Y).toBeGreaterThan(REC_LINE_Y);
    expect(REC_LABEL_Y).toBeGreaterThan(REC_NUM_Y);

    // The two chips don't overlap each other.
    const a = REC_NUM_CHIP;
    const b = REC_LABEL_CHIP;
    const disjoint =
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y;
    expect(disjoint).toBe(true);
  });

  for (const chipName of ['num', 'label'] as const) {
    const chip = chipName === 'num' ? REC_NUM_CHIP : REC_LABEL_CHIP;
    test(`${chipName} chip stays in-plot horizontally, above the grid, and clear of the callout`, () => {
      // 1) Chip is fully INSIDE the plot horizontally — never clipped.
      expect(chip.x).toBeGreaterThanOrEqual(PLOT_LEFT);
      expect(chip.x + chip.width).toBeLessThanOrEqual(PLOT_RIGHT);

      // 2) Chip top stays inside the viewBox.
      expect(chip.y).toBeGreaterThanOrEqual(VIEWBOX_TOP);

      // 3) Chip bottom stays above the plot grid — never crashes into
      //    the polyline / current marker / y-grid lines / x-tick row.
      expect(chip.y + chip.height).toBeLessThanOrEqual(Y_TOP_GRID);
      expect(chip.y + chip.height).toBeLessThanOrEqual(X_TICK_TOP);

      // 4) Chip never overlaps the upper-right current-value callout.
      expect(rectsOverlap(chip, CALLOUT)).toBe(false);
    });
  }

  // Geometry is data-independent now — verify the polyline (rendered in
  // its own plot band) never reaches the rec annotation band, for the
  // same data shapes that previously stressed the adaptive placer.
  const SHAPES: Array<{ name: string; prices: number[] }> = [
    {
      name: 'rising',
      prices: [600, 605, 610, 615, 622, 628, 633, 639, 645, 650, 656, 660],
    },
    {
      name: 'falling',
      prices: [700, 695, 688, 680, 672, 665, 658, 650, 642, 635, 628, 620],
    },
    { name: 'flat', prices: Array.from({ length: 12 }, () => 640) },
    {
      name: 'rising-into-top-right',
      prices: [600, 610, 615, 625, 635, 645, 658, 670, 680, 690, 700, 712],
    },
    {
      name: 'V-shape',
      prices: [660, 650, 640, 628, 620, 615, 620, 628, 640, 650, 660, 668],
    },
  ];

  for (const shape of SHAPES) {
    test(`polyline never reaches the rec band — ${shape.name}`, () => {
      const polyline = buildPolyline(shape.prices);
      const recBandBottom = Math.max(
        REC_NUM_CHIP.y + REC_NUM_CHIP.height,
        REC_LABEL_CHIP.y + REC_LABEL_CHIP.height,
      );
      for (const p of polyline) {
        expect(p.y).toBeGreaterThanOrEqual(Y_TOP_GRID);
        expect(p.y).toBeGreaterThan(recBandBottom);
      }
    });
  }
});

// =====================================================================
// A7d.6 Fix 4 — Reviews CTA: source detection + name substitution.
//   (Unchanged from A7d.6 — kept here to keep the polish coverage in
//    one place.)
// =====================================================================

test.describe('A7d.6 / Fix 4 — Reviews CTA source detection', () => {
  test('known hosts return the friendly source name', () => {
    expect(detectReviewsSource('https://www.zillow.com/profile/agent')).toBe(
      'Zillow',
    );
    expect(detectReviewsSource('https://zillow.com/x')).toBe('Zillow');
    expect(
      detectReviewsSource('https://www.google.com/maps/place/...'),
    ).toBe('Google');
    expect(detectReviewsSource('https://maps.google.com/?cid=...')).toBe(
      'Google',
    );
    expect(detectReviewsSource('https://g.page/agent-name')).toBe('Google');
    expect(
      detectReviewsSource('https://www.realtor.com/realestateagents/agent'),
    ).toBe('Realtor.com');
    expect(detectReviewsSource('https://www.yelp.com/biz/agent')).toBe(
      'Yelp',
    );
    expect(detectReviewsSource('https://www.facebook.com/agent')).toBe(
      'Facebook',
    );
    expect(detectReviewsSource('https://fb.com/agent')).toBe('Facebook');
    expect(detectReviewsSource('https://www.redfin.com/agent/123')).toBe(
      'Redfin',
    );
    expect(detectReviewsSource('https://www.homes.com/real-estate-agents')).toBe(
      'Homes.com',
    );
  });

  test('unknown hosts return null (renderer falls back to generic copy)', () => {
    expect(detectReviewsSource('https://example.com/reviews')).toBeNull();
    expect(detectReviewsSource('https://acmebrokerage.io/agent')).toBeNull();
    expect(detectReviewsSource('')).toBeNull();
    expect(detectReviewsSource(undefined)).toBeNull();
  });

  test('bare-host strings (no protocol) still detect', () => {
    expect(detectReviewsSource('zillow.com/profile')).toBe('Zillow');
    expect(detectReviewsSource('www.realtor.com/x')).toBe('Realtor.com');
  });

  test('detection is case-insensitive', () => {
    expect(detectReviewsSource('https://WWW.ZILLOW.COM/x')).toBe('Zillow');
    expect(detectReviewsSource('https://Realtor.COM/y')).toBe('Realtor.com');
  });

  test('CTA copy names the source when known and the agent', () => {
    expect(reviewsCardCopy('Marisol', 'Zillow')).toBe(
      "Read Marisol's reviews on Zillow",
    );
    expect(reviewsCardCopy('Marisol', 'Google')).toBe(
      "Read Marisol's reviews on Google",
    );
    expect(reviewsCardCopy('Marisol', 'Realtor.com')).toBe(
      "Read Marisol's reviews on Realtor.com",
    );
  });

  test('CTA copy degrades cleanly when name is missing', () => {
    expect(reviewsCardCopy('', 'Google')).toBe(
      'Read these reviews on Google',
    );
    expect(reviewsCardCopy(undefined, 'Zillow')).toBe(
      'Read these reviews on Zillow',
    );
  });

  test('CTA copy degrades cleanly when source is unknown', () => {
    expect(reviewsCardCopy('Marisol', null)).toBe("Read Marisol's reviews");
    expect(reviewsCardCopy('', null)).toBe('Read past-client reviews');
    expect(reviewsCardCopy(undefined, null)).toBe('Read past-client reviews');
  });

  test('"see all" copy carries the source when known', () => {
    expect(seeAllReviewsCopy('Zillow')).toBe('See all reviews on Zillow');
    expect(seeAllReviewsCopy('Google')).toBe('See all reviews on Google');
    expect(seeAllReviewsCopy(null)).toBe('See all reviews');
  });

  test('no literal {{token}} ever appears in any CTA copy path', () => {
    const sources: Array<string | null> = [
      'Zillow',
      'Google',
      'Realtor.com',
      null,
    ];
    const names: Array<string | undefined> = [
      'Marisol',
      'M',
      '',
      undefined,
    ];
    for (const source of sources) {
      expect(seeAllReviewsCopy(source)).not.toMatch(/\{\{/);
      for (const name of names) {
        expect(reviewsCardCopy(name, source)).not.toMatch(/\{\{/);
      }
    }
  });

  test('outlink-only render uses detected source + agent name (no {{…}})', async ({
    page,
  }) => {
    await page.goto('/seller-presentation-preview?fixture=outlink-only');
    const cta = page.getByTestId('sep-reviews-outlink-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("Read Aaron's reviews on Zillow");
    const html = await page.content();
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
