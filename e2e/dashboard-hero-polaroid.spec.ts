import { test, expect, type Page } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * Dashboard hero polaroid — render + parity (v1.48 micro-hotfix).
 *
 * Both hero states render the same PresentationPoster (.poster-pres) in
 * their right column via posterForSkillId('seller-presentation')
 * (HeroNextAction.tsx). The polaroid lives in a .hero-poster-wrap capped at
 * 165×220 (165px width + aspect-ratio 3/4).
 *
 * Regression guarded here: .poster is position:absolute, so the wrap needs a
 * DEFINITE width or the `auto` hero grid track collapses and the polaroid
 * renders at ~0 width (only the caption survives, stretched down the right
 * edge). PR #16 pinned the wrap for .hero-card-empty; the v1.48 micro-hotfix
 * adds the same cap for .hero-card-slim (HeroPinned). These specs assert BOTH
 * states render a real polaroid at the same 165×220 cap on desktop, and that
 * the right column is hidden at the ≤760px mobile breakpoint.
 *
 *   HeroPinned   → brand kit configured  → [data-testid="sep-hero"]
 *   HeroEmptyState → brand kit absent     → [data-testid="sep-hero-empty"]
 */

const CAP = { width: 165, height: 220 };
const TOL = 1; // ±1px on the layout box → cross-state parity within ±2px

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 700, height: 900 }; // ≤760px → .hero-right hidden

// Measure the LAYOUT box (offsetWidth/Height), not boundingBox(): the wrap
// carries transform: rotate(-3deg), and Playwright's boundingBox() returns the
// rotated axis-aligned rect (165×220 → ~176×228). offsetWidth/Height report the
// pre-transform layout size — the true 165×220 cap this spec guards.
async function wrapLayoutSize(page: Page, heroTestId: string) {
  const wrap = page
    .getByTestId(heroTestId)
    .locator('.hero-poster-wrap')
    .filter({ has: page.locator('.poster-pres') });
  await expect(wrap).toBeVisible({ timeout: 10_000 });
  return wrap.evaluate((el: HTMLElement) => ({
    width: el.offsetWidth,
    height: el.offsetHeight,
  }));
}

test.describe('Dashboard hero polaroid — desktop render + 165×220 cap', () => {
  test('HeroPinned renders the polaroid in its right column', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // Confirm we are on the pinned hero (not the empty state).
    await expect(page.getByTestId('sep-hero-title')).toHaveText(
      'Build your seller presentation',
      { timeout: 10_000 },
    );

    const box = await wrapLayoutSize(page, 'sep-hero');
    expect(Math.abs(box.width - CAP.width)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(box.height - CAP.height)).toBeLessThanOrEqual(TOL);
  });

  test('HeroEmptyState renders the polaroid in its right column', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    // No seedBrandProfile → brand-kit gate fires → empty state wins.
    await page.goto('/dashboard');

    await expect(page.getByTestId('sep-hero-empty')).toBeVisible({
      timeout: 10_000,
    });

    const box = await wrapLayoutSize(page, 'sep-hero-empty');
    expect(Math.abs(box.width - CAP.width)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(box.height - CAP.height)).toBeLessThanOrEqual(TOL);
  });
});

test.describe('Dashboard hero polaroid — mobile hide (≤760px)', () => {
  test('HeroPinned hides the polaroid column on narrow screens', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('sep-hero-title')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId('sep-hero').locator('.poster-pres'),
    ).toBeHidden();
  });

  test('HeroEmptyState hides the polaroid column on narrow screens', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/dashboard');

    await expect(page.getByTestId('sep-hero-empty')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId('sep-hero-empty').locator('.poster-pres'),
    ).toBeHidden();
  });
});
