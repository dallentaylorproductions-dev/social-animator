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
