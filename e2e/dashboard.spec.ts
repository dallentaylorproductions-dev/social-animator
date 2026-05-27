import { test, expect } from '@playwright/test';
import { seedBrandProfile, seedListingProfile } from './fixtures/seed-helpers';

/**
 * Dashboard — state-aware navigation (v1.47 Lane A re-brand).
 *
 * Asserts on the SEP-S Studio shell: warm-dark warm-dark bento with
 * topbar + welcome + hero "Up next" card + three named stage sections.
 * Pixel snapshots stay deliberately absent — the dashboard rebrand
 * shipped a token system that A7f.3 will continue to tune; structural
 * + testid + copy assertions are the durable contract.
 *
 * Migrated from W-1 Half B impl 2's "Next best action" + "All skills"
 * shape. Test intent is preserved: empty-state CTA, workflow-driven
 * hero, skill discoverability under the right stage.
 */

test.describe('Dashboard — state-aware navigation', () => {
  test('renders empty-state hero when brand profile is not configured', async ({
    page,
  }) => {
    // No seedBrandProfile — agentName empty so hasBrandProfileConfigured() is false.
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    // SEP-S shell renders the topbar regardless of brand state.
    await expect(page.getByTestId('sep-topbar')).toBeVisible({ timeout: 10_000 });

    // Empty-state hero: calm "Ready when you are." headline + brand-kit CTA.
    const hero = page.getByTestId('sep-hero-empty');
    await expect(hero).toBeVisible({ timeout: 10_000 });
    await expect(hero).toContainText(/ready when you are/i);
    await expect(
      page.getByTestId('sep-hero-primary'),
    ).toHaveAttribute('href', '/settings');
  });

  test('renders Listing Launch hero when a listing profile is populated', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await seedListingProfile(page, {
      address: '1234 Test Drive NE',
      status: 'Just Listed',
      price: '$685,000',
    });

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    // Hero card surfaces the listing-launch workflow as a heading.
    await expect(
      page.getByRole('heading', { name: /launch your listing/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Primary CTA → Listing Flyer Generator. The new shell renders the
    // skill name + an arrow span; matching the substring "Listing Flyer
    // Generator" on the link is the portable contract (the arrow span
    // contributes "→" to the accessible name).
    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toContainText('Listing Flyer Generator');
    await expect(primary).toHaveAttribute('href', '/listing-flyer');
  });
});

/**
 * A7f.1 retained — Seller Presentation dashboard discovery (now in
 * the new shell). Same trigger states, new tile / hero assertions.
 */
test.describe('Dashboard — Seller Presentation discovery (A7f.1)', () => {
  test('Hero surfaces Seller Win System with Seller Presentation primary when SIR draft exists', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'sellerIntelligenceReport:draft',
        JSON.stringify({
          propertyAddress: '1234 Test Drive NE',
          recommendedListPrice: '',
          comps: [],
          selectedObjectionIds: [],
          commitments: [],
          asks: [],
        }),
      );
    });

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    await expect(
      page.getByRole('heading', { name: /seller win system/i }),
    ).toBeVisible({ timeout: 10_000 });
    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toContainText('Seller Presentation');
    await expect(primary).toHaveAttribute('href', '/seller-presentation');
    // No resume affordance — no in-flight WorkflowInstance.
    await expect(primary).not.toContainText(/resume your draft/i);
  });

  test('Hero stays on Listing Launch when no seller state is active', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await seedListingProfile(page, {
      address: '1234 Test Drive NE',
      status: 'Just Listed',
      price: '$685,000',
    });

    await page.goto('/dashboard');

    // Listing Launch wins priority order, surfaces in hero.
    await expect(
      page.getByRole('heading', { name: /launch your listing/i }),
    ).toBeVisible({ timeout: 10_000 });
    // Seller Win System must NOT surface in the hero — its triggers
    // (seller_appointment_state etc.) aren't active here.
    await expect(
      page.getByRole('heading', { name: /seller win system/i }),
    ).toHaveCount(0);
  });

  test('Seller Presentation tile lives in the Win stage and links to the wizard', async ({
    page,
  }) => {
    await seedBrandProfile(page);

    await page.goto('/dashboard');

    // Win stage is the first named section.
    await expect(page.getByTestId('sep-stage-win')).toBeVisible({
      timeout: 10_000,
    });
    // The seller-presentation tile gets a stable testid from the Tile
    // component (sep-tile-<skillId>) — the design's titleOverride
    // ("Listing Presentation") is a cosmetic label only; the href is
    // the load-bearing contract.
    const tile = page.getByTestId('sep-tile-seller-presentation');
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute('href', '/seller-presentation');
  });

  test('Resume your draft affordance surfaces when a Seller Presentation WorkflowInstance exists', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      const id = 'wf_test_seller_presentation_rebrand';
      window.localStorage.setItem(
        `workflowInstance:${id}`,
        JSON.stringify({
          instanceId: id,
          skillId: 'seller-presentation',
          draft: { propertyAddress: '1234 Test Drive NE' },
          resolvedPrimitives: {},
          timestamps: { createdAt: now, updatedAt: now },
        }),
      );
      window.localStorage.setItem(
        'workflowInstance:index',
        JSON.stringify([id]),
      );
    });

    await page.goto('/dashboard');

    // In-flight instance triggers seller_appointment_state → Seller Win
    // hero with the resume label baked into the primary CTA.
    await expect(
      page.getByRole('heading', { name: /seller win system/i }),
    ).toBeVisible({ timeout: 10_000 });
    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toContainText(/resume your draft/i);
    await expect(primary).toHaveAttribute('href', '/seller-presentation');
  });
});
