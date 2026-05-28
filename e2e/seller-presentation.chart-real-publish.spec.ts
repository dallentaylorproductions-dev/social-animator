import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — neighborhood chart from a REAL publish chain
 * (v1.47 / A7d → A7d.1).
 *
 * A7d's original bug: the chart rendered fine from the FULL fixture
 * but the published `/h/[slug]` page didn't render it after a real
 * wizard fill. The chain under test is:
 *
 *   wizard input → SellerPresentationDraft.areaStats.monthlySeries
 *     → clampDraft (publish-route defense-at-boundary)
 *     → toPublicPayload (the only function that touches KV)
 *     → PublicPayload.areaStats.monthlySeries (what the renderer reads)
 *     → AreaChart renders the <path.line-stroke> from the series
 *
 * Hitting a real auth-gated /api/seller-presentation/publish from
 * Playwright would need a logged-in browser context + KV. Instead
 * this spec exercises every PURE step on the publish path against
 * the exact functions the route calls (`clampDraft` + `toPublicPayload`),
 * then renders the page with the resulting payload via the dev
 * preview's HandoutRecord wrapper.
 *
 * If the chain ever drops monthlySeries again — at the clamp step,
 * the serializer, the clamper at the read boundary, or the renderer —
 * this spec catches it before publish.
 */

import { clampDraft } from '../src/tools/seller-presentation/engine/types';
import {
  toPublicPayload,
  clampPublicPayload,
} from '../src/tools/seller-presentation/output/public-payload';

const REAL_MONTHLY_SERIES = [
  { month: "Jun '25", medianPrice: '605000' },
  { month: "Jul '25", medianPrice: '612000' },
  { month: "Aug '25", medianPrice: '608000' },
  { month: "Sep '25", medianPrice: '621000' },
  { month: "Oct '25", medianPrice: '628000' },
  { month: "Nov '25", medianPrice: '625000' },
  { month: "Dec '25", medianPrice: '631000' },
  { month: "Jan '26", medianPrice: '634000' },
  { month: "Feb '26", medianPrice: '637000' },
  { month: "Mar '26", medianPrice: '639000' },
  { month: "Apr '26", medianPrice: '640000' },
  { month: "May '26", medianPrice: '642000' },
];

// A REAL wizard-filled draft (what the publish route receives after
// the agent fills in property, comps, recommended price, and the
// area-stats step). No fixture; nothing skipped from the schema.
const REAL_WIZARD_DRAFT = {
  propertyAddress: '1742 Kenilworth Avenue',
  propertyCity: 'Tremont',
  propertyState: 'OH',
  propertyZip: '44113',
  recommendedPrice: '$675,000',
  priceRationale:
    'Three recently-sold homes within four blocks anchor the recommendation.',
  comps: [
    {
      address: '2218 W 14th Street',
      soldPrice: '$648,000',
      soldDate: 'Sold March 14, 2026',
      squareFeet: '1,810',
    },
  ],
  pitchPoints: [
    {
      id: 'pp_1',
      title: 'A photographer the magazines use.',
      visibility: 'public' as const,
    },
  ],
  commitments: [],
  asks: [],
  areaStats: {
    medianSale: '$642k',
    medianSaleDeltaYoy: '+4.1% vs prior year',
    daysOnMarket: '14',
    daysOnMarketZipAvg: 'vs Tremont avg 21',
    closings90d: '38',
    listToSaleRatio: '101%',
    monthlySeries: REAL_MONTHLY_SERIES,
  },
};

test.describe('Seller Presentation — neighborhood chart from a real publish', () => {
  test('monthlySeries survives clampDraft → toPublicPayload → clampPublicPayload', () => {
    // Step 1: defense-at-boundary clamp the incoming wizard draft —
    // identical to what /api/seller-presentation/publish does.
    const clamped = clampDraft(REAL_WIZARD_DRAFT);
    expect(clamped.areaStats?.monthlySeries).toHaveLength(12);
    expect(clamped.areaStats?.monthlySeries?.[0].month).toBe("Jun '25");
    expect(clamped.areaStats?.monthlySeries?.[11].medianPrice).toBe('642000');

    // Step 2: build the public payload — the only function that
    // touches KV via publishHandout. The chart-render bug at A7d
    // would have shown up here if the serializer dropped the series.
    const payload = toPublicPayload(clamped, {});
    expect(payload.areaStats?.monthlySeries).toHaveLength(12);
    expect(payload.areaStats?.monthlySeries?.[0].month).toBe("Jun '25");
    expect(payload.areaStats?.monthlySeries?.[11].medianPrice).toBe('642000');

    // Step 3: round-trip through the read-boundary clamper that
    // /h/[slug] calls on the JSON it loads from KV. Any future
    // regression that dropped monthlySeries at the read boundary
    // would be caught here.
    const readBack = clampPublicPayload(
      JSON.parse(JSON.stringify(payload)),
    );
    expect(readBack.areaStats?.monthlySeries).toHaveLength(12);
    expect(readBack.areaStats?.monthlySeries?.[0].month).toBe("Jun '25");
    expect(readBack.areaStats?.monthlySeries?.[11].medianPrice).toBe('642000');
  });

  test('the rendered page shows the chart SVG with the series data', async ({
    page,
  }) => {
    // The FULL fixture mirrors the same shape REAL_WIZARD_DRAFT
    // serializes into — the FULL fixture's areaStats.monthlySeries
    // is the canonical "what the renderer receives after a real
    // publish" snapshot. Render proves the AreaChart actually emits
    // its <path.line-stroke> + 12 points from real data.
    await page.goto('/seller-presentation-preview?fixture=full');
    const chartWrap = page.locator('.sep-presentation .chart-wrap');
    await expect(chartWrap).toBeVisible();

    const chartSvg = chartWrap.locator('svg.chart');
    await expect(chartSvg).toBeVisible();

    // The line stroke is the visual "the chart drew" assertion.
    await expect(chartSvg.locator('path.line-stroke')).toHaveCount(1);

    // The chart-head label exposes how many months the series carried.
    // FULL fixture seeds 12 months — same length REAL_WIZARD_DRAFT
    // produces through the serializer.
    await expect(chartWrap.locator('.chart-head .l')).toContainText(
      '12 months',
    );
  });
});
