import { test } from '@playwright/test';
import path from 'node:path';
import {
  seedBrandProfile,
  seedListingProfile,
} from './fixtures/seed-helpers';

/**
 * A7f.1 — Dashboard before/after screenshot capture (one-off).
 *
 * Generates a full-page PNG of /dashboard under two states:
 *   - "default": brand profile only (most agents' first-visit view)
 *   - "active": brand + listing + SIR draft + an in-flight Seller
 *     Presentation WorkflowInstance, so the Seller Win card surfaces
 *     with the Resume label.
 *
 * Output: docs/audits/v1.47/A7f.1/dashboard-{label}.png
 *
 * The brief requires before/after dashboard screenshots in the handoff.
 * Run this twice: once on the applied changes (after.png) and once
 * after git stash (before.png).
 */

const LABEL = process.env.A7F1_LABEL ?? 'after';
const OUT_DIR = path.resolve(__dirname, '..', 'docs/audits/v1.47/A7f.1');

// Gate so the suite isn't polluted with screenshot work every run. Set
// A7F1_CAPTURE=1 to run; otherwise the whole describe block is skipped.
test.skip(
  !process.env.A7F1_CAPTURE,
  'A7F1_CAPTURE not set — screenshot capture is opt-in.',
);

test.describe('Dashboard screenshot capture (A7f.1)', () => {
  test('default state (brand profile only)', async ({ page }) => {
    await seedBrandProfile(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(OUT_DIR, `dashboard-default-${LABEL}.png`),
      fullPage: true,
    });
  });

  test('modal-open state (Social Studio modal showing all 10 social-animator cards)', async ({
    page,
  }) => {
    // v1.47 Lane A restore: confirms Stage 3 is a single flagship that
    // opens into a modal listing 10 templates as canvas-thumbnail
    // cards. Captured separately from default/active so the
    // before/after handoff can show the modal contents.
    await seedBrandProfile(page);
    await page.goto('/dashboard');
    await page.getByTestId('sep-flagship-social').click();
    await page.getByTestId('sep-studio-modal').waitFor();
    // Give each TemplatePreview's RAF loop a moment to paint its first
    // frame before the snapshot — the canvas's first non-skeleton draw
    // races networkidle since assets load async inside the effect.
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(OUT_DIR, `dashboard-modal-${LABEL}.png`),
      fullPage: true,
    });
  });

  test('active state (brand + listing + SIR + in-flight Seller Presentation)', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await seedListingProfile(page, {
      address: '1234 Test Drive NE',
      cityState: 'Olympia, WA 98516',
      status: 'Just Listed',
      price: '$685,000',
    });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'sellerIntelligenceReport:draft',
        JSON.stringify({
          propertyAddress: '1234 Test Drive NE',
          recommendedListPrice: '$685,000',
          comps: [],
          selectedObjectionIds: [],
          commitments: [],
          asks: [],
        }),
      );
      const now = new Date().toISOString();
      const id = 'wf_a7f1_screenshot_seller_presentation';
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
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(OUT_DIR, `dashboard-active-${LABEL}.png`),
      fullPage: true,
    });
  });
});
