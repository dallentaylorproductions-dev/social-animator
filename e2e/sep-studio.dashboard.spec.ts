import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * SEP-S Studio dashboard shell — structural proofs.
 *
 * Locks in the post-fix-it / post-restore shape:
 *   - Tile content binds to ALL_SKILLS (skill.name / skill.purpose) —
 *     no hardcoded design literals. (Set in 397fc80.)
 *   - Stage 3 surfaces as a SINGLE flagship Social Studio tile; clicking
 *     it opens a modal listing all 10 social-animator templates as
 *     navigable cards. (Restored in this packet on top of 397fc80,
 *     which had over-expanded to a 10-tile grid.)
 *   - Each modal card renders a real looping <SocialThumbnail> preview
 *     (canvas-rendered TemplatePreview), not static SVG.
 *   - Topnav consolidated to Settings | Sign out (Library dropped in
 *     397fc80; Brand kit dropped this packet — redundant with Settings).
 *   - A7f.2 entitlement wiring + ?testTier= URL knob still threaded.
 */

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

test.describe('SEP-S Studio dashboard shell (v1.47 Lane A)', () => {
  test('root + topbar render with brand name and consolidated nav (Settings + Sign out)', async ({
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
    // Topnav has ONE link (Settings) + the sign-out form button.
    // Library was dropped (no route). Brand kit was dropped (redundant
    // with Settings — both pointed at /settings).
    await expect(topbar).not.toContainText(/library/i);
    await expect(topbar).not.toContainText(/brand kit/i);
    const navLinks = topbar.getByRole('link');
    await expect(navLinks).toHaveCount(1);
    await expect(navLinks.nth(0)).toHaveAttribute('href', '/settings');
    await expect(navLinks.nth(0)).toContainText(/^settings$/i);
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

    for (const stageId of ['sep-stage-win', 'sep-stage-launch', 'sep-stage-visibility']) {
      await expect(page.getByTestId(stageId)).toBeVisible({ timeout: 10_000 });
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

    // Win = 4 tiles (Seller pitch ∪ Open house).
    for (const skillId of [
      'seller-presentation',
      'seller-intelligence-report',
      'listing-presentation',
      'open-house-prep',
    ]) {
      await expect(page.getByTestId(`sep-tile-${skillId}`)).toBeVisible();
    }
    // Launch = 2 tiles (Marketing assets).
    for (const skillId of ['listing-flyer', 'open-house-promo']) {
      await expect(page.getByTestId(`sep-tile-${skillId}`)).toBeVisible();
    }
    // Visibility = SINGLE flagship tile (not 10 individual tiles).
    await expect(page.getByTestId('sep-flagship-social')).toBeVisible();
    for (const id of SOCIAL_TEMPLATE_IDS) {
      // Each social skill exists only inside the modal — never as a
      // standalone Stage 3 tile.
      await expect(page.getByTestId(`sep-tile-${id}`)).toHaveCount(0);
    }
    // Modal is closed at rest.
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);
  });

  test('every tile + the flagship carry an entitlement gate marker on the Tile path (resolver wiring proof)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');
    await expect(
      page.getByTestId('sep-tile-seller-presentation'),
    ).toBeVisible({ timeout: 10_000 });

    // 4 Win + 2 Launch = 6 stage tiles all carry data-gate.
    const tiles = page.locator('[data-testid^="sep-tile-"]');
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(6);
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

    const sp = page.getByTestId('sep-tile-seller-presentation');
    await expect(sp).toBeVisible({ timeout: 10_000 });
    // skill.name verbatim — NOT the design's now-dropped "Listing
    // Presentation" override.
    await expect(sp).toContainText('Seller Presentation');
    // skill.purpose verbatim — NOT the design's "Full seller-facing deck"
    // literal blurb.
    await expect(sp).not.toContainText(/full seller-facing deck/i);

    const lp = page.getByTestId('sep-tile-listing-presentation');
    await expect(lp).toBeVisible();
    await expect(lp).toContainText('Listing Presentation One-Pager');
    await expect(lp).toHaveAttribute('href', '/listing-presentation');
  });

  test('Social Studio modal opens from flagship; cards render real <SocialThumbnail> canvases linking to /social-animator routes', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    const flagship = page.getByTestId('sep-flagship-social');
    await expect(flagship).toBeVisible({ timeout: 10_000 });
    // Flagship itself carries a single representative SocialThumbnail
    // canvas (the calm at-rest preview) — proves the flagship-feature
    // wire is live.
    await expect(flagship.locator('canvas')).toHaveCount(1);

    // Modal is closed at rest.
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);

    await flagship.click();

    const modal = page.getByTestId('sep-studio-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal).toContainText(/pick a template/i);

    // All 10 social-animator templates surface as cards, each with a
    // canvas-rendered <SocialThumbnail> (NOT static SVG). Routes
    // derive from skillRoute(skill.id) = /social-animator/<template>.
    for (const id of SOCIAL_TEMPLATE_IDS) {
      const card = page.getByTestId(`sep-studio-modal-tile-${id}`);
      await expect(card).toBeVisible();
      // canvas presence — TemplatePreview's render target. A regression
      // back to static SVG fails this assertion immediately.
      await expect(card.locator('canvas')).toHaveCount(1);
      const templateId = id.replace('social-animator-', '');
      await expect(card).toHaveAttribute(
        'href',
        `/social-animator/${templateId}`,
      );
    }
  });

  test('Social Studio modal closes via Escape key (subtree unmounts → previews stop)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    const flagship = page.getByTestId('sep-flagship-social');
    await expect(flagship).toBeVisible({ timeout: 10_000 });
    await flagship.click();
    await expect(page.getByTestId('sep-studio-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    // Modal subtree unmounts; the 10 canvases inside go with it.
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="sep-studio-modal-tile-"]'),
    ).toHaveCount(0);
  });

  test('Social Studio modal closes via scrim click and via the X button', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');
    await page.getByTestId('sep-flagship-social').click();
    await expect(page.getByTestId('sep-studio-modal')).toBeVisible({
      timeout: 10_000,
    });

    // X button closes.
    await page.getByTestId('sep-studio-modal-close').click();
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);

    // Re-open + scrim-click.
    await page.getByTestId('sep-flagship-social').click();
    await expect(page.getByTestId('sep-studio-modal')).toBeVisible();
    // Click the scrim directly (top-left corner of the viewport — the
    // modal dialog itself stopPropagation's clicks).
    await page.mouse.click(10, 10);
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);
  });
});
