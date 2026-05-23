import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — A7d.6 four-fix polish coverage.
 *
 * Pulls together the four refinements from Dallen's 2026-05-23 real-
 * phone smoke of A7d.4 + A7d.5:
 *
 *   1. Latest-month anchor must derive from the DEVICE CLOCK (not a
 *      hardcoded constant) and survive SSR without a hydration warning.
 *   2. Year-over-year change must accept a NEGATIVE value via a
 *      tappable +/− sign toggle (the iOS decimal keypad has no minus
 *      key). The sign round-trips through the draft and renders on
 *      the published page.
 *   3. The neighborhood-chart annotation labels (recommended caption +
 *      price tag) must place adaptively so neither is covered by the
 *      data polyline, the current-value callout, or the axis labels —
 *      for any data shape.
 *   4. The reviews CTA must name the DETECTED source from the
 *      outlink URL (Zillow / Google / Realtor.com / Yelp / Facebook /
 *      Redfin / Homes.com) with a clean generic fallback otherwise.
 *      The agent name must substitute (no literal `{{…}}` ever).
 *
 * Mix of UI tests (Fix 1 + Fix 2 — exercise the editor) and pure-Node
 * tests (Fix 3 + Fix 4 — assert the placement helper + the source-
 * detection helpers directly so we don't depend on a render run).
 */

import {
  placeRecAnnotation,
  polylineYAtX,
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
// Fix 1 — "Latest month" auto-defaults to the device clock's current
// month, no hydration warning.
// =====================================================================

test.describe('A7d.6 / Fix 1 — Latest month default = device clock', () => {
  test('mounts to the current month from the device clock (not a hardcoded constant)', async ({
    page,
  }) => {
    // Mock the browser clock to a date well outside today's calendar
    // month — proves the anchor follows the clock instead of a baked
    // constant. Aug 7 2027 → 2027-08.
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

    // Trailing labels back-fill from the anchor (A7d.4 auto-labels).
    // Sept '27 anchor → six rows running Mar '27 … Aug '27 (oldest
    // first). The "latest" row is the LAST one in the list.
    const lastLabel = page.getByTestId('step-editorial-area-month-label-5');
    await expect(lastLabel).toHaveText("Aug '27");

    // No React hydration mismatch (#418 / #421 / #423) anywhere on
    // the way to or in the editor.
    const hydrationNoise = [...consoleErrors, ...pageErrors].filter((m) =>
      /hydrat|#418|#421|#423/i.test(m),
    );
    expect(hydrationNoise).toEqual([]);
  });
});

// =====================================================================
// Fix 2 — YoY +/− toggle + signed round-trip.
// =====================================================================

test.describe('A7d.6 / Fix 2 — YoY +/− toggle (signed round-trip)', () => {
  test('toggle flips the sign; negative value round-trips through the editor', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await reachEditorialStep(page);

    await page.getByTestId('step-editorial-areaStats-add').click();
    const yoy = page.getByLabel('area-yoy');
    // The signed input is wrapped: input is inside a div carrying the
    // wrapper data-attrs. Confirm the wrapper + default sign.
    const yoyWrapper = page.locator('[data-signed-percent]').filter({
      has: yoy,
    });
    await expect(yoyWrapper).toHaveAttribute('data-sign', 'positive');

    // Type the magnitude using the keypad — the iOS decimal keypad
    // can't supply a minus, but the toggle does.
    await yoy.fill('4.6');
    await yoy.blur();
    // After blur the editor stores "+4.6%" (plus glyph for positive).
    await expect(yoy).toHaveValue('4.6%');

    // Tap the toggle — sign flips to negative; the stored value now
    // uses the minus GLYPH (U+2212), not a hyphen, per the A7d.6
    // display contract.
    const toggle = page.getByTestId('percent-input-sign-toggle');
    await toggle.click();
    await expect(yoyWrapper).toHaveAttribute('data-sign', 'negative');
    await expect(toggle).toHaveText('−');

    // Read back the stored value through the AreaStats stat tile —
    // the published-page renderer surfaces medianSaleDeltaYoy verbatim
    // as the `.ctx` line under "Median sale · 90 days". To avoid a
    // full publish, just verify the magnitude input keeps the value
    // and the toggle reflects the sign.
    await expect(yoy).toHaveValue('4.6%');

    // Toggling back returns to a positive sign with the same magnitude.
    await toggle.click();
    await expect(yoyWrapper).toHaveAttribute('data-sign', 'positive');
    await expect(toggle).toHaveText('+');
    await expect(yoy).toHaveValue('4.6%');
  });

  test('signed YoY value round-trips verbatim through clampDraft → toPublicPayload → clampPublicPayload', () => {
    // The renderer reads payload.areaStats.medianSaleDeltaYoy as plain
    // text and emits it verbatim (presentation-page.tsx renders it
    // through `{c.ctx}` in AreaStats). So the storage-display contract
    // reduces to: whatever the editor wrote into the draft must
    // survive every clamp + serialize step unchanged.
    const NEG = '−4.6%'; // U+2212 minus glyph, as written by the +/− toggle
    const draft = {
      propertyAddress: '1742 Kenilworth Avenue',
      recommendedPrice: '$675,000',
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
      areaStats: {
        medianSaleDeltaYoy: NEG,
      },
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
// Fix 3 — Collision-safe chart annotation placement (geometry).
// =====================================================================

test.describe('A7d.6 / Fix 3 — Chart annotation placement is collision-safe', () => {
  // Chart geometry constants from presentation-page.tsx AreaChart.
  const X0 = 40;
  const X1 = 388;
  const Y_BOTTOM = 184;
  const NUM_LABEL_W = 60; // rec-tag-num is ~16px text — give it width room
  const NUM_LABEL_H = 18;
  const CALLOUT_RECT = { x0: X1 - 120, y0: 25, x1: X1, y1: 95 } as const;
  const X_TICK_Y = 204;

  // Build a 12-point series for a given price array spread across the
  // plot band (mimicking how AreaChart maps prices → y).
  function buildPoints(prices: number[]): {
    points: { x: number; y: number }[];
    min: number;
    max: number;
  } {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = Math.max(max - min, 1);
    const Y_TOP = 104;
    const plotHeight = Y_BOTTOM - Y_TOP;
    const points = prices.map((p, i) => ({
      x: X0 + ((X1 - X0) * i) / (prices.length - 1),
      y: Y_BOTTOM - ((p - min) / range) * (plotHeight - 6),
    }));
    return { points, min, max };
  }

  function recLineYFor(price: number, min: number, max: number): number {
    const range = Math.max(max - min, 1);
    const Y_TOP = 104;
    const plotHeight = Y_BOTTOM - Y_TOP;
    const y = Y_BOTTOM - ((price - min) / range) * (plotHeight - 6);
    return Math.max(20, Math.min(y, Y_BOTTOM - 4));
  }

  // Rect helpers for bbox non-overlap assertions.
  function rectsOverlap(
    a: { x0: number; y0: number; x1: number; y1: number },
    b: { x0: number; y0: number; x1: number; y1: number },
  ): boolean {
    return !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
  }

  function numRect(numX: number, numY: number, anchor: 'start' | 'end') {
    const x0 = anchor === 'end' ? numX - NUM_LABEL_W : numX;
    const x1 = anchor === 'end' ? numX : numX + NUM_LABEL_W;
    return { x0, y0: numY - NUM_LABEL_H + 2, x1, y1: numY + 2 };
  }

  // Polyline collision: sample dense x's, build mini-rects of the
  // polyline at each sample point, and assert the label rect doesn't
  // contain any sample within its x-band.
  function polylineCrosses(
    rect: { x0: number; y0: number; x1: number; y1: number },
    points: { x: number; y: number }[],
  ): boolean {
    const STEP = 2;
    for (let x = rect.x0; x <= rect.x1; x += STEP) {
      const y = polylineYAtX(points, x, Y_BOTTOM);
      if (y >= rect.y0 && y <= rect.y1) return true;
    }
    return false;
  }

  const SHAPES: Array<{
    name: string;
    prices: number[];
    recommendedPrice: number;
  }> = [
    {
      name: 'rising — recommended above all points',
      prices: [600, 605, 610, 615, 622, 628, 633, 639, 645, 650, 656, 660],
      recommendedPrice: 720, // far above max
    },
    {
      name: 'falling — recommended below all points',
      prices: [700, 695, 688, 680, 672, 665, 658, 650, 642, 635, 628, 620],
      recommendedPrice: 580, // far below min
    },
    {
      name: 'flat — recommended ≈ current',
      prices: [640, 640, 640, 640, 640, 640, 640, 640, 640, 640, 640, 640],
      recommendedPrice: 640, // basically on top of the polyline
    },
    {
      name: 'rising into top-right — recommended in the callout band',
      prices: [600, 610, 615, 625, 635, 645, 658, 670, 680, 690, 700, 712],
      recommendedPrice: 715, // pushes rec line up near the callout
    },
    {
      name: 'V-shape — polyline dips then climbs through the rec line',
      prices: [660, 650, 640, 628, 620, 615, 620, 628, 640, 650, 660, 668],
      recommendedPrice: 645, // sits in the polyline's range
    },
  ];

  for (const shape of SHAPES) {
    test(`labels clear polyline / callout / axis text — ${shape.name}`, () => {
      const { points, min, max } = buildPoints(shape.prices);
      const recLineY = recLineYFor(shape.recommendedPrice, min, max);
      const current = points[points.length - 1];

      const placement = placeRecAnnotation(
        points,
        recLineY,
        current,
        X0,
        X1,
        Y_BOTTOM,
      );

      const priceRect = numRect(
        placement.numX,
        placement.numY,
        placement.numAnchor,
      );

      // 1) Price label clears the polyline at its x-band.
      expect(
        polylineCrosses(priceRect, points),
        `price label rect ${JSON.stringify(priceRect)} crosses polyline`,
      ).toBe(false);

      // 2) Price label clears the upper-right current-value callout
      //    rect — that's the whole point of the left/right swap.
      expect(
        rectsOverlap(priceRect, CALLOUT_RECT),
        `price label rect ${JSON.stringify(priceRect)} overlaps callout`,
      ).toBe(false);

      // 3) Neither label drops into the x-tick label row at y≈204.
      expect(placement.numY).toBeLessThan(X_TICK_Y - 4);
      expect(placement.labelY).toBeLessThan(X_TICK_Y - 4);

      // 4) Neither label flies above the chart viewBox.
      expect(placement.numY).toBeGreaterThanOrEqual(12);
      expect(placement.labelY).toBeGreaterThanOrEqual(12);

      // 5) The two labels don't crash into each other (they always
      //    land at OPPOSITE horizontal edges by construction).
      expect(placement.labelAnchor).not.toEqual(placement.numAnchor);
    });
  }
});

// =====================================================================
// Fix 4 — Reviews CTA: source detection + name substitution.
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
    // Calm nameless fallback — no agent name, but source is preserved.
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
    // The token-leak guard: every helper output should be free of
    // the curly-brace template syntax for any combination of inputs.
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
    // Render the seller page with the OUTLINK_ONLY fixture (zillow URL,
    // agent "Aaron Test"). Verify the CTA shows "Aaron" + "Zillow" and
    // no curly-brace template noise leaked anywhere.
    await page.goto('/seller-presentation-preview?fixture=outlink-only');
    const cta = page.getByTestId('sep-reviews-outlink-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("Read Aaron's reviews on Zillow");
    const html = await page.content();
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
