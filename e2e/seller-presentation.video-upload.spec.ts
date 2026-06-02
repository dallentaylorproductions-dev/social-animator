import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Seller Presentation — walk-through video upload
 * (v1.47 / A7d.3 → A7d.3.1).
 *
 * A7d.3.1 fix: the video upload no longer POSTs the file through the
 * Function (which 413'd at Vercel's ~4.5 MB request-body limit on
 * every real phone clip). Instead the browser uses
 * `@vercel/blob/client`'s `upload()` to push the file STRAIGHT to
 * Vercel Blob; this route is the small token handshake endpoint.
 *
 * Three concentric layers covered:
 *
 *   1. ROUTE — direct POSTs to /api/upload-video assert the new
 *      handshake contract: auth gate (401 without bypass), 503 when
 *      storage is unconfigured, 200 + `clientToken` shape when authed.
 *      The route no longer sees the file bytes, so old MIME/size
 *      route-level checks moved into the issued token's constraints
 *      (allowedContentTypes + maximumSizeInBytes) — those are
 *      defense-in-depth at Vercel Blob, not enforced at this route.
 *      The real-deploy smoke catches the platform-level path
 *      (handoff explicitly calls this out).
 *
 *   2. WIZARD UI — the editorial step shows the VideoUploadField with
 *      no paste-URL surface; the thumbnail field is camera-roll-only
 *      (its paste-URL input is REMOVED, not just hidden); the
 *      "recorded on" input is a native date picker; the "video
 *      thumbnail" rename has landed everywhere user-facing.
 *
 *   3. SELLER PAGE — the renderer emits an inline <video controls
 *      playsInline preload="metadata" poster> instead of a
 *      poster-link-out. The video block hides cleanly when no
 *      video is set (minimal fixture).
 */

const ROUTE = '/api/upload-video';

function tokenRequestBody(
  pathname = 'seller-presentation-video/test.mp4',
): string {
  // The shape `@vercel/blob/client`'s `upload()` POSTs to the
  // handleUploadUrl when it wants a client token. Mirrors the
  // GenerateClientTokenEvent shape from the SDK's protocol.
  return JSON.stringify({
    type: 'blob.generate-client-token',
    payload: {
      pathname,
      multipart: true,
      clientPayload: null,
    },
  });
}

