import { test, expect } from '@playwright/test';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * Dashboard — cohort-pinned hero (v1.47 cohort polish).
 *
 * With COHORT_HERO_PINNED_SKILL = "seller-presentation"
 * (src/lib/config/cohort-hero.ts) the dashboard hero "Up next" block is
 * pinned to a single Seller Presentation CTA and the smart activity-
 * based engine is suppressed for the cohort window. These specs nail
 * down the visible contract:
 *
 *   1. The pinned hero ALWAYS renders the exact "Build your seller
 *      presentation" title with a single CTA — no subtitle, no Skip
 *      link, no Then-queue chips, regardless of seeded agent activity.
 *   2. CTA copy toggles by draft presence: "Get started →" when no
 *      Seller Presentation draft exists, "Continue seller presentation
 *      →" when one is in progress. Both link to /seller-presentation
 *      (the wizard page resolves resume-vs-create-fresh internally —
 *      see src/app/seller-presentation/page.tsx).
 *
 * Toggle-back behavior (COHORT_HERO_PINNED_SKILL = null restoring the
 * activity-based hero) is intentionally not asserted here: the constant
 * is a hardcoded one-line config, and the existing
 * `dashboard-cohort-hero.spec.ts` suite documents the post-cohort
 * activity-engine contract (run those specs against the null value to
 * re-validate).
 */

test.describe('Dashboard — cohort-pinned hero', () => {
  test('with brand kit NOT configured, HeroEmptyState wins over the pinned hero', async ({
    page,
  }) => {
    // No seedBrandProfile — socanim_brand_settings is absent so the
    // brand-kit gate fires and "Open brand kit" must claim the hero,
    // even though COHORT_HERO_PINNED_SKILL is set to "seller-presentation".
    // The brand kit personalizes every downstream tool (Seller
    // Presentation included), so it has to be the first onboarding
    // action — pinned hero must defer.
    await page.goto('/dashboard');

    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toBeVisible({ timeout: 10_000 });
    await expect(primary).toContainText('Open brand kit');
    await expect(primary).toHaveAttribute('href', '/settings');

    // The pinned hero's title must NOT appear.
    await expect(page.getByTestId('sep-hero-title')).toHaveCount(0);
    await expect(page.locator('text=Build your seller presentation')).toHaveCount(0);

    // The empty-state hero testid IS present.
    await expect(page.getByTestId('sep-hero-empty')).toBeVisible();
  });

  test('renders the pinned single-CTA hero with no Skip and no queue chips', async ({
    page,
  }) => {
    // Seed BOTH a listing AND a brand profile — these would normally
    // drive the activity engine to a different recommendation. The
    // pinned hero must ignore that activity entirely.
    await seedBrandProfile(page);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'socanim_listing_profile',
        JSON.stringify({
          address: '1234 Test Drive NE',
          status: 'Just Listed',
          price: '$685,000',
        }),
      );
    });

    await page.goto('/dashboard');

    // Title is the pinned copy — not the activity-engine workflow name.
    await expect(page.getByTestId('sep-hero-title')).toHaveText(
      'Build your seller presentation',
      { timeout: 10_000 },
    );

    // Single CTA → /seller-presentation.
    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toHaveAttribute('href', '/seller-presentation');

    // No Skip · pick another tool link.
    await expect(page.getByTestId('sep-hero-secondary')).toHaveCount(0);

    // No Then-queue chips of any kind.
    await expect(page.locator('[data-testid^="sep-hero-chip-"]')).toHaveCount(
      0,
    );
  });

  test('CTA reads "Get started →" when no Seller Presentation draft exists', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    // Explicitly clear any SP instances so findLatestInProgress returns
    // null. Wiping the workflowInstance:index is sufficient — the
    // lister reads from there and silently drops dangling ids (see
    // src/skills/workflow-instance-storage.ts).
    await page.addInitScript(() => {
      window.localStorage.removeItem('workflowInstance:index');
    });

    await page.goto('/dashboard');

    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toContainText('Get started', { timeout: 10_000 });
    await expect(primary).not.toContainText(/continue/i);
  });

  test('CTA reads "Continue seller presentation →" when a draft is in progress', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    // Seed a minimal in-progress Seller Presentation instance directly
    // into the workflow-instance storage. Schema mirrors
    // src/skills/workflow-instance-storage.ts:
    //   workflowInstance:<id>     → WorkflowInstance JSON record
    //   workflowInstance:index    → string[] of instanceIds
    // resolvedPrimitives is required by isWorkflowInstanceShape;
    // completedAt is unset = "in progress".
    await page.addInitScript(() => {
      const instanceId = 'workflow_test_sp_in_progress';
      const now = new Date().toISOString();
      const record = {
        instanceId,
        skillId: 'seller-presentation',
        currentStep: 'property',
        draft: {},
        resolvedPrimitives: {},
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      };
      window.localStorage.setItem(
        `workflowInstance:${instanceId}`,
        JSON.stringify(record),
      );
      window.localStorage.setItem(
        'workflowInstance:index',
        JSON.stringify([instanceId]),
      );
    });

    await page.goto('/dashboard');

    const primary = page.getByTestId('sep-hero-primary');
    await expect(primary).toContainText('Continue seller presentation', {
      timeout: 10_000,
    });
    await expect(primary).toHaveAttribute('href', '/seller-presentation');
  });
});
