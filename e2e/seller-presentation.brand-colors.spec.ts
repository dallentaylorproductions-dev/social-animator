import { test, expect, type Page } from '@playwright/test';

/**
 * Seller Presentation — brand-colors regression gate (Phase E.1).
 *
 * Re-pinned from E.0 for the brand-color unification. The page now runs the
 * OKLCh ramp engine at render and inlines the resolved ramp hexes on <main>.
 * Two pinned consequences (ratified, NOT bugs):
 *   1. NO cyan anywhere — the 8 ex-`#4ef2d9` spots now read as the signature
 *      family. This is the no-cyan gate.
 *   2. Default-look delta: at the Editorial defaults the signature is
 *      terracotta `#c26a4e` (3.24:1 vs cream → unclamped, so the three
 *      primaries still resolve to today's hexes); only the derived shades
 *      (e.g. --paper-deep, now ramp-derived) and the 8 ex-mint spots change.
 *
 * Deterministic computed-style assertions (font-drift-immune), driven via
 * the stateless preview route.
 */

const CYAN = 'rgb(78, 242, 217)'; // #4ef2d9 — must appear NOWHERE
const PROD = {
  paper: 'rgb(241, 235, 224)', // --surface #f1ebe0
  ink: 'rgb(26, 22, 18)', //     --ink     #1a1612
  signature: 'rgb(194, 106, 78)', // --signature #c26a4e (unclamped at defaults)
};
const BRAND = {
  bg: '#0f1c2e',
  text: '#f4e8d0',
  accent: '#c9a341',
  bgRgb: 'rgb(15, 28, 46)',
  textRgb: 'rgb(244, 232, 208)',
  accentRgb: 'rgb(201, 163, 65)',
};

async function primaries(page: Page) {
  const page_ = page.locator('.sep-presentation .page').first();
  const dollar = page.locator('.sep-presentation .price .dollar').first();
  await expect(page_).toBeVisible();
  await expect(dollar).toBeVisible();
  const read = (loc: ReturnType<Page['locator']>, prop: string) =>
    loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  return {
    pageBg: await read(page_, 'background-color'),
    pageText: await read(page_, 'color'),
    accent: await read(dollar, 'color'),
  };
}

// Scan every element's computed color + backgroundColor for the cyan.
async function cyanCount(page: Page): Promise<number> {
  return page.evaluate((cyan) => {
    let n = 0;
    document.querySelectorAll('.sep-presentation, .sep-presentation *').forEach((el) => {
      const cs = getComputedStyle(el as Element);
      if (cs.color === cyan) n++;
      if (cs.backgroundColor === cyan) n++;
      if (cs.borderTopColor === cyan) n++;
    });
    return n;
  }, CYAN);
}

test.describe('Seller Presentation — brand colors (E.1)', () => {
  test('UNSET: primaries resolve to today\'s Editorial hexes; ramp inlined; ZERO cyan', async ({
    page,
  }) => {
    await page.goto('/seller-presentation-preview?fixture=full');
    const c = await primaries(page);
    expect(c.pageBg).toBe(PROD.paper);
    expect(c.pageText).toBe(PROD.ink);
    expect(c.accent).toBe(PROD.signature);

    // The engine inlines the resolved ramp on <main> (the live path).
    const styleAttr =
      (await page.getByTestId('seller-presentation-public').getAttribute('style')) ?? '';
    expect(styleAttr).toContain('--signature');
    expect(styleAttr).not.toContain('--brand-'); // E.0 indirection retired

    // The no-cyan gate: the 8 ex-mint spots now read signature-family.
    expect(await cyanCount(page)).toBe(0);
    // The hero eyebrow (ex-cyan) is now the signature family, not cyan.
    const eyebrow = await page
      .locator('.sep-presentation .caption-card .for')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(eyebrow).not.toBe(CYAN);
  });

  test('SET (navy/cream/gold): primaries flow; layout intact; ZERO cyan', async ({
    page,
  }) => {
    await page.goto(
      `/seller-presentation-preview?fixture=full&brandBg=${encodeURIComponent(
        BRAND.bg,
      )}&brandText=${encodeURIComponent(
        BRAND.text,
      )}&brandAccent=${encodeURIComponent(BRAND.accent)}`,
    );
    const c = await primaries(page);
    expect(c.pageBg).toBe(BRAND.bgRgb);
    expect(c.pageText).toBe(BRAND.textRgb);
    expect(c.accent).toBe(BRAND.accentRgb);

    expect(await cyanCount(page)).toBe(0);

    await expect(page.getByTestId('sep-hero')).toBeVisible();
    await expect(page.getByTestId('sep-price-panel')).toContainText('675');
    await expect(page.getByTestId('sep-why-price')).toBeVisible();
    await expect(page.getByTestId('sep-pitch')).toBeVisible();
  });

  test('secondary set → decorative role differs from signature; still ZERO cyan', async ({
    page,
  }) => {
    // navy signature + gold secondary: the end-mark dot (decorative) takes
    // gold, distinct from the navy signature dollar.
    await page.goto(
      '/seller-presentation-preview?fixture=full&brandAccent=%231F3A6B&brandSecondary=%23B0863A',
    );
    const dollar = await page
      .locator('.sep-presentation .price .dollar')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    const endDot = await page
      .locator('.sep-presentation .end-mark .dot')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dollar).not.toBe(endDot); // signature (navy) ≠ decorative (gold)
    expect(await cyanCount(page)).toBe(0);
  });

  test('F3 SAFETY GATE: an unset-brand v1 page stays terracotta (byte-identical, NOT the new blue default)', async ({
    page,
  }) => {
    // F3 flipped the FORM default + engine fallback to flagship blue #037290,
    // but the v1 cohort default (E1_DEFAULTS.signature + the v1 CSS fallbacks)
    // is deliberately untouched. A pre-F3 slug published with NO brand settings
    // renders v1 (no ?template, no brand params) and MUST still resolve to the
    // legacy terracotta signature — proving the change is invisible to the
    // already-published cohort.
    await page.goto('/seller-presentation-preview?fixture=full');
    // it is the v1 renderer (flagship root absent)
    await expect(page.getByTestId('seller-presentation-public')).toBeVisible();
    await expect(page.getByTestId('seller-presentation-flagship')).toHaveCount(0);
    const c = await primaries(page);
    expect(c.pageBg).toBe(PROD.paper);
    expect(c.pageText).toBe(PROD.ink);
    expect(c.accent).toBe(PROD.signature); // terracotta rgb(194,106,78), NOT blue
    // and explicitly NOT the new blue default (#037290 → rgb(3,114,144))
    expect(c.accent).not.toBe('rgb(3, 114, 144)');
  });

  test('invalid brand hex params fall back to the production palette', async ({
    page,
  }) => {
    await page.goto(
      '/seller-presentation-preview?fixture=full&brandBg=navy&brandText=%23ggg&brandAccent=',
    );
    const c = await primaries(page);
    expect(c.pageBg).toBe(PROD.paper);
    expect(c.pageText).toBe(PROD.ink);
    expect(c.accent).toBe(PROD.signature);
    expect(await cyanCount(page)).toBe(0);
  });
});