test.describe('Seller Presentation — A7d.3.1 walk-through video', () => {
  test.describe('Route: /api/upload-video (client-direct handshake)', () => {
    test('401 without auth (no E2E bypass header)', async ({ request }) => {
      const res = await request.post(ROUTE, {
        headers: { 'content-type': 'application/json' },
        data: tokenRequestBody(),
      });
      // The route's real auth() returns no session in the dev server,
      // so the contract path (no bypass header → 401) executes.
      expect(res.status()).toBe(401);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(false);
    });

    test('503 when the storage adapter is not configured', async ({
      request,
    }) => {
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': 'application/json',
          'x-e2e-bypass': '1',
          'x-e2e-force-no-token': '1',
        },
        data: tokenRequestBody(),
      });
      expect(res.status()).toBe(503);
      const json = (await res.json()) as { ok: boolean; error: string };
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
    });

    test('200 returns a generate-client-token response when authed (simulate)', async ({
      request,
    }) => {
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': 'application/json',
          'x-e2e-bypass': '1',
          'x-e2e-simulate': '1',
        },
        data: tokenRequestBody(),
      });
      expect(res.status()).toBe(200);
      const json = (await res.json()) as {
        type: string;
        clientToken: string;
      };
      // The handshake's success shape MUST match the SDK protocol —
      // the browser's upload() checks for this exact discriminator.
      expect(json.type).toBe('blob.generate-client-token');
      expect(typeof json.clientToken).toBe('string');
      expect(json.clientToken.length).toBeGreaterThan(0);
    });

    test('200 acknowledges upload-completed events when authed (simulate)', async ({
      request,
    }) => {
      // The SDK posts a second event AFTER the browser-direct upload
      // finishes; the route must ack it with the right shape so the
      // SDK's promise resolves cleanly.
      const res = await request.post(ROUTE, {
        headers: {
          'content-type': 'application/json',
          'x-e2e-bypass': '1',
          'x-e2e-simulate': '1',
        },
        data: JSON.stringify({
          type: 'blob.upload-completed',
          payload: {
            blob: {
              url: 'https://blob.example.com/seller-presentation-video/x.mp4',
              pathname: 'seller-presentation-video/x.mp4',
              contentType: 'video/mp4',
              contentDisposition: 'attachment',
            },
            tokenPayload: null,
          },
        }),
      });
      expect(res.status()).toBe(200);
      const json = (await res.json()) as { type: string; response: string };
      expect(json.type).toBe('blob.upload-completed');
      expect(json.response).toBe('ok');
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
      await page.getByTestId('step-comps-manual-link').click();
      await page
        .getByTestId('step-comps-add-address')
        .fill('2218 W 14th Street');
      await page.getByLabel('comp-add-sold-price').fill('648000');
      await page.getByTestId('step-comps-add-submit').click();
      await expect(page.getByTestId('step-comps-card-0')).toBeVisible();
      await nextButton.click();
      await page.getByLabel('recommended-price').fill('675000');
      await nextButton.click();
      await nextButton.click(); // skip pitch
      await expect(page.getByTestId('step-editorial')).toBeVisible({
        timeout: 10_000,
      });

      // Open the walk-through video card.
      await page.getByTestId('step-editorial-video-add').click();

      // The VideoUploadField is present; the old free-text
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

  /*
   * A7d.5 — visible upload progress.
   *
   * Dallen smoke 2026-05-22: real phone clips uploaded successfully
   * (A7d.3.1 fix) but the wait felt stalled — no UI signal advanced
   * while bytes streamed. A7d.5 wires `onUploadProgress` from
   * @vercel/blob/client 2.4.0 to a visible determinate progress bar
   * (indeterminate until the first event lands), and disables the
   * Add/Replace control mid-upload so a double-submit can't race the
   * SDK's token handshake.
   *
   * No-browser-upload e2e test — the inline-upload e2e path would
   * need both a valid decodable MP4 fixture AND a stub of the
   * Vercel-Blob PUT endpoint to drive the bar deterministically.
   * Until that fixture exists, this spec proves the wiring on the
   * component contract directly (source grep) — the same shape as
   * other A7d wiring proofs in this suite where browser-level
   * exercise isn't tractable.
   */
  test.describe('Wiring — onUploadProgress + progress UI', () => {
    test('VideoUploadField + video-upload-session wire onUploadProgress to @vercel/blob/client and render a progress bar', () => {
      // A7d.11 — the in-flight upload state was extracted from
      // VideoUploadField into a module-level session at
      // src/lib/video-upload-session.ts so it survives any React
      // remount of the field or its parents. The SDK call moved with
      // it; the FIELD's job is now to subscribe + display.
      const sessionSrc = readFileSync(
        resolve(process.cwd(), 'src/lib/video-upload-session.ts'),
        'utf8',
      );
      const fieldSrc = readFileSync(
        resolve(process.cwd(), 'src/components/VideoUploadField.tsx'),
        'utf8',
      );

      // 1) The SDK's progress callback is wired into the upload()
      //    options in the SESSION module (not in the field component).
      expect(sessionSrc).toMatch(/onUploadProgress\s*:/);
      // The callback reads `percentage` off the event (per the
      // @vercel/blob 2.4.0 UploadProgressEvent shape).
      expect(sessionSrc).toMatch(/\.percentage/);

      // 2) The field's determinate progress UI is unchanged: the
      //    progress bar reads from the subscribed session state.
      expect(fieldSrc).toContain('data-testid={tid("progress")}');
      expect(fieldSrc).toContain('data-testid={tid("progress-fill")}');
      // Indeterminate fallback is present (so the bar shows even
      // before the first onUploadProgress event lands).
      expect(fieldSrc).toMatch(/data-progress-mode=/);

      // 3) The Replace + Remove controls are still gated on the
      //    uploading state so an agent can't double-submit.
      expect(fieldSrc).toMatch(/disabled=\{uploading\}/);

      // 4) A7d.11 — the field NO LONGER imports `upload` from
      //    @vercel/blob/client directly; only the session module
      //    does. This guarantees the in-flight upload state isn't
      //    coupled to the field's mount lifecycle.
      expect(fieldSrc).not.toMatch(/from\s+["']@vercel\/blob\/client["']/);
      // And the field DOES import the session contract.
      expect(fieldSrc).toMatch(
        /from\s+["']@\/lib\/video-upload-session["']/,
      );
    });

    test('Installed @vercel/blob version supports onUploadProgress (UploadProgressEvent shipped in 2.x)', () => {
      // Lock in the SDK version we tested against. If a future bump
      // changes the callback shape, this test fails fast (rather
      // than the bar silently going dead in production).
      const pkg = JSON.parse(
        readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      const blobVersion = pkg.dependencies?.['@vercel/blob'];
      expect(blobVersion).toBeTruthy();
      // The shape we depend on shipped in 2.x. Allow ^2.x (the
      // semver range in package.json).
      expect(blobVersion).toMatch(/^[\^~]?2\./);
    });
  });
});
