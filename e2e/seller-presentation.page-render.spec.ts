import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — premium consumer page render proof (v1.47 / A7b).
 *
 * Renders the locked-design page from both fixtures via the dev
 * preview route (`/seller-presentation-preview?fixture=full|minimal`)
 * — A7c hasn't shipped wizard capture for the new fields yet, so the
 * preview route is the cleanest way to drive the renderer.
 *
 * What this spec proves:
 *   1. FULL fixture renders every locked-design section.
 *   2. MINIMAL fixture hides every optional block cleanly (no
 *      empty holes; the "snapshot coming soon" fallback shows in
 *      place of the area chart).
 *   3. Text legibility never depends on the hero photo — the
 *      caption-card is always present in front of it.
 *   4. The reduced-motion path renders all content (no element
 *      stuck at opacity 0) — proves the @media (prefers-reduced-motion)
 *      escape hatch in presentation-page.css.
 *
 * No-flake conventions banked from A5a/A6.1:
 *   - No `page.addInitScript(() => localStorage.clear())` — this
 *     spec doesn't reload, but the rule sticks: the preview route
 *     is stateless and tests start from a fresh context anyway.
 *   - We rely on Playwright's automatic actionability waits + the
 *     section testids the renderer emits.
 */

test.describe('Seller Presentation — A7b premium page render', () => {
  test('FULL fixture renders every locked-design section', async ({ page }) => {
    await page.goto('/seller-presentation-preview?fixture=full');

    // Outermost shell + the article — the design's "page".
    await expect(page.getByTestId('seller-presentation-public')).toBeVisible();
    await expect(page.getByTestId('sep-hero')).toBeVisible();

    // The caption-card MUST be present — it carries the address text
    // that the design deliberately pulls OFF the hero photo. (Test 3
    // below re-asserts the legibility invariant explicitly.)
    const caption = page.getByTestId('sep-caption-card');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText('1742 Kenilworth Avenue');
    await expect(caption).toContainText('Tremont, OH');
    await expect(page.getByTestId('sep-prepared-for')).toContainText(
      'For the Halloran family',
    );

    // Personal note (optional, populated in full fixture).
    await expect(page.getByTestId('sep-personal-note')).toBeVisible();

    // Price panel hero number.
    const price = page.getByTestId('sep-price-panel');
    await expect(price).toBeVisible();
    await expect(price).toContainText('$');
    await expect(price).toContainText('675');

    // Video block (optional, populated in full fixture).
    await expect(page.getByTestId('sep-video')).toBeVisible();

    // Why-this-price + comps.
    await expect(page.getByTestId('sep-why-price')).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId(`sep-comp-${i}`)).toBeVisible();
    }

    // Pitch points.
    await expect(page.getByTestId('sep-pitch')).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await expect(page.getByTestId(`sep-pp-${i}`)).toBeVisible();
    }

    // Track record (dark chapter) + testimonial.
    await expect(page.getByTestId('sep-track')).toBeVisible();
    await expect(page.getByTestId('sep-testimonial')).toBeVisible();

    // Reviews + outlink.
    await expect(page.getByTestId('sep-reviews')).toBeVisible();
    const outlink = page.getByRole('link', {
      name: /See all reviews on Zillow/,
    });
    await expect(outlink).toBeVisible();

    // Area stats + chart (NOT the empty state).
    const area = page.getByTestId('sep-area');
    await expect(area).toBeVisible();
    await expect(area).not.toHaveClass(/area--empty/);

    // Buyer quote (dark inset panel).
    await expect(page.getByTestId('sep-buyer-quote')).toBeVisible();

    // Agent (dark chapter) — name + CTA.
    const agent = page.getByTestId('sep-agent');
    await expect(agent).toBeVisible();
    await expect(agent).toContainText('Marisol Reyes');
    await expect(
      page.getByRole('link', { name: /Schedule a listing call/ }),
    ).toBeVisible();
  });

  test('MINIMAL fixture hides every optional block cleanly', async ({ page }) => {
    await page.goto('/seller-presentation-preview?fixture=minimal');

    // Required sections still render.
    await expect(page.getByTestId('seller-presentation-public')).toBeVisible();
    await expect(page.getByTestId('sep-hero')).toBeVisible();
    await expect(page.getByTestId('sep-caption-card')).toBeVisible();
    await expect(page.getByTestId('sep-price-panel')).toBeVisible();
    await expect(page.getByTestId('sep-why-price')).toBeVisible();
    await expect(page.getByTestId('sep-agent')).toBeVisible();

    // Every OPTIONAL block must be absent — no half-populated objects,
    // no empty holes.
    for (const testid of [
      'sep-prepared-for',
      'sep-personal-note',
      'sep-video',
      'sep-pitch',
      'sep-track',
      'sep-testimonial',
      'sep-reviews',
      'sep-buyer-quote',
    ]) {
      await expect(page.getByTestId(testid)).toHaveCount(0);
    }

    // Area section renders in its "snapshot coming soon" empty state
    // — the section itself is present (visual rhythm) but the stats
    // grid + chart are replaced by the editorial "coming soon" copy.
    const area = page.getByTestId('sep-area');
    await expect(area).toBeVisible();
    await expect(area).toHaveClass(/area--empty/);
    await expect(area).toContainText('A market snapshot is on the way.');
  });

  test('caption-card preserves legibility independent of the hero photo', async ({
    page,
  }) => {
    // The locked design deliberately KEEPS all text OFF the hero
    // photo — the caption card overlaps the photo's bottom edge by
    // -44px but its background is solid dark ink. Verify the address
    // text lives inside the card (not floating over the photo).
    await page.goto('/seller-presentation-preview?fixture=full');
    const addr = page.locator('.sep-presentation .caption-card .addr');
    await expect(addr).toBeVisible();
    await expect(addr).toContainText('1742 Kenilworth Avenue');

    // The hero photo is aria-hidden (decorative), so it must NOT be
    // in the accessibility tree's reading order. That's the cleanest
    // structural check that the design "puts text off the photo".
    const heroPhoto = page.locator('.sep-presentation .hero-photo');
    await expect(heroPhoto).toHaveAttribute('aria-hidden', 'true');
  });

  test('reduced-motion path renders all content with no motion-hidden elements', async ({
    browser,
  }) => {
    // Spin a NEW context with the reduced-motion media feature
    // forced on, then assert that elements which would otherwise be
    // motion-hidden (opacity:0 until .reveal.in lands) are visible
    // at opacity:1 from the first paint.
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await page.goto('/seller-presentation-preview?fixture=full');

      // The track-record dark chapter sits well below the fold and
      // would normally be opacity:0 until the IntersectionObserver
      // fires. Under reduced-motion, the CSS @media rule pins it to
      // opacity:1 immediately. Assert directly via getComputedStyle.
      const trackOpacity = await page
        .locator('.sep-presentation .track .sec-title')
        .evaluate((el) => window.getComputedStyle(el).opacity);
      expect(Number(trackOpacity)).toBe(1);

      const compOpacity = await page
        .locator('.sep-presentation .comp')
        .first()
        .evaluate((el) => window.getComputedStyle(el).opacity);
      expect(Number(compOpacity)).toBe(1);

      // The agent verify-tick (delayed scale-in) must also be at its
      // final state under reduced-motion.
      const verifyTransform = await page
        .locator('.sep-presentation .agent-photo .verify')
        .evaluate((el) => window.getComputedStyle(el).transform);
      // 'none' or matrix(1, 0, 0, 1, 0, 0) — both mean "no scale".
      expect(verifyTransform === 'none' || verifyTransform.includes('matrix(1')).toBe(
        true,
      );
    } finally {
      await context.close();
    }
  });
});
