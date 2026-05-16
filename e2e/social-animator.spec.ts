import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import {
  seedBrandProfile,
  seedListingProfile,
  testPhotoDataUri,
} from './fixtures/seed-helpers';

/**
 * Social Animator — MP4 export coverage on two representative templates.
 *
 * Both file-level only (size + extension + filename). Visual snapshot on a
 * 5-10 second video is overkill and frame-timing variance would make it
 * flaky; if Social-Animator-specific visual regressions surface later, a
 * follow-up can rasterize a known frame.
 *
 * Template state is NOT localStorage-persisted in Social Animator — only
 * the per-template colors are (socanim_colors_<id>). Everything else
 * (text, photos, objectList items) initializes from FieldDef.default and
 * lives in React state. We therefore exercise the two templates without
 * driving the editor's form UI; the defaults are good test data.
 *
 *   - listing-carousel: empty objectList → placeholder track for the
 *     template's full duration (10s). Exports a valid MP4 with the
 *     "Add photos to start the carousel →" message rendered on a black
 *     background. Still exercises the MediaRecorder + WebM→MP4 pipeline.
 *   - listing-showcase: in LISTING_CONSUMER_TEMPLATE_IDS, so the editor's
 *     first-hydration merge picks up socanim_listing_profile. We seed
 *     heroPhoto + address + price/etc. so the render is meaningful, then
 *     export.
 *
 * Both tests tagged @slow per the W-2 convention (skipped in
 * --grep-invert "@slow" fast loop).
 *
 * /social-animator/* IS in src/middleware.ts's matcher, so the
 * E2E_TESTING bypass is load-bearing here.
 */

test.describe('Social Animator — exports', () => {
  test.beforeEach(async ({ page }) => {
    await seedBrandProfile(page);
  });

  test('listing-carousel — exports a valid MP4 @slow', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/social-animator/listing-carousel');
    await expect(page).not.toHaveURL(/\/login/i);

    // ExportButton uses the literal text "Export MP4" (src/components/
    // ExportButton.tsx). Enabled unless mid-export — no validation gate
    // like the Listing Flyer / OH Promo tools, so button-enabled is the
    // editor-mounted signal. Generous timeout for Next.js first-compile
    // of the template route.
    const exportButton = page.getByRole('button', { name: /^Export MP4$/i });
    await expect(exportButton).toBeEnabled({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await exportButton.click();
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    // Placeholder-only carousel (no photos seeded) produces a smaller MP4
    // than a photo-bearing one — 20 KB floor catches truly broken outputs
    // while accommodating the static-text placeholder case. 50 MB ceiling
    // matches the other tools' MP4 tests.
    expect(stats.size).toBeGreaterThan(20_000);
    expect(stats.size).toBeLessThan(50_000_000);
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
  });

  test('listing-showcase — exports a valid MP4 @slow', async ({ page }) => {
    test.setTimeout(180_000);

    // Seed the cross-template listing profile so the editor's first-
    // hydration merge fills heroPhoto + listing fields. listing-showcase
    // is in LISTING_CONSUMER_TEMPLATE_IDS (src/components/TemplateEditor.tsx).
    await seedListingProfile(page, {
      heroPhoto: testPhotoDataUri('perf-01.jpg'),
      status: 'Just Listed',
      address: '1234 Test Drive NE',
      cityState: 'Olympia, WA 98516',
      price: '$685,000',
      beds: '4',
      baths: '2.5',
      sqft: '2,840',
    });

    await page.goto('/social-animator/listing-showcase');
    await expect(page).not.toHaveURL(/\/login/i);

    // Editor-mounted signal. The listing-profile merge happens in a
    // useEffect chained off useListingProfile.hydrated; the heroPhoto
    // materializes via Image.onload after that. By the time we get the
    // download promise wired + click Export + recordCanvas's 2-RAF
    // warmup runs, the effect chain has settled and the canvas paints
    // the seeded photo. Even if part of the chain finishes mid-record,
    // MediaRecorder picks up subsequent frames.
    const exportButton = page.getByRole('button', { name: /^Export MP4$/i });
    await expect(exportButton).toBeEnabled({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await exportButton.click();
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    // listing-showcase with a real heroPhoto is closer in size to the
    // other tools' MP4 outputs — 50 KB floor is the standard.
    expect(stats.size).toBeGreaterThan(50_000);
    expect(stats.size).toBeLessThan(50_000_000);
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
  });
});
