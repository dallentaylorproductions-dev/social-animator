import { test, expect } from '@playwright/test';
import { seedBrandProfile, seedListingProfile } from './fixtures/seed-helpers';

/**
 * Dashboard — state-aware navigation (W-1 Half B impl 2).
 *
 * File-level tests only — no visual snapshots. The dashboard's content will
 * evolve through Phases 2-4 (behavior tracking, calendar awareness, AI
 * orchestration); pixel snapshots would be fragile and high-maintenance.
 * Asserts on copy + DOM structure that the impl-2 contract guarantees.
 */

test.describe('Dashboard — state-aware navigation', () => {
  test('renders empty-state CTA when brand profile is not configured', async ({
    page,
  }) => {
    // No seedBrandProfile — agentName is empty so hasBrandProfileConfigured() is false.
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/i);

    // Empty-state CTA copy from DashboardClient.EmptyState
    await expect(
      page.getByText(/set up your brand profile to unlock skills/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('link', { name: /set up brand profile/i })
    ).toBeVisible();
  });

  test('renders Listing Launch card when listing profile is populated', async ({
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

    // Listing Launch workflow card surfaces because listing_launch_state matches.
    await expect(page.getByText(/launch your listing/i)).toBeVisible({
      timeout: 10_000,
    });
    // CTA links to the Listing Flyer tool route. Exact-string match on the
    // arrow-suffixed text isolates the card's primary CTA from the
    // SkillTile in the AllSkillsSection (which links to the same route but
    // has a longer accessible name including its output-format badge).
    await expect(
      page.getByRole('link', { name: 'Listing Flyer Generator →' })
    ).toHaveAttribute('href', '/listing-flyer');
  });
});

/**
 * A7f.1 — Seller Presentation dashboard discovery/launch (v1.47 / Lane A).
 *
 * Purely additive: the tile lands automatically under "Seller pitch" via
 * the Commit 3 derive-from-skill-record refactor (no hardcoded filter
 * change needed). These tests lock in:
 *   - Seller Win card retargets to Seller Presentation when in seller-
 *     appointment-prep state (state-detection triggers unchanged).
 *   - Card stays silent on a no-seller state (listing-launch only).
 *   - Direct launch via the All-skills tile under Seller pitch.
 *   - Resume-your-draft affordance when a converged WorkflowInstance
 *     exists for seller-presentation.
 *
 * Gating (A7f.2) and themes (A7f.3) are intentionally NOT exercised here.
 */
test.describe('Dashboard — Seller Presentation discovery (A7f.1)', () => {
  test('Seller Win card surfaces with Seller Presentation primary when SIR draft exists', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    // SIR draft with a propertyAddress fires seller_appointment_state via
    // state-detection.ts — same path the SIR build's card relied on; the
    // retarget swaps the primary to seller-presentation while keeping the
    // trigger unchanged.
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
    // Primary CTA — exact arrow-suffixed label isolates it from the
    // Seller pitch tile (which renders the bare skill name).
    await expect(
      page.getByRole('link', { name: 'Seller Presentation →' }).first(),
    ).toHaveAttribute('href', '/seller-presentation');
    // No resume affordance — there is no in-flight converged instance.
    await expect(
      page.getByRole('link', { name: /resume your draft/i }),
    ).toHaveCount(0);
  });

  test('Seller Win card stays silent when no seller state is active', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    // listing-launch state only — no SIR / LP / Seller Presentation draft.
    await seedListingProfile(page, {
      address: '1234 Test Drive NE',
      status: 'Just Listed',
      price: '$685,000',
    });

    await page.goto('/dashboard');

    // Listing Launch card visible (sanity — confirms the dashboard is
    // rendering its Next Best Action surface for THIS state).
    await expect(page.getByText(/launch your listing/i)).toBeVisible({
      timeout: 10_000,
    });
    // Seller Win System card must NOT surface — none of its trigger
    // states (pre_listing_state, seller_appointment_state,
    // seller_conversion_state) is active.
    await expect(
      page.getByRole('heading', { name: /seller win system/i }),
    ).toHaveCount(0);
  });

  test('Seller Presentation tile under "Seller pitch" launches the wizard', async ({
    page,
  }) => {
    await seedBrandProfile(page);

    await page.goto('/dashboard');

    // "Seller pitch" group heading from AllSkillsSection's SkillGroup.
    await expect(
      page.getByRole('heading', { name: /^seller pitch$/i }),
    ).toBeVisible({ timeout: 10_000 });
    // Tile is a Link whose accessible name starts with the skill name +
    // includes the format badge ("Seller Presentation HTML" etc.).
    // Asserting href is the portable contract.
    const tile = page
      .getByRole('link', { name: /^Seller Presentation/ })
      .first();
    await expect(tile).toHaveAttribute('href', '/seller-presentation');
  });

  test('Resume your draft affordance appears when a Seller Presentation WorkflowInstance exists', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    // Seed a converged WorkflowInstance in the workflowInstance:* namespace.
    // Minimal shape matches src/skills/workflow-instance-storage.ts's
    // isWorkflowInstanceShape guard (instanceId + skillId + timestamps +
    // resolvedPrimitives). No completedAt = "in-progress" = resumable.
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      const id = 'wf_test_seller_presentation_a7f1';
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

    // The in-flight instance triggers seller_appointment_state, which
    // surfaces the Seller Win card with the resume label.
    await expect(
      page.getByRole('heading', { name: /seller win system/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('link', { name: 'Resume your draft →' }),
    ).toHaveAttribute('href', '/seller-presentation');
  });
});
