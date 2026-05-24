import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Seller Presentation — A7d.8: video thumbnail (first-frame default
 * + Instagram-style scrubber).
 *
 * Dallen's 2026-05-23 smoke: "If the agent doesn't put in a thumbnail
 * for the video on the editorial page, the video populates with a
 * blank image. We should have a thumbnail picker slider, kinda like
 * how Instagram does."
 *
 * Two responsibilities under test, layered the same way the A7d.5
 * upload-progress proof did it (browser-driven where tractable, source
 * grep where a real video fixture would be needed to drive the path):
 *
 *   1. PRECEDENCE — the renderer's override > scrub > auto first-frame
 *      cascade. Tested against three new poster-precedence fixtures
 *      that each set a different subset of the three poster slots.
 *      The VideoBlock emits `data-poster-source` so the cascade can
 *      be asserted without parsing the rendered URL.
 *
 *   2. NEVER-BLANK BASELINE — when a video has been uploaded but the
 *      agent took no further action, the seller page MUST render a
 *      poster (the auto first-frame captured at upload time). The
 *      auto-only fixture covers this end-to-end.
 *
 *   3. URL-NOT-DATA: GUARD — the captured frame is stored as a hosted
 *      Vercel Blob URL, never a base64 data: URL. Mirrors the A7c.2
 *      ImageUploadField guard (published-page payload-leanness rule).
 *
 *   4. SCRUBBER UI — the wizard exposes the slider + "Use this frame"
 *      action after a video is uploaded.
 *
 *   5. WIRING — the component routes captured frames through
 *      /api/upload-image (auth-gated + sized + folder-sanitized) and
 *      rejects non-hosted URLs at the receive site.
 */

const FIELD = resolve(process.cwd(), 'src/components/VideoUploadField.tsx');

