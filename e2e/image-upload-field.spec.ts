import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * ImageUploadField — upload flow (v1.47 / A7c.2).
 *
 * Asserts the picker → downscale → /api/upload-image → onChange(url)
 * → stored-as-URL contract for the new shared component. The route
 * is MOCKED at the page level — we're testing the client wiring, not
 * Vercel Blob. The contract this spec freezes:
 *
 *   1. Activating the upload control opens the file chooser sheet
 *      (in production this is iOS's "Photo Library / Take Photo /
 *      Choose File" picker).
 *   2. The component POSTs multipart/form-data to /api/upload-image
 *      with the downscaled file. The body MUST be a small JPEG (not
 *      the original multi-MB phone photo) — we check the byte size.
 *   3. The component stores the route's returned URL via onChange.
 *      The stored value is a hosted URL (https://… or /mocked/…),
 *      NEVER a base64 data URL. Stuffing data URLs into the listing
 *      profile / brand settings / published payload would bloat
 *      every downstream store and the consumer page render.
 *
 * The hero-photo + headshot fields are covered together because they
 * are the two A7c.2 wire-up sites and they share the same component
 * (a regression in one is a regression in both).
 */

const SAMPLE_PHOTO_PATH = path.resolve(
  __dirname,
  '../public/perf-test/perf-01.jpg',
);

const MOCK_URL = 'https://blob.example.com/seller-presentation/mock-hero.jpg';

test.describe('ImageUploadField — upload flow (A7c.2)', () => {
  test('Seller Presentation hero photo: picker → mocked /api/upload-image → stores hosted URL', async ({
    page,
  }) => {
    let uploadedBodySize = 0;
    let uploadedContentType: string | null = null;
    let uploadedFolder: string | null = null;

    await page.route('**/api/upload-image', async (route) => {
      const request = route.request();
      const buf = request.postDataBuffer();
      uploadedBodySize = buf ? buf.length : 0;
      // Parse the multipart body just enough to confirm the JPEG
      // content-type header reached the route + capture the folder
      // form field. We don't need a full parser — substring search
      // is sufficient and avoids pulling in a multipart dep.
      const raw = buf ? buf.toString('latin1') : '';
      if (/Content-Type:\s*image\/jpeg/i.test(raw)) {
        uploadedContentType = 'image/jpeg';
      }
      const folderMatch = raw.match(
        /name="folder"\r?\n\r?\n([a-z0-9_-]+)\r?\n/,
      );
      uploadedFolder = folderMatch ? folderMatch[1] : null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, url: MOCK_URL }),
      });
    });

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    // Drive the picker. setInputFiles directly on the hidden input is
    // flaky on Chromium per e2e/fixtures/seed-helpers.ts:188 — use the
    // filechooser event tied to the visible upload button instead.
    const buffer = await fs.readFile(SAMPLE_PHOTO_PATH);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('step-property-hero-upload').click(),
    ]);
    await chooser.setFiles([
      { name: 'perf-01.jpg', mimeType: 'image/jpeg', buffer },
    ]);

    // Preview materializes with the MOCKED URL — proves the
    // component took the route's response (not the source data URL).
    const preview = page.getByTestId('step-property-hero-preview');
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toHaveAttribute('src', MOCK_URL);

    // The URL-fallback input is synced to the same hosted URL.
    await expect(page.getByTestId('step-property-hero-url')).toHaveValue(
      MOCK_URL,
    );

    // The route saw a JPEG body and the seller-presentation folder.
    expect(uploadedContentType).toBe('image/jpeg');
    expect(uploadedFolder).toBe('seller-presentation');
    // The downscaled JPEG should be smaller than the source. The
    // multipart envelope adds ~hundreds of bytes; we still expect
    // the total upload body to be well under 8 MiB and meaningfully
    // smaller than a raw phone photo would be.
    expect(uploadedBodySize).toBeGreaterThan(0);
    expect(uploadedBodySize).toBeLessThan(2 * 1024 * 1024);

    // Privacy / size regression guard: localStorage must hold the
    // hosted URL, NOT a base64 data: URL. A regression to the
    // FileReader→data-URL pattern would make this fail loud.
    const heroPhoto = await page.evaluate(() => {
      const raw = window.localStorage.getItem('socanim_listing_profile');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { heroPhoto?: string };
        return parsed.heroPhoto ?? null;
      } catch {
        return null;
      }
    });
    expect(heroPhoto).toBe(MOCK_URL);
    expect(heroPhoto?.startsWith('data:')).toBe(false);
  });

  test('Brand headshot in Settings: picker → mocked /api/upload-image → stores hosted URL', async ({
    page,
  }) => {
    const HEADSHOT_URL = 'https://blob.example.com/agent-headshots/mock.jpg';

    await page.route('**/api/upload-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, url: HEADSHOT_URL }),
      });
    });

    await page.goto('/settings');
    // The settings page is gated by middleware but the playwright
    // webServer sets E2E_TESTING=1, which bypasses the auth/sub
    // checks in src/middleware.ts.
    await expect(page.getByTestId('brand-headshot-upload')).toBeVisible({
      timeout: 10_000,
    });

    const buffer = await fs.readFile(SAMPLE_PHOTO_PATH);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('brand-headshot-upload').click(),
    ]);
    await chooser.setFiles([
      { name: 'headshot.jpg', mimeType: 'image/jpeg', buffer },
    ]);

    const preview = page.getByTestId('brand-headshot-preview');
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toHaveAttribute('src', HEADSHOT_URL);

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('socanim_brand_settings');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { agentPhotoUrl?: string };
        return parsed.agentPhotoUrl ?? null;
      } catch {
        return null;
      }
    });
    expect(stored).toBe(HEADSHOT_URL);
    expect(stored?.startsWith('data:')).toBe(false);
  });
});
