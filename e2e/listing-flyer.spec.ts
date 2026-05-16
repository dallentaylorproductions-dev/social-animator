import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pdfToPng } from 'pdf-to-png-converter';

/**
 * W-2.2 — Listing Flyer PDF export end-to-end test.
 *
 * Seeds brand + flyer draft in localStorage before navigation so the test is
 * isolated to the PDF export pipeline (not form-filling UX). Uploads one
 * photo from public/perf-test/, clicks Export PDF, captures the download,
 * and asserts the file is a sensibly-sized PDF starting with %PDF-.
 *
 * Auth gate: `/listing-flyer` is gated by src/middleware.ts. The test relies
 * on the E2E_TESTING=1 bypass (set by playwright.config.ts) — see the dual-
 * condition guard in middleware.ts for why this can't leak to production.
 *
 * Storage key references:
 *   - socanim_brand_settings ← src/lib/brand.ts:25
 *   - listingFlyer:draft     ← src/tools/listing-flyer/engine/draft-storage.ts:8
 *
 * Required-for-export fields (src/tools/listing-flyer/engine/types.ts:123):
 *   addressLine1, price, ≥1 photo.
 */

const TEST_PHOTO_PATH = path.resolve(__dirname, '../public/perf-test/perf-01.jpg');

test.describe('Listing Flyer — PDF export', () => {
  test.beforeEach(async ({ page }) => {
    // addInitScript runs in the page context before any page script — the
    // seed is in place by the time the React app reads localStorage on mount.
    // contactPhone stored as raw 10 digits per H-7.10 normalization in
    // src/lib/brand.ts:extractPhoneDigits; the form's PhoneInput formats it
    // to "(xxx) xxx-xxxx" at display time.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'socanim_brand_settings',
        JSON.stringify({
          logoDataUrl: null,
          agentName: 'Test Agent',
          primaryColor: '#4ef2d9',
          accentColor: '#121f40',
          backgroundColor: '',
          contactEmail: 'test@example.com',
          contactPhone: '2065550100',
          licenseNumber: 'TEST-12345',
          brokerage: 'Test Realty',
        })
      );
      window.localStorage.setItem(
        'listingFlyer:draft',
        JSON.stringify({
          status: 'Just Listed',
          addressLine1: '1234 Test Drive NE',
          addressLine2: 'Olympia, WA 98516',
          price: '$685,000',
          beds: '4',
          baths: '2.5',
          sqft: '2,840',
          features: [
            'Test feature 1',
            'Test feature 2',
            'Test feature 3',
            'Test feature 4',
          ],
          primaryColor: '',
          accentColor: '',
          backgroundColor: '',
          duration: 8,
          exportFormats: { reel: true, square: false },
        })
      );
    });
  });

  test('exports a valid PDF when form is filled and one photo is uploaded', async ({
    page,
  }) => {
    // PDF generation can hit pdf-render-to-blob + photo decode; 90s budget
    // gives generous headroom over the measured warm P50 (~600ms) without
    // letting a genuine hang sit indefinitely.
    test.setTimeout(90_000);

    await page.goto('/listing-flyer');

    // Confirm the E2E bypass worked — we shouldn't be sitting on /login.
    await expect(page).not.toHaveURL(/\/login/i);

    // Use the filechooser-event pattern rather than direct setInputFiles
    // on the hidden <input>. The form opens the file dialog via
    // photoInputRef.current?.click() from a styled button (FlyerForm.tsx
    // ~313); this matches real user interaction and avoids platform quirks
    // where setInputFiles on a hidden input doesn't trigger the React
    // onChange. Pass {name, mimeType, buffer} so the resulting File has
    // type:"image/jpeg" — page.tsx:86 rejects anything not starting with
    // "image/", and Playwright's path-form can ship empty `type`.
    const photoBuffer = await fs.readFile(TEST_PHOTO_PATH);
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: /click to upload photos/i })
      .click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'perf-01.jpg',
      mimeType: 'image/jpeg',
      buffer: photoBuffer,
    });

    // After upload, the photo's file name appears in the photos list
    // (FlyerForm.tsx:277 — `{photo.file.name}`). Waiting on this confirms
    // the photo registered before we try to export.
    await expect(page.getByText(/perf-01\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });

    // Export PDF button (from ExportButtons.tsx). validateForExport returns
    // null once address + price + ≥1 photo are set, so the button should
    // enable after the upload completes.
    const exportButton = page.getByRole('button', { name: /export pdf/i });
    await expect(exportButton).toBeEnabled();

    // Wire the download promise BEFORE the click — Playwright needs to
    // observe the event from the start of the navigation.
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await exportButton.click();
    const download = await downloadPromise;

    // Filename: addressSlug from "1234 Test Drive NE" → "1234-test-drive-ne"
    // (src/tools/listing-flyer/engine/types.ts:111), suffixed "-flyer.pdf".
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // Validate the file landed on disk and is in a sane size range.
    // 10KB floor catches empty/error blobs; 5MB ceiling catches runaway
    // assets but stays well above the typical 1-3MB real flyer.
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stats = await fs.stat(filePath!);
    expect(stats.size).toBeGreaterThan(10_000);
    expect(stats.size).toBeLessThan(5_000_000);

    // Sniff the first 5 bytes — every PDF starts with "%PDF-". Cheap defense
    // against the export pipeline accidentally writing a different file type
    // (e.g., a JSON error blob) under a .pdf name.
    const fd = await fs.open(filePath!, 'r');
    try {
      const header = Buffer.alloc(5);
      await fd.read(header, 0, 5, 0);
      expect(header.toString('ascii')).toBe('%PDF-');
    } finally {
      await fd.close();
    }

    // Visual diff: rasterize page 1 of the exported PDF to PNG and compare
    // against the stored snapshot. Catches output drift like the v1.39.2
    // bullet regression — if any visual element silently disappears or
    // changes color, this assertion fails the test and blocks the merge.
    const pngPages = await pdfToPng(filePath!, {
      viewportScale: 2.0, // 2x for higher resolution, more sensitive comparison
      pagesToProcess: [1], // page 1 only
    });
    expect(pngPages.length).toBe(1);
    const pngBuffer = pngPages[0].content;

    expect(pngBuffer).toMatchSnapshot('listing-flyer-pdf-page-1.png', {
      // Reasonable defaults for visual diff:
      // - threshold: per-pixel sensitivity (0 = strict, 1 = ignore all)
      //   0.2 tolerates anti-aliasing variance while still catching real
      //   visual changes
      // - maxDiffPixelRatio: ratio of pixels that can differ before fail
      //   0.05 means up to 5% of pixels can differ — generous enough
      //   to handle font rendering nuance, strict enough to catch real
      //   regressions like a missing bullet color or a wrong background.
      threshold: 0.2,
      maxDiffPixelRatio: 0.05,
    });
  });
});
