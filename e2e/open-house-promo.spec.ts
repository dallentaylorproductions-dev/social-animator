import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { pdfToPng } from 'pdf-to-png-converter';
import {
  bufferToScreenshotPng,
  mp4Duration,
  mp4FirstFramePng,
  seedBrandProfile,
  seedOpenHousePromoDraft,
  uploadTestPhoto,
} from './fixtures/seed-helpers';

/**
 * Open House Promo — full export coverage.
 *
 * PDF + JPEG + QR PNG carry visual snapshots. MP4 reel/square are
 * file-level only (same rationale as Listing Flyer: video diff is overkill
 * for 5-10s outputs).
 *
 * validateForExport (src/tools/open-house-promo/engine/types.ts:320)
 * requires eventDate, eventStartTime, propertyAddress — all seeded by
 * seedOpenHousePromoDraft. QR PNG additionally requires qrTargetUrl
 * (also seeded).
 *
 * Note: /open-house-promo is NOT in src/middleware.ts's matcher, so the
 * E2E_TESTING bypass isn't load-bearing here. The seedBrandProfile call
 * still seeds the agent block fields used in the rendered output.
 */

test.describe('Open House Promo — exports', () => {
  test.beforeEach(async ({ page }) => {
    await seedBrandProfile(page);
    await seedOpenHousePromoDraft(page);
  });

  test('exports a valid PDF with matching visual snapshot', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/open-house-promo');
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
      'oh-promo-pdf-page-1.png',
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

    await page.goto('/open-house-promo');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

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
    expect(png).toMatchSnapshot('oh-promo-jpeg.png', {
      threshold: 0.2,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('exports a valid QR PNG with matching visual snapshot', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto('/open-house-promo');
    await expect(page).not.toHaveURL(/\/login/i);

    // QR export doesn't require a photo — qrTargetUrl is seeded by
    // seedOpenHousePromoDraft. Button text: "Export QR Code (PNG)"
    // per ExportButtons.tsx.
    const exportButton = page.getByRole('button', { name: /export qr/i });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await exportButton.click();
    const download = await downloadPromise;

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    // QR PNGs are small but not tiny — 800px image with ~1KB data URL.
    expect(stats.size).toBeGreaterThan(500);
    expect(stats.size).toBeLessThan(500_000);
    expect(download.suggestedFilename()).toMatch(/\.png$/i);

    // PNG magic bytes: 89 50 4E 47
    const fd = await fs.open(filePath!, 'r');
    try {
      const header = Buffer.alloc(4);
      await fd.read(header, 0, 4, 0);
      expect(header[0]).toBe(0x89);
      expect(header[1]).toBe(0x50);
      expect(header[2]).toBe(0x4e);
      expect(header[3]).toBe(0x47);
    } finally {
      await fd.close();
    }

    // QR codes are high-contrast (pure black/white modules) so we can
    // tighten the tolerances vs the photo-bearing snapshots — anti-
    // aliasing matters less and any real change shows up immediately.
    const pngBuffer = await fs.readFile(filePath!);
    const screenshotPng = await bufferToScreenshotPng(
      page,
      pngBuffer,
      'image/png'
    );
    expect(screenshotPng).toMatchSnapshot('oh-promo-qr.png', {
      threshold: 0.1,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('exports a valid MP4 reel (9:16 vertical) @slow', async ({ page }) => {
    test.setTimeout(270_000);

    await page.goto('/open-house-promo');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

    const reelCheckbox = page.getByRole('checkbox', { name: /reel \(9:16\)/i });
    await expect(reelCheckbox).toBeChecked();

    const exportButton = page.getByRole('button', { name: /render reel|export reel/i });
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

    // W-3.2: duration assertion. seedOpenHousePromoDraft sets
    // mp4DurationSeconds=6 (PROMO_DEFAULT_DURATION_SEC;
    // src/tools/open-house-promo/engine/types.ts). webmToMp4 trims to
    // exactly `-t durationSec`. ±0.5s tolerance is generous.
    const mp4Buffer = await fs.readFile(filePath!);
    const duration = await mp4Duration(page, mp4Buffer);
    expect(duration).toBeGreaterThanOrEqual(5.5);
    expect(duration).toBeLessThanOrEqual(6.5);

    // W-3.2: first-frame visual snapshot.
    const firstFramePng = await mp4FirstFramePng(page, mp4Buffer);
    expect(firstFramePng).toMatchSnapshot(
      'oh-promo-mp4-reel-first-frame.png',
      {
        threshold: 0.2,
        maxDiffPixelRatio: 0.05,
      }
    );
  });

  test('exports a valid MP4 square (1:1) @slow', async ({ page }) => {
    test.setTimeout(270_000);

    await page.goto('/open-house-promo');
    await expect(page).not.toHaveURL(/\/login/i);

    await uploadTestPhoto(page);

    // Square-first toggle to avoid both-false transient that disables the
    // export button via hasAnyFormat (same pattern as Listing Flyer MP4
    // square test).
    const reelCheckbox = page.getByRole('checkbox', { name: /reel \(9:16\)/i });
    const squareCheckbox = page.getByRole('checkbox', {
      name: /square \(1:1\)/i,
    });
    await squareCheckbox.check();
    if (await reelCheckbox.isChecked()) await reelCheckbox.uncheck();

    const exportButton = page.getByRole('button', {
      name: /render square|export square/i,
    });
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

    // W-3.2: duration assertion (same 6s expected as the reel test).
    const mp4Buffer = await fs.readFile(filePath!);
    const duration = await mp4Duration(page, mp4Buffer);
    expect(duration).toBeGreaterThanOrEqual(5.5);
    expect(duration).toBeLessThanOrEqual(6.5);

    // W-3.2: first-frame visual snapshot.
    const firstFramePng = await mp4FirstFramePng(page, mp4Buffer);
    expect(firstFramePng).toMatchSnapshot(
      'oh-promo-mp4-square-first-frame.png',
      {
        threshold: 0.2,
        maxDiffPixelRatio: 0.05,
      }
    );
  });
});
