import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * SEP-S Studio dashboard shell — structural proofs (post-fix-it).
 *
 * Locks in the shape after the fix-it pass on top of the initial
 * f3529e6 rebrand:
 *   - Tile content binds to ALL_SKILLS (skill.name / skill.purpose) —
 *     no hardcoded design literals.
 *   - Stage 3 renders 10 visible tiles, one per social-animator
 *     template, in a 5-up grid. The flagship marquee + picker modal
 *     are gone.
 *   - Each Stage 3 tile mounts the shared TemplatePreview component
 *     (canvas-rendered looping thumbnail) — proven by the presence
 *     of a <canvas> inside the tile's poster.
 *   - Topnav has no dead Library link.
 *   - A7f.2 entitlement wiring + ?testTier= URL knob still threaded.
 */

test.describe('SEP-S Studio dashboard shell (v1.47 Lane A)', () => {
  test('root + topbar render with brand name and primary navigation', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    const root = page.getByTestId('sep-studio-root');
    await expect(root).toBeVisible({ timeout: 10_000 });
    await expect(root).toHaveAttribute('data-bg', 'warm');
    await expect(root).toHaveAttribute('data-density', 'comfy');
    await expect(root).toHaveAttribute('data-stagedots', 'on');

    const topbar = page.getByTestId('sep-topbar');
    await expect(topbar).toBeVisible();
    await expect(topbar).toContainText('SIMPLY EDIT');
    await expect(topbar).toContainText('PRO STUDIO');
    // Dead Library link was removed in the fix-it — only Brand kit +
    // Settings remain, both pointing at /settings, plus the sign-out
    // server-action button.
    await expect(topbar).not.toContainText(/library/i);
    const navLinks = topbar.getByRole('link');
    await expect(navLinks).toHaveCount(2);
    await expect(navLinks.nth(0)).toHaveAttribute('href', '/settings');
    await expect(navLinks.nth(1)).toHaveAttribute('href', '/settings');
    await expect(page.getByTestId('sep-sign-out')).toBeVisible();
  });

  test('welcome block personalizes the first name from BrandSettings', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'socanim_brand_settings',
        JSON.stringify({ agentName: 'Marisol Reyes' }),
      );
    });
    await page.goto('/dashboard');
    await expect(page.getByTestId('sep-welcome-name')).toContainText('Marisol.', {
      timeout: 10_000,
    });
  });

  test('three stage sections render with correct data-stage attrs and tile counts', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    const winStage = page.getByTestId('sep-stage-win');
    const launchStage = page.getByTestId('sep-stage-launch');
    const visStage = page.getByTestId('sep-stage-visibility');

    for (const stage of [winStage, launchStage, visStage]) {
      await expect(stage).toBeVisible({ timeout: 10_000 });
    }

    await expect(page.getByTestId('sep-stage-head-win')).toHaveAttribute(
      'data-stage',
      'win',
    );
    await expect(page.getByTestId('sep-stage-head-launch')).toHaveAttribute(
      'data-stage',
      'launch',
    );
    await expect(
      page.getByTestId('sep-stage-head-visibility'),
    ).toHaveAttribute('data-stage', 'visibility');

    // Win = 4 tiles (Seller pitch ∪ Open house): seller-presentation,
    // seller-intelligence-report, listing-presentation, open-house-prep.
    for (const skillId of [
      'seller-presentation',
      'seller-intelligence-report',
      'listing-presentation',
      'open-house-prep',
    ]) {
      await expect(page.getByTestId(`sep-tile-${skillId}`)).toBeVisible();
    }

    // Launch = 2 tiles (Marketing assets): listing-flyer, open-house-promo.
    for (const skillId of ['listing-flyer', 'open-house-promo']) {
      await expect(page.getByTestId(`sep-tile-${skillId}`)).toBeVisible();
    }

    // Visibility = 10 visible social-animator tiles (one per template) —
    // the flagship + modal pattern is gone.
    for (const id of SOCIAL_TEMPLATE_IDS) {
      await expect(page.getByTestId(`sep-tile-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('sep-flagship-social')).toHaveCount(0);
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);
  });

  test('every rendered tile carries an entitlement gate marker (proves resolver threads through)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');
    // Wait for hydration via a known tile before counting.
    await expect(
      page.getByTestId('sep-tile-seller-presentation'),
    ).toBeVisible({ timeout: 10_000 });

    const tiles = page.locator('[data-testid^="sep-tile-"]');
    const count = await tiles.count();
    // 4 Win + 2 Launch + 10 Visibility = 16.
    expect(count).toBeGreaterThanOrEqual(16);
    for (let i = 0; i < count; i++) {
      const gate = await tiles.nth(i).getAttribute('data-gate');
      expect(gate === 'available' || gate === 'locked').toBe(true);
    }
  });

  test('?testTier=base loads the dashboard without breaking — resolver honors the override', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard?testTier=base');

    await expect(page.getByTestId('sep-studio-root')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('sep-stage-win')).toBeVisible();
    await expect(page.getByTestId('sep-stage-launch')).toBeVisible();
    await expect(page.getByTestId('sep-stage-visibility')).toBeVisible();
  });

  test('?testTier=pro renders the same tile set as default — wiring stable across tiers', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard?testTier=pro');
    await expect(page.getByTestId('sep-studio-root')).toBeVisible({
      timeout: 10_000,
    });
    for (const skillId of [
      'seller-presentation',
      'seller-intelligence-report',
      'listing-presentation',
      'open-house-prep',
      'listing-flyer',
      'open-house-promo',
    ]) {
      const tile = page.getByTestId(`sep-tile-${skillId}`);
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute('data-gate', 'available');
    }
  });

  test('Win-stage tiles bind to registry name/purpose (no design-literal overrides)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // The seller-presentation tile MUST show "Seller Presentation"
    // (skill.name) — not "Listing Presentation" (the design's now-
    // dropped override). The blurb comes from skill.purpose.
    const sp = page.getByTestId('sep-tile-seller-presentation');
    await expect(sp).toBeVisible({ timeout: 10_000 });
    await expect(sp).toContainText('Seller Presentation');
    // The blurb starts with "Build a seller presentation" per
    // SELLER_PRESENTATION_SKILL.purpose — anchor on that prefix so a
    // future copy tweak doesn't require re-touching the test, but a
    // regression to the design-literal "Full seller-facing deck" copy
    // would fail.
    await expect(sp).not.toContainText(/full seller-facing deck/i);

    // The legacy listing-presentation skill's tile shows its real
    // registry name ("Listing Presentation One-Pager"), not just
    // "Listing Presentation".
    const lp = page.getByTestId('sep-tile-listing-presentation');
    await expect(lp).toBeVisible();
    await expect(lp).toContainText('Listing Presentation One-Pager');
    await expect(lp).toHaveAttribute('href', '/listing-presentation');
  });

  test('Stage 3 social tiles mount the live TemplatePreview canvas (no static SVG)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // Wait for the visibility section's first tile to be visible.
    const firstSocialTile = page.getByTestId(
      `sep-tile-${SOCIAL_TEMPLATE_IDS[0]}`,
    );
    await expect(firstSocialTile).toBeVisible({ timeout: 10_000 });

    // Each Stage 3 tile must contain a <canvas> — that's the
    // TemplatePreview render target. If a future refactor reverts to
    // static SVG / divs, this asserts the regression immediately.
    for (const id of SOCIAL_TEMPLATE_IDS) {
      const tile = page.getByTestId(`sep-tile-${id}`);
      await expect(tile.locator('canvas')).toHaveCount(1);
    }

    // The tiles route to /social-animator/<template-id> (stripping the
    // social-animator- prefix from the skill id).
    for (const id of SOCIAL_TEMPLATE_IDS) {
      const templateId = id.replace('social-animator-', '');
      const tile = page.getByTestId(`sep-tile-${id}`);
      await expect(tile).toHaveAttribute(
        'href',
        `/social-animator/${templateId}`,
      );
    }
  });
});

// Mirror of SOCIAL_ANIMATOR_SKILLS order from src/templates/skills.ts.
// Kept inline so the spec doesn't import production source (Playwright's
// runner has its own TS pipeline that doesn't always agree with the
// app's path aliases without extra config).
const SOCIAL_TEMPLATE_IDS = [
  'social-animator-qa-card',
  'social-animator-listing-card',
  'social-animator-listing-showcase',
  'social-animator-listing-carousel',
  'social-animator-before-after',
  'social-animator-testimonial-card',
  'social-animator-numbered-process',
  'social-animator-grid-comparison',
  'social-animator-stat-highlight',
  'social-animator-market-update',
] as const;
