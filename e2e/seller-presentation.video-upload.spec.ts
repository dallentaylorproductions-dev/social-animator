import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — walk-through video upload (v1.47 / A7d.3).
 *
 * Pins the camera-roll → /api/upload-video → inline-playback chain
 * for the walk-through video added in Lane A / A7d.3.
 *
 * Three concentric layers covered:
 *
 *   1. ROUTE — direct POSTs to /api/upload-video assert the
 *      contract: auth gate, MIME allowlist, server-side size cap,
 *      503 when storage is unconfigured, hosted-URL response shape.
 *      Uses the route's E2E opt-in headers (gated by NODE_ENV !==
 *      "production" && E2E_TESTING === "1") so the post-auth paths
 *      are reachable without a real session. The 401 path
 *      deliberately omits the bypass header so the production
 *      contract stays asserted.
 *
 *   2. WIZARD UI — the editorial step shows the new
 *      VideoUploadField with no paste-URL surface; the thumbnail
 *      field is camera-roll-only (its paste-URL input is REMOVED,
 *      not just hidden); the "recorded on" input is a native date
 *      picker; the "video thumbnail" rename has landed everywhere
 *      user-facing.
 *
 *   3. SELLER PAGE — the renderer emits an inline <video controls
 *      playsInline preload="metadata" poster> instead of a
 *      poster-link-out. The video block hides cleanly when no
 *      video is set (minimal fixture).
 */

const ROUTE = '/api/upload-video';

function fakeFile(bytes: number, mimeType: string): Buffer {
  // Content doesn't have to be a valid container — the route's MIME +
  // size checks fire before any decoding would. The byte count is
  // what matters for the size-cap assertion.
  return Buffer.alloc(bytes, 0);
}

