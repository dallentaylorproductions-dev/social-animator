import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { pdfToPng } from 'pdf-to-png-converter';
import {
  bufferToScreenshotPng,
  seedBrandProfile,
  seedListingPresentationDraft,
} from './fixtures/seed-helpers';

/**
 * Listing Presentation — PDF + JPEG export coverage.
 *
 * No MP4 path on this tool. The single agent headshot is stored as a data
 * URL inside the draft itself (no separate file-upload step) — seeded as
 * null in the helper, which renders a deterministic placeholder rather
 * than risking a stale/corrupt data URL crashing react-pdf.
 *
 * validateForExport (src/tools/listing-presentation/engine/types.ts:179)
 * requires propertyAddress only — seeded by seedListingPresentationDraft.
 *
 * /listing-presentation is NOT in src/middleware.ts's matcher so the
 * E2E_TESTING bypass isn't load-bearing here; seedBrandProfile still
 * supplies the agent block fields rendered into the output.
 */

test.describe('Listing Presentation — exports', () => {
  test.beforeEach(async ({ page }) => {
    await seedBrandProfile(page);
    await seedListingPresentationDraft(page);
  });

  test('exports a valid PDF with matching visual snapshot', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/listing-presentation');
    await expect(page).not.toHaveURL(/\/login/i);

    const exportButton = page.getByRole('button', { name: /export pdf/i });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    // LP PDF is much smaller than Listing Flyer / OH Promo PDFs because
    // the seeded draft has no headshot data URL (agentHeadshot: null
    // renders a placeholder, no embedded image bytes). Observed ~6 KB
    // in the W-2.5 baseline run. 3 KB floor still catches genuinely
    // broken outputs (empty PDFs are typically <500 bytes).
    expect(stats.size).toBeGreaterThan(3_000);
    expect(stats.size).toBeLessThan(5_000_000);

    const fd = await fs.open(filePath!, 'r');
    try {
      const header = Buffer.alloc(5);
      await fd.read(header, 0, 5, 0);
      expect(header.toString('ascii')).toBe('%PDF-');
    } finally {
      await fd.close();
    }

    const pngPages = await pdfToPng(filePath!, {
      viewportScale: 2.0,
      pagesToProcess: [1],
    });
    expect(pngPages.length).toBe(1);
    expect(pngPages[0].content).toMatchSnapshot(
      'listing-presentation-pdf-page-1.png',
      {
        threshold: 0.2,
        maxDiffPixelRatio: 0.05,
      }
    );
  });

  test('exports a valid JPEG with matching visual snapshot', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/listing-presentation');
    await expect(page).not.toHaveURL(/\/login/i);

    const exportButton = page.getByRole('button', { name: /export jpeg/i });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await exportButton.click();
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    expect(stats.size).toBeGreaterThan(10_000);
    expect(stats.size).toBeLessThan(10_000_000);
    expect(download.suggestedFilename()).toMatch(/\.jpe?g$/i);

    const fd = await fs.open(filePath!, 'r');
    try {
      const header = Buffer.alloc(3);
      await fd.read(header, 0, 3, 0);
      expect(header[0]).toBe(0xff);
      expect(header[1]).toBe(0xd8);
      expect(header[2]).toBe(0xff);
    } finally {
      await fd.close();
    }

    const jpegBuffer = await fs.readFile(filePath!);
    const png = await bufferToScreenshotPng(page, jpegBuffer, 'image/jpeg');
    expect(png).toMatchSnapshot('listing-presentation-jpeg.png', {
      threshold: 0.2,
      maxDiffPixelRatio: 0.05,
    });
  });
});
