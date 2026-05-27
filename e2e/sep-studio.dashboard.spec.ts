import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * SEP-S Studio dashboard shell — v1.47 Lane A re-brand structural
 * proofs.
 *
 * Locks in the new structure the dashboard rebrand introduces:
 *   - Root scoping class so styles can't leak
 *   - Topbar (brand + topnav) renders
 *   - Welcome block with first-name personalization
 *   - 3 stage sections with correct data-stage attrs + tile counts
 *   - Social Studio flagship opens the modal and shows all 10
 *     social-animator templates with the right links
 *   - ?testTier=base URL knob threads through the resolver (no 500)
 *
 * No pixel snapshots — the token system (data-bg / data-density) will
 * evolve through A7f.3. Structural + testid + copy assertions are the
 * durable contract.
 */

test.describe('SEP-S Studio dashboard shell (v1.47 Lane A)', () => {
  test('root + topbar render with brand name and primary navigation', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // .sep-studio root is the single scoping anchor for every CSS rule
    // in sep-studio.css. data-attrs carry the static defaults.
    const root = page.getByTestId('sep-studio-root');
    await expect(root).toBeVisible({ timeout: 10_000 });
    await expect(root).toHaveAttribute('data-bg', 'warm');
    await expect(root).toHaveAttribute('data-density', 'comfy');
    await expect(root).toHaveAttribute('data-stagedots', 'on');

    const topbar = page.getByTestId('sep-topbar');
    await expect(topbar).toBeVisible();
    await expect(topbar).toContainText('SIMPLY EDIT');
    await expect(topbar).toContainText('PRO STUDIO');
    // Sign-out is wired to the server action.
    await expect(page.getByTestId('sep-sign-out')).toBeVisible();
  });

  test('welcome block personalizes the first name from BrandSettings', async ({
    page,
  }) => {
    // seedBrandProfile sets agentName; the welcome derives firstName by
    // taking the first whitespace-split token. We override here so the
    // assertion is anchored on a known string instead of whatever the
    // helper happens to seed.
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

    // Stage header data-stage drives the amber/mint/periwinkle tints.
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

    // Visibility surfaces ONE flagship tile (the modal trigger), not
    // ten individual tiles — that's the design's intentional collapse.
    await expect(page.getByTestId('sep-flagship-social')).toBeVisible();
  });

  test('Social Studio modal opens with all 10 templates linking to /social-animator routes', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // Modal is closed by default.
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);

    await page.getByTestId('sep-flagship-social').click();

    const modal = page.getByTestId('sep-studio-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal).toContainText(/pick a template/i);

    // All 10 social-animator templates surface as linked cards.
    const templateIds = [
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
    ];
    for (const id of templateIds) {
      const tile = page.getByTestId(`sep-studio-modal-tile-${id}`);
      await expect(tile).toBeVisible();
      const expectedHref = `/social-animator/${id.replace('social-animator-', '')}`;
      await expect(tile).toHaveAttribute('href', expectedHref);
    }

    // Esc closes the modal.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);
  });

  test('every rendered tile carries an entitlement gate marker (proves resolver threads through)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // Wait for the client island to hydrate + tile grids to mount —
    // counting locators before hydration returns 0 and races the
    // `expect(...).toBeGreaterThan(0)` assertion.
    await expect(
      page.getByTestId('sep-tile-seller-presentation'),
    ).toBeVisible({ timeout: 10_000 });

    // Every Tile renders `data-gate="available"` (or "locked"). Today
    // no registry skill declares `baseWorkflow > base`, so all tiles
    // resolve to "available" — proves the resolver wiring is live
    // without depending on a future-gated skill. When A7f.3 lands its
    // first gated declaration, this assertion gains a "locked" branch.
    const tiles = page.locator('[data-testid^="sep-tile-"]');
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);
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

    // Page renders the full shell — no 500, no missing root.
    await expect(page.getByTestId('sep-studio-root')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('sep-stage-win')).toBeVisible();
    await expect(page.getByTestId('sep-stage-launch')).toBeVisible();
    await expect(page.getByTestId('sep-stage-visibility')).toBeVisible();
    // Today no skill is gated above base, so every tile is available.
    // The locked-tile assertion lands when A7f.3 ships its first
    // baseWorkflow > base declaration — wiring is structurally proven
    // by the "every tile carries gate marker" test above.
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

  test('Win-stage seller-presentation tile uses design titleOverride ("Listing Presentation")', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // Per stop-condition resolution: the design's "Listing Presentation"
    // tile (with the "Full seller-facing deck" blurb) IS the
    // SELLER_PRESENTATION_SKILL. Tile renders the override copy but
    // routes via skillRoute('seller-presentation').
    const tile = page.getByTestId('sep-tile-seller-presentation');
    await expect(tile).toContainText('Listing Presentation');
    await expect(tile).toContainText(/full seller-facing deck/i);
    await expect(tile).toHaveAttribute('href', '/seller-presentation');

    // The LEGACY listing-presentation skill ("Listing Presentation
    // One-Pager") still surfaces as its own tile — registry-truth
    // beats design omission.
    const legacy = page.getByTestId('sep-tile-listing-presentation');
    await expect(legacy).toBeVisible();
    await expect(legacy).toHaveAttribute('href', '/listing-presentation');
  });
});