function multipart(
  bytes: Buffer,
  mimeType: string,
  filename: string,
  folder?: string,
): { body: Buffer; contentType: string } {
  const boundary = '----vidtest' + Math.random().toString(36).slice(2);
  const lines: Buffer[] = [];
  const push = (s: string) => lines.push(Buffer.from(s, 'utf8'));
  push(`--${boundary}\r\n`);
  push(
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
  );
  push(`Content-Type: ${mimeType}\r\n\r\n`);
  lines.push(bytes);
  push(`\r\n`);
  if (folder) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="folder"\r\n\r\n`);
    push(folder);
    push(`\r\n`);
  }
  push(`--${boundary}--\r\n`);
  return {
    body: Buffer.concat(lines),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

test.describe('Seller Presentation — A7d.3 walk-through video', () => {
  test.describe('Route: /api/upload-video', () => {
    test('401 without auth (no E2E bypass header)', async ({ request }) => {
      const { body, contentType } = multipart(
        fakeFile(1024, 'video/mp4'),
        'video/mp4',
        'tiny.mp4',
      );
      const res = await request.post(ROUTE, {
        headers: { 'content-type': contentType },
        data: body,
      });
      // The route's real auth() returns no session in the dev server,
      // so the contract path (no bypass header → 401) executes.
      expect(res.status()).toBe(401);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(false);
    });

    test('415 on disallowed MIME type', async ({ request }) => {
      const { body, contentType } = multipart(
        fakeFile(1024, 'application/octet-stream'),
        'application/octet-stream',
        'not-a-video.bin',
      );
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': contentType,
          'x-e2e-bypass': '1',
        },
        data: body,
      });
      expect(res.status()).toBe(415);
    });

    test('413 when body exceeds the server-side size cap', async ({
      request,
    }) => {
      // 76 MiB — one MiB over the 75 MiB cap declared on the route.
      const oversized = fakeFile(76 * 1024 * 1024, 'video/mp4');
      const { body, contentType } = multipart(
        oversized,
        'video/mp4',
        'big.mp4',
      );
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': contentType,
          'x-e2e-bypass': '1',
        },
        data: body,
      });
      expect(res.status()).toBe(413);
    });

    test('503 when the storage adapter is not configured', async ({
      request,
    }) => {
      const { body, contentType } = multipart(
        fakeFile(1024, 'video/mp4'),
        'video/mp4',
        'tiny.mp4',
      );
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': contentType,
          'x-e2e-bypass': '1',
          'x-e2e-force-no-token': '1',
        },
        data: body,
      });
      expect(res.status()).toBe(503);
      const json = (await res.json()) as { ok: boolean; error: string };
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
    });

    test('200 returns a hosted URL (not a data: URL)', async ({ request }) => {
      const { body, contentType } = multipart(
        fakeFile(2048, 'video/mp4'),
        'video/mp4',
        'tiny.mp4',
        'seller-presentation-video',
      );
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': contentType,
          'x-e2e-bypass': '1',
          'x-e2e-simulate': '1',
        },
        data: body,
      });
      expect(res.status()).toBe(200);
      const json = (await res.json()) as { ok: boolean; url: string };
      expect(json.ok).toBe(true);
      // The persisted value MUST be a real hosted URL. A regression
      // back to a data-URL pattern (the kind the old pre-A7c.2 photo
      // pipeline produced) would bloat KV + every consumer page; this
      // assertion makes that fail loud.
      expect(json.url).toMatch(/^https?:\/\//);
      expect(json.url.startsWith('data:')).toBe(false);
    });
  });

  test.describe('Wizard UI — editorial step', () => {
    test('walk-through video field exposes camera-roll upload only (no paste-URL)', async ({
      page,
    }) => {
      await page.goto('/seller-presentation');
      await expect(page.getByTestId('step-property')).toBeVisible();

      // Drive Steps 1–4 with the same minimum-required dance the
      // A7d round-trip spec uses, so the Editorial step is reachable.
      await page
        .getByTestId('step-property-address')
        .fill('1742 Kenilworth Avenue');
      await page.getByTestId('step-property-city').fill('Tremont');
      await page.getByTestId('step-property-state').fill('OH');
      await page.getByTestId('step-property-zip').fill('44113');
      const nextButton = page.getByTestId('wizard-next');
      await nextButton.click();
      await page.getByTestId('step-comps-add').click();
      await page
        .getByTestId('step-comps-address-0')
        .fill('2218 W 14th Street');
      await page.getByLabel('comp-1-sold-price').fill('648000');
      await nextButton.click();
      await page.getByLabel('recommended-price').fill('675000');
      await nextButton.click();
      await nextButton.click(); // skip pitch
      await expect(page.getByTestId('step-editorial')).toBeVisible({
        timeout: 10_000,
      });

      // Open the walk-through video card.
      await page.getByTestId('step-editorial-video-add').click();

      // The new VideoUploadField is present; the old free-text
      // "Video link" URL input is GONE.
      await expect(page.getByTestId('step-editorial-video-upload')).toBeVisible();
      await expect(page.getByTestId('step-editorial-video-url')).toHaveCount(0);

      // The "recorded on" input is the native date picker (A7c.1
      // pattern). type="date" is the contract.
      const recordedOn = page.getByTestId('step-editorial-video-recorded-on');
      await expect(recordedOn).toHaveAttribute('type', 'date');

      // The thumbnail field is the renamed "Video thumbnail" and
      // EXPOSES NO paste-URL surface (A7d.3 explicit subtraction).
      await expect(
        page.getByText('Video thumbnail', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Poster image', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByTestId('step-editorial-video-poster-url'),
      ).toHaveCount(0);
      await expect(
        page.getByTestId('step-editorial-video-poster-upload'),
      ).toBeVisible();
    });
  });

  test.describe('Seller page — inline playback', () => {
    test('FULL fixture renders a native <video> with playsInline + preload="metadata"', async ({
      page,
    }) => {
      await page.goto('/seller-presentation-preview?fixture=full');
      await expect(page.getByTestId('sep-video')).toBeVisible();

      const video = page.getByTestId('sep-video-el');
      await expect(video).toBeVisible();
      // playsInline is required so iOS Safari doesn't yank to fullscreen
      // the moment the buyer hits play.
      await expect(video).toHaveAttribute('playsinline', '');
      await expect(video).toHaveAttribute('preload', 'metadata');
      // The hosted URL — not a link-out anchor — is the src.
      const src = await video.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src!.startsWith('data:')).toBe(false);
    });

    test('MINIMAL fixture hides the video block cleanly', async ({ page }) => {
      await page.goto('/seller-presentation-preview?fixture=minimal');
      await expect(page.getByTestId('seller-presentation-public')).toBeVisible();
      await expect(page.getByTestId('sep-video')).toHaveCount(0);
    });
  });
});
