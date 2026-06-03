import { test, expect, type Page } from '@playwright/test';

/**
 * Seller Presentation — brand-colors visual regression gate (Phase E.0).
 *
 * The cohort-safety contract: when an agent has NOT set brand colors, the
 * consumer /h/<slug> page must render byte-identical to today's
 * production Editorial palette; when they HAVE, only the three brand
 * colors change while every derived shade + layout stays put.
 *
 * Implemented as deterministic COMPUTED-STYLE assertions rather than
 * pixel screenshots. The contract is precisely "the unset render resolves
 * to the EXACT production hexes" — computed-color equality proves that
 * directly and is immune to font-rendering drift across CI runners (the
 * baseline-stability stop condition the packet flagged). The three
 * brand-wired primaries are --paper/--ink/--brick; the derived shades
 * (e.g. --paper-deep on the outer wrapper) stay fixed in E.0, which these
 * tests also assert.
 *
 * Driven via the stateless dev preview route (/seller-presentation-preview),
 * which accepts optional brandBg/brandText/brandAccent params routed
 * through the same clampPublicPayload boundary as a real publish.
 */

// Production Editorial palette (the var() fallbacks in presentation-page.css).
const PROD = {
  paper: 'rgb(241, 235, 224)', // --paper  #f1ebe0
  ink: 'rgb(26, 22, 18)', //     --ink    #1a1612
  brick: 'rgb(194, 106, 78)', // --brick  #c26a4e
  paperDeep: 'rgb(232, 224, 210)', // --paper-deep #e8e0d2 (derived, fixed)
};

// A deliberately non-default brand: navy bg + cream text + gold accent.
const BRAND = {
  bg: '#0f1c2e',
  text: '#f4e8d0',
  accent: '#c9a341',
  bgRgb: 'rgb(15, 28, 46)',
  textRgb: 'rgb(244, 232, 208)',
  accentRgb: 'rgb(201, 163, 65)',
};

async function colorsOf(page: Page) {
  const page_ = page.locator('.sep-presentation .page').first();
  const outer = page.getByTestId('seller-presentation-public');
  const dollar = page.locator('.sep-presentation .price .dollar').first();
  await expect(page_).toBeVisible();
  await expect(dollar).toBeVisible();
  const read = (loc: ReturnType<Page['locator']>, prop: string) =>
    loc.evaluate(
      (el, p) => getComputedStyle(el).getPropertyValue(p),
      prop,
    );
  return {
    pageBg: await read(page_, 'background-color'),
    pageText: await read(page_, 'color'),
    accent: await read(dollar, 'color'),
    outerBg: await read(outer, 'background-color'),
  };
}

test.describe('Seller Presentation — brand colors (E.0)', () => {
  test('UNSET brand colors render the exact production Editorial palette (cohort-safety gate)', async ({
    page,
  }) => {
    await page.goto('/seller-presentation-preview?fixture=full');
    const c = await colorsOf(page);

    // The three brand-wired primaries resolve to today's production hexes
    // via the CSS var() fallbacks — byte-identical to before E.0.
    expect(c.pageBg).toBe(PROD.paper);
    expect(c.pageText).toBe(PROD.ink);
    expect(c.accent).toBe(PROD.brick);

    // A derived shade (outer wrapper = --paper-deep) is untouched.
    expect(c.outerBg).toBe(PROD.paperDeep);

    // The page also emits NO inline brand custom properties when unset.
    const styleAttr = await page
      .getByTestId('seller-presentation-public')
      .getAttribute('style');
    expect(styleAttr ?? '').not.toContain('--brand-');
  });

  test('SET brand colors flow into the three primaries; layout + derived shades unchanged', async ({
    page,
  }) => {
    await page.goto(
      `/seller-presentation-preview?fixture=full&brandBg=${encodeURIComponent(
        BRAND.bg,
      )}&brandText=${encodeURIComponent(
        BRAND.text,
      )}&brandAccent=${encodeURIComponent(BRAND.accent)}`,
    );
    const c = await colorsOf(page);

    // The three brand colors now drive the page.
    expect(c.pageBg).toBe(BRAND.bgRgb);
    expect(c.pageText).toBe(BRAND.textRgb);
    expect(c.accent).toBe(BRAND.accentRgb);

    // Derived shade still fixed (E.0 only brand-wires the 3 primaries) —
    // proves the swap is scoped, not a palette-wide change.
    expect(c.outerBg).toBe(PROD.paperDeep);

    // Layout/structure identical: the same locked-design sections render.
    await expect(page.getByTestId('sep-hero')).toBeVisible();
    await expect(page.getByTestId('sep-price-panel')).toContainText('675');
    await expect(page.getByTestId('sep-why-price')).toBeVisible();
    await expect(page.getByTestId('sep-pitch')).toBeVisible();
  });

  test('invalid brand hex params fall back to the production palette (defense at boundary)', async ({
    page,
  }) => {
    await page.goto(
      '/seller-presentation-preview?fixture=full&brandBg=navy&brandText=%23ggg&brandAccent=',
    );
    const c = await colorsOf(page);
    expect(c.pageBg).toBe(PROD.paper);
    expect(c.pageText).toBe(PROD.ink);
    expect(c.accent).toBe(PROD.brick);
  });
});
