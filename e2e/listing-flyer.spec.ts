import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { pdfToPng } from 'pdf-to-png-converter';
import {
  bufferToScreenshotPng,
  seedBrandProfile,
  seedListingFlyerDraft,
  uploadTestPhoto,
} from './fixtures/seed-helpers';

/**
 * Listing Flyer — full export coverage.
 *
 * PDF + JPEG carry visual snapshot assertions (catches the bullet-class
 * regression mechanically). MP4 reel + MP4 square are file-level only —
 * size + extension; visual diff on 5-second videos is overkill and frame-
 * timing variance would make snapshots flaky.
 *
 * The MP4 tests are tagged @slow so the iterative loop can skip them
 * (`npx playwright test --grep-invert "@slow"`). Per H-7.14 measurements
 * (docs/H-7.14-render-perf-audit.md §4), Listing Flyer MP4 Reel cold is
 * ~90s on Mac Chrome; 180s budget gives generous headroom for cold runs.
 */

test.describe('Listing Flyer — exports', () => {
  test.beforeEach(async ({ page }) => {
    await seedBrandProfile(page);
    await seedListingFlyerDraft(page);
  });

  test('exports a valid PDF with matching visual snapshot', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/listing-flyer');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

    const exportButton = page.getByRole('button', { name: /export pdf/i });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    expect(stats.size).toBeGreaterThan(10_000);
    expect(stats.size).toBeLessThan(5_000_000);

    // Magic-bytes sniff
    const fd = await fs.open(filePath!, 'r');
    try {
      const header = Buffer.alloc(5);
      await fd.read(header, 0, 5, 0);
      expect(header.toString('ascii')).toBe('%PDF-');
    } finally {
      await fd.close();
    }

    // Visual diff against the stored snapshot
    const pngPages = await pdfToPng(filePath!, {
      viewportScale: 2.0,
      pagesToProcess: [1],
    });
    expect(pngPages.length).toBe(1);
    expect(pngPages[0].content).toMatchSnapshot(
      'listing-flyer-pdf-page-1.png',
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

    await page.goto('/listing-flyer');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

    // Button text from ExportButtons.tsx: "Export JPEG (Camera Roll)".
    // Anchor on "Export JPEG" so the regex isn't tied to the parenthetical.
    const exportButton = page.getByRole('button', {
      name: /export jpeg/i,
    });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await exportButton.click();
    const download = await downloadPromise;

    // jpeg-export.ts builds the JPEG via pdfjs rasterization at 3x scale +
    // q=0.92 — typical output is ~1-2 MB. 10 MB ceiling catches runaway
    // size, 10 KB floor catches empty/error blobs.
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    expect(stats.size).toBeGreaterThan(10_000);
    expect(stats.size).toBeLessThan(10_000_000);
    expect(download.suggestedFilename()).toMatch(/\.jpe?g$/i);

    // Magic-bytes sniff — JPEG SOI is FF D8 FF
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

    // Visual snapshot on the JPEG. bufferToScreenshotPng renders the JPEG
    // through Chromium and returns a PNG buffer; raw JPEG bytes can't be
    // passed to toMatchSnapshot directly (the image diff decodes both
    // sides as PNG and JPEG bytes fail the decode on the second run).
    const jpegBuffer = await fs.readFile(filePath!);
    const png = await bufferToScreenshotPng(page, jpegBuffer, 'image/jpeg');
    expect(png).toMatchSnapshot('listing-flyer-jpeg.png', {
      threshold: 0.2,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('exports a valid MP4 reel (9:16 vertical) @slow', async ({ page }) => {
    test.setTimeout(270_000); // 4.5 min — H-7.14 measured ~90s warm,
    // but cold Playwright-spawned dev-server runs add ffmpeg-load +
    // first-compile overhead. Saw 179s mid-export in the W-2.4 run.

    await page.goto('/listing-flyer');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

    // The seeded draft has exportFormats: { reel: true, square: false }, so
    // the Reel checkbox should already be checked and the export button
    // should read "Export Reel (MP4)" per renderButtonLabel in
    // ExportButtons.tsx.
    const reelCheckbox = page.getByRole('checkbox', { name: /reel \(9:16\)/i });
    await expect(reelCheckbox).toBeChecked();

    const exportButton = page.getByRole('button', { name: /export reel/i });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 240_000 });
    await exportButton.click();
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    // MP4 size sanity: 50 KB floor catches empty/error blobs; 50 MB ceiling
    // catches runaway encodes. Typical 8s Listing Flyer MP4 Reel is 2-6 MB.
    expect(stats.size).toBeGreaterThan(50_000);
    expect(stats.size).toBeLessThan(50_000_000);
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
  });

  test('exports a valid MP4 square (1:1) @slow', async ({ page }) => {
    test.setTimeout(270_000); // Same headroom as the reel test.

    await page.goto('/listing-flyer');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

    // Toggle: check square first (so we never sit in a both-false state
    // that would briefly disable the export button via hasAnyFormat), then
    // uncheck reel. After this the button label is "Export Square (MP4)".
    const reelCheckbox = page.getByRole('checkbox', { name: /reel \(9:16\)/i });
    const squareCheckbox = page.getByRole('checkbox', {
      name: /square \(1:1\)/i,
    });
    await squareCheckbox.check();
    if (await reelCheckbox.isChecked()) await reelCheckbox.uncheck();

    const exportButton = page.getByRole('button', { name: /export square/i });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 240_000 });
    await exportButton.click();
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    expect(stats.size).toBeGreaterThan(50_000);
    expect(stats.size).toBeLessThan(50_000_000);
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
  });
});
