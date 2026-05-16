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
 * Seed the Open House Promo draft in localStorage. eventDate/start/address
 * satisfy validateForExport (src/tools/open-house-promo/engine/types.ts:320);
 * qrTargetUrl satisfies the additional check for the QR PNG export. Photos
 * default to empty so each test can drive the upload UI explicitly (the
 * MP4/PDF tests do; the QR test doesn't need a photo).
 *
 * Event date is a fixed future date so the snapshot stays deterministic
 * across runs — using "today" would change the rendered output daily.
 */
export async function seedOpenHousePromoDraft(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'openHousePromo:draft',
      JSON.stringify({
        eventDate: '2026-12-31',
        eventStartTime: '10:00',
        eventEndTime: '12:00',
        propertyAddress: '1234 Test Drive NE',
        propertyCity: 'Olympia, WA 98516',
        listingPrice: '$685,000',
        description: 'A spacious test home with a deterministic pitch line.',
        propertyHighlights: [
          '4BR / 2.5BA',
          'Test feature highlight',
          'Mountain views',
          'Updated kitchen',
        ],
        photos: [],
        qrTargetUrl: 'https://example.com/test-listing',
        eventNotes: 'Light refreshments served.',
        primaryColor: '',
        accentColor: '',
        backgroundColor: '',
        mp4DurationSeconds: 6,
        exportFormats: { reel: true, square: false },
      })
    );
  });
}

/**
 * Seed the Listing Presentation draft in localStorage. propertyAddress
 * satisfies validateForExport (src/tools/listing-presentation/engine/types.ts:179).
 * Realistic content in marketing strategies + comparable sales + agentBio
 * + track-record stats so the PDF snapshot captures a fully-rendered page,
 * not blanks.
 *
 * agentHeadshot stays null — LP renders a placeholder for null headshots,
 * which is deterministic; passing a fake data URL risks breaking the
 * react-pdf decoder mid-export.
 */
export async function seedListingPresentationDraft(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'listingPresentation:draft',
      JSON.stringify({
        propertyAddress: '1234 Test Drive NE',
        propertyCity: 'Olympia, WA 98516',
        ownerName: 'Test Owner',
        agentBio:
          'Test bio. Lifelong area resident with eight years selling on the Westside. ' +
          'I take the photos, write the copy, and run the marketing myself.',
        agentHeadshot: null,
        homesSold: '47',
        averageDaysOnMarket: '12',
        saleToListRatio: '102%',
        yearsExperience: '8 years',
        marketingStrategies: [
          'Professional photography + 4K video tour',
          'Featured placement on Zillow + Realtor.com',
          'Targeted social ads to active local buyers',
          'Open house weekend + private agent preview',
        ],
        comparableSales: [
          {
            address: '1100 Cedar Ln, Olympia',
            soldPrice: '$675,000',
            daysOnMarket: '8 DOM',
            saleToListPercent: '104% S/L',
          },
          {
            address: '543 Oakwood Dr, Olympia',
            soldPrice: '$690,000',
            daysOnMarket: '12 DOM',
            saleToListPercent: '101% S/L',
          },
          {
            address: '920 Westbrook Ave, Olympia',
            soldPrice: '$650,000',
            daysOnMarket: '15 DOM',
            saleToListPercent: '99% S/L',
          },
        ],
        whyChooseMe:
          'When you hire me, you hire a marketer who happens to be a real estate agent ' +
          '— not the other way around. Every listing gets the full playbook.',
        primaryColor: '',
        accentColor: '',
        backgroundColor: '',
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
  // Wait on the photos counter rather than the filename: Listing Flyer
  // renders `{photo.file.name}` in the list, but OH Promo renders
  // "Photo 1" — both tools render `Photos (1 / 5)` in the section
  // header label. The counter is the portable signal. Generous timeout
  // because OH Promo's handlePhotoSelect compresses to a data URL
  // before updating state.
  await expect(
    page.getByText(/Photos\s*\(1\s*\/\s*\d+\)/i).first()
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Convert an image buffer (JPEG / PNG / etc.) into a PNG screenshot buffer
 * that Playwright's toMatchSnapshot can pixel-diff.
 *
 * Why this exists: toMatchSnapshot requires BOTH sides to be PNG-decodable.
 * Raw JPEG bytes saved under a .png filename trip the decoder on subsequent
 * runs ("Could not decode expected image as PNG"). This helper loads the
 * image into the active page context, screenshots the <img> as PNG, and
 * returns the buffer ready for snapshot comparison.
 *
 * Side effect: navigates the page away from whatever it was on. Call AFTER
 * the export-related assertions are done.
 *
 * Usage:
 *   const png = await bufferToScreenshotPng(page, jpegBuffer, 'image/jpeg');
 *   expect(png).toMatchSnapshot('name.png', { threshold: 0.2, maxDiffPixelRatio: 0.05 });
 */
export async function bufferToScreenshotPng(
  page: Page,
  buffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff">` +
      `<img id="snap" src="${dataUrl}" style="display:block">` +
      `</body></html>`
  );
  const img = page.locator('#snap');
  await img.waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('#snap') as HTMLImageElement | null;
    return !!el && el.complete && el.naturalWidth > 0;
  });
  return await img.screenshot({ type: 'png' });
}
