import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * SEP-S Studio dashboard shell — structural proofs.
 *
 * Current contract:
 *   - Tile content binds to ALL_SKILLS (skill.name / skill.purpose) —
 *     no design-literal overrides. (Set in 397fc80, preserved here.)
 *   - Stage 3 surfaces as a SINGLE flagship Social Studio tile rendered
 *     as a Next.js <Link href="/social-animator"> — clicking navigates
 *     directly to the existing template-picker page; NO dashboard-side
 *     modal. (Restored on top of 08a010d's calm-thumbnail variant.)
 *   - Topnav consolidated to Settings + Sign out (Library dropped in
 *     397fc80; Brand kit dropped in 08a010d — redundant with Settings).
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
    await expect(topbar).not.toContainText(/library/i);
    await expect(topbar).not.toContainText(/brand kit/i);
    const navLinks = topbar.getByRole('link');
    await expect(navLinks).toHaveCount(1);
    await expect(navLinks.nth(0)).toHaveAttribute('href', '/settings');
    await expect(navLinks.nth(0)).toContainText(/^settings$/i);
    // The two visible topnav affordances (Settings link + Sign out
    // button) share the `.topnav-link` class so the styling stays
    // consistent. Asserting on that count gives a single "two visible
    // items" check decoupled from element semantics.
    const navItems = topbar.locator('.topnav-link');
    await expect(navItems).toHaveCount(2);
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
    // Visibility = SINGLE flagship (no per-template tiles on the
    // dashboard, no modal). The flagship is the only Stage 3 tile.
    await expect(page.getByTestId('sep-flagship-social')).toBeVisible();
    for (const id of SOCIAL_TEMPLATE_IDS) {
      await expect(page.getByTestId(`sep-tile-${id}`)).toHaveCount(0);
    }
    // No modal exists on the dashboard anymore — verify zero modal
    // chrome rendered at rest OR on click (click navigates away).
    await expect(page.getByTestId('sep-studio-modal')).toHaveCount(0);
  });

  test('live tile carries an entitlement gate marker; cohort-gated tiles carry the coming-soon marker (wiring proof)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');
    await expect(
      page.getByTestId('sep-tile-seller-presentation'),
    ).toBeVisible({ timeout: 10_000 });

    // v1.47 cohort gating (COHORT_LIVE_SKILLS): only seller-presentation
    // is live. The live tile still flows through the entitlement resolver
    // (Link + data-gate). Every other Win/Launch tile is dimmed + rendered
    // as a non-interactive "Coming soon" <div> (data-coming-soon, no
    // data-gate, no href). The flagship is a Link (not a registry-bound
    // Tile) so it carries neither marker.
    const live = page.getByTestId('sep-tile-seller-presentation');
    const gate = await live.getAttribute('data-gate');
    expect(gate === 'available' || gate === 'locked').toBe(true);
    await expect(live).not.toHaveAttribute('data-coming-soon', 'true');

    // 4 Win + 2 Launch = 6 stage tiles; the 5 non-live ones are coming-soon.
    const all = page.locator('[data-testid^="sep-tile-"]');
    expect(await all.count()).toBeGreaterThanOrEqual(6);

    const soon = page.locator('[data-testid^="sep-tile-"][data-coming-soon="true"]');
    expect(await soon.count()).toBe(5);
    const soonCount = await soon.count();
    for (let i = 0; i < soonCount; i++) {
      // Non-interactive: no href (it's a <div>, not a Link) + aria-disabled.
      await expect(soon.nth(i)).not.toHaveAttribute('href');
      await expect(soon.nth(i)).toHaveAttribute('aria-disabled', 'true');
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

  test('?testTier=pro renders the same tile set as default — cohort gate is independent of tier', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard?testTier=pro');
    await expect(page.getByTestId('sep-studio-root')).toBeVisible({
      timeout: 10_000,
    });

    // The live tile is clickable + entitlement-resolved regardless of tier.
    const live = page.getByTestId('sep-tile-seller-presentation');
    await expect(live).toBeVisible();
    await expect(live).toHaveAttribute('data-gate', 'available');
    await expect(live).toHaveAttribute('href', '/seller-presentation');

    // The cohort "Coming soon" gate is presentational and tier-independent
    // — even a pro tier sees the non-live tools as Coming soon during the
    // cohort window (it's COHORT_LIVE_SKILLS, not the entitlement resolver).
    for (const skillId of [
      'seller-intelligence-report',
      'listing-presentation',
      'open-house-prep',
      'listing-flyer',
      'open-house-promo',
    ]) {
      const tile = page.getByTestId(`sep-tile-${skillId}`);
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute('data-coming-soon', 'true');
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

    // listing-presentation is cohort-gated to "Coming soon" (a non-
    // interactive <div>, no href) — but its title/blurb still bind to the
    // registry record, NOT a design-literal override. The binding contract
    // is what this test guards; routing is covered by the tool's own spec.
    const lp = page.getByTestId('sep-tile-listing-presentation');
    await expect(lp).toBeVisible();
    await expect(lp).toContainText('Listing Presentation One-Pager');
    await expect(lp).toHaveAttribute('data-coming-soon', 'true');
    await expect(lp).not.toHaveAttribute('href');
  });

  test('cohort gate: Seller Presentation is clickable; a non-live skill renders as a non-clickable "Coming soon" tile', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    // LIVE: Seller Presentation is a clickable Link to the wizard, with no
    // dim/badge/disabled treatment.
    const live = page.getByTestId('sep-tile-seller-presentation');
    await expect(live).toBeVisible({ timeout: 10_000 });
    await expect(live).toHaveAttribute('href', '/seller-presentation');
    await expect(live).not.toHaveAttribute('data-coming-soon', 'true');
    await expect(live).not.toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByTestId('sep-tile-soon-seller-presentation'),
    ).toHaveCount(0);

    // NON-LIVE (seller-intelligence-report): dimmed + "Coming soon" badge +
    // non-interactive. It still surfaces (discoverable roadmap) and keeps
    // its registry name, but it must not navigate and must not be a tab stop
    // (a plain <div>, no href, aria-disabled).
    const soon = page.getByTestId('sep-tile-seller-intelligence-report');
    await expect(soon).toBeVisible();
    await expect(soon).toHaveAttribute('data-coming-soon', 'true');
    await expect(soon).toHaveAttribute('aria-disabled', 'true');
    await expect(soon).not.toHaveAttribute('href');
    await expect(
      page.getByTestId('sep-tile-soon-seller-intelligence-report'),
    ).toHaveText('Coming soon');
    // Clicking the greyed tile does nothing — URL stays on /dashboard.
    await soon.click();
    await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);
  });

  test('Social Studio flagship is a marquee link that navigates to /social-animator', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');

    const flagship = page.getByTestId('sep-flagship-social');
    await expect(flagship).toBeVisible({ timeout: 10_000 });
    // Rendered as <a href="/social-animator"> — proves the click target
    // skips the (removed) modal and routes straight to the existing
    // template picker page.
    await expect(flagship).toHaveAttribute('href', '/social-animator');
    // f3529e6 marquee restored — static SVG mini-composites in a
    // .marquee-track flex row, NOT a strip of <canvas> previews.
    await expect(flagship.locator('.marquee-track')).toHaveCount(1);
    await expect(flagship.locator('canvas')).toHaveCount(0);

    // Click navigates to /social-animator (verifies the Link wiring
    // end-to-end — no JS modal opens, the URL changes).
    await flagship.click();
    await expect(page).toHaveURL(/\/social-animator(?:$|\?)/);
  });
});
