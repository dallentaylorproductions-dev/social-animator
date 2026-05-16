import { expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * E2E test fixtures — localStorage seeding + photo upload helpers.
 *
 * Extracted from e2e/listing-flyer.spec.ts (W-2.2) so W-2.5's Open House
 * Promo / Listing Presentation / Social Animator tests can reuse the same
 * seed data + the filechooser upload pattern that proved necessary on
 * Chromium (direct setInputFiles on hidden inputs doesn't trigger the
 * React onChange handler — see the W-2.2 commit body).
 *
 * Storage keys + schemas mirror the source code:
 *   - socanim_brand_settings ← src/lib/brand.ts:25
 *   - listingFlyer:draft     ← src/tools/listing-flyer/engine/draft-storage.ts:8
 *
 * Call seedBrandProfile + seedListingFlyerDraft BEFORE page.goto(). They use
 * page.addInitScript so the values are in localStorage before any app JS runs.
 */

/**
 * Seed the Brand Profile in localStorage. contactPhone is stored as raw 10
 * digits per H-7.10 normalization (src/lib/brand.ts:extractPhoneDigits);
 * the form's PhoneInput formats it to "(xxx) xxx-xxxx" at display time.
 */
export async function seedBrandProfile(page: Page): Promise<void> {
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
  });
}

/**
 * Seed the Listing Flyer draft in localStorage. Address + price satisfy
 * validateForExport (src/tools/listing-flyer/engine/types.ts:123); ≥1 photo
 * still needs to be uploaded via uploadTestPhoto at the start of each test.
 */
export async function seedListingFlyerDraft(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
}

/**
 * Upload a test photo from public/perf-test/ via the filechooser event
 * pattern. This mirrors real user interaction (clicking the visible upload
 * button programmatically triggers the hidden <input type="file">); the
 * direct setInputFiles-on-hidden-input approach was flaky on Chromium and
 * sometimes didn't fire the React onChange. Pass {name, mimeType, buffer}
 * so the File has type:"image/jpeg" — src/app/listing-flyer/page.tsx:86
 * rejects files whose `type` doesn't start with "image/".
 *
 * Waits for the photo's filename to appear in the photos list before
 * returning so subsequent assertions see a registered photo.
 */
export async function uploadTestPhoto(
  page: Page,
  photoFileName: string = 'perf-01.jpg'
): Promise<void> {
  const photoPath = path.resolve(
    __dirname,
    '../../public/perf-test',
    photoFileName
  );
  const buffer = await fs.readFile(photoPath);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .getByRole('button', { name: /click to upload photos/i })
      .click(),
  ]);
  await fileChooser.setFiles([
    {
      name: photoFileName,
      mimeType: 'image/jpeg',
      buffer,
    },
  ]);
  // The filename renders in the photos list (FlyerForm.tsx:277 —
  // `{photo.file.name}`). Strip the .jpg suffix so the regex matches
  // even if the form display ever trims the extension.
  const stem = photoFileName.replace(/\.[^.]+$/, '');
  await expect(
    page.getByText(new RegExp(stem.replace(/[-.]/g, '\\$&'), 'i'))
  ).toBeVisible({ timeout: 10_000 });
}