test.describe('Seller Presentation — A7d.8 video poster', () => {
  test.describe('Renderer precedence — override > scrub > auto', () => {
    test('auto-only fixture: poster source = auto, URL = autoPosterUrl', async ({
      page,
    }) => {
      await page.goto('/seller-presentation-preview?fixture=poster-auto-only');
      const video = page.getByTestId('sep-video-el');
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute('data-poster-source', 'auto');
      await expect(video).toHaveAttribute(
        'poster',
        'https://blob.example.com/auto-first-frame.jpg',
      );
    });

    test('scrub+auto fixture: scrub wins over auto', async ({ page }) => {
      await page.goto(
        '/seller-presentation-preview?fixture=poster-scrub-over-auto',
      );
      const video = page.getByTestId('sep-video-el');
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute('data-poster-source', 'scrub');
      await expect(video).toHaveAttribute(
        'poster',
        'https://blob.example.com/scrub-picked-frame.jpg',
      );
    });

    test('all-three fixture: manual override wins over both', async ({
      page,
    }) => {
      await page.goto(
        '/seller-presentation-preview?fixture=poster-override-wins',
      );
      const video = page.getByTestId('sep-video-el');
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute('data-poster-source', 'override');
      await expect(video).toHaveAttribute(
        'poster',
        'https://blob.example.com/manual-override-thumbnail.jpg',
      );
    });
  });

  test.describe('Never-blank baseline', () => {
    test('auto-only payload yields a non-blank poster on the seller page', async ({
      page,
    }) => {
      // The user-visible promise: agent uploads a video and does
      // nothing else → the page still shows a poster (the auto
      // first-frame), not a black box.
      await page.goto('/seller-presentation-preview?fixture=poster-auto-only');
      const video = page.getByTestId('sep-video-el');
      const poster = await video.getAttribute('poster');
      expect(poster).toBeTruthy();
      expect(poster!.startsWith('data:')).toBe(false);
      // It MUST be a hosted URL — the renderer is the last line of
      // defense before this lands in a buyer's browser.
      expect(poster!).toMatch(/^https?:\/\//);
    });
  });

  test.describe('Wizard UI — scrubber + frame picker', () => {
    test('Editorial step exposes the scrubber affordances on VideoUploadField', async ({
      page,
    }) => {
      await page.goto('/seller-presentation');
      await expect(page.getByTestId('step-property')).toBeVisible();

      // Drive Steps 1–4 with the minimum-required dance.
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
      await page.getByTestId('step-editorial-video-add').click();

      // The scrubber slot is wired in — visible the moment the local
      // File + duration are known. The full browser-driven exercise
      // (drag → "Use this frame" → frame captured + uploaded) needs a
      // valid decodable MP4 fixture AND a stub of the Vercel-Blob PUT
      // endpoint to be deterministic; this spec proves the wiring on
      // the component contract directly (source grep below) — same
      // shape as the A7d.5 progress-bar wiring proof.
      await expect(
        page.getByTestId('step-editorial-video-upload'),
      ).toBeVisible();
    });
  });

  test.describe('Wiring — frame capture, hosted URL, precedence helper', () => {
    test('VideoUploadField captures frames via canvas + uploads to /api/upload-image (no data: URLs)', () => {
      const src = readFileSync(FIELD, 'utf8');

      // 1) Local-file capture path: reads from a blob: objectURL so
      //    canvas.toBlob() doesn't throw SecurityError on a cross-
      //    origin hosted video. The spec is explicit that this is the
      //    chosen iOS-safe path.
      expect(src).toMatch(/URL\.createObjectURL\(file\)/);
      expect(src).toMatch(/canvas\.toBlob\(/);

      // 2) The captured frame is uploaded through the existing image
      //    route (auth-gated + sized + folder-sanitized), NOT inlined
      //    as a data: URL. The receive site explicitly rejects a
      //    non-hosted URL so a regression can't silently land.
      expect(src).toContain('/api/upload-image');
      expect(src).toMatch(/non-hosted URL/);

      // 3) iOS Safari quirks the brief calls out: muted + playsInline
      //    + preload="auto" + wait for loadeddata + seeked.
      expect(src).toMatch(/video\.muted\s*=\s*true/);
      expect(src).toMatch(/video\.playsInline\s*=\s*true/);
      expect(src).toMatch(/video\.preload\s*=\s*"auto"/);
      expect(src).toMatch(/onloadeddata/);
      expect(src).toMatch(/onseeked/);

      // 4) Auto first-frame capture fires immediately after upload.
      //    The brief says t≈0.0–0.1s because some encoders don't paint
      //    frame 0 until a seek lands.
      expect(src).toMatch(/captureFrameBlob\(nextObjectUrl,\s*0\.1\)/);

      // 5) onPosterChange callback fires with both 'auto' and 'scrub'
      //    source tags so the caller can store them in the right
      //    draft slot (autoPosterUrl vs scrubPosterUrl).
      expect(src).toMatch(/onPosterChange\?.*\(.*"auto"\)/s);
      expect(src).toMatch(/onPosterChange\?.*\(.*"scrub"\)/s);

      // 6) Scrubber + "Use this frame" UI testids are present so the
      //    e2e harness can target them once a real video fixture is
      //    wired up.
      expect(src).toContain('data-testid={tid("scrubber")}');
      expect(src).toContain('data-testid={tid("scrubber-range")}');
      expect(src).toContain('data-testid={tid("scrubber-use")}');
    });

    test('effectivePosterUrl helper resolves the override > scrub > auto cascade', () => {
      const typesSrc = readFileSync(
        resolve(process.cwd(), 'src/tools/seller-presentation/engine/types.ts'),
        'utf8',
      );
      // The helper exists, is exported, and reads the three slots in
      // the documented order (so the rule is provable from source —
      // the renderer test above proves the rule in the browser).
      expect(typesSrc).toMatch(/export function effectivePosterUrl/);
      expect(typesSrc).toMatch(
        /video\.posterUrl\s*\|\|\s*video\.scrubPosterUrl\s*\|\|\s*video\.autoPosterUrl/,
      );
    });
  });
});
