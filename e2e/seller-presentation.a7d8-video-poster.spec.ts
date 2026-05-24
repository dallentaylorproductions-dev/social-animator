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
      //    + preload="auto" + wait for loadeddata + a painted-frame
      //    signal (requestVideoFrameCallback when available, seeked +
      //    rAF as the universal fallback).
      expect(src).toMatch(/video\.muted\s*=\s*true/);
      expect(src).toMatch(/video\.playsInline\s*=\s*true/);
      expect(src).toMatch(/video\.preload\s*=\s*"auto"/);
      expect(src).toMatch(/loadeddata/);
      expect(src).toMatch(/seeked/);

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

  /*
   * A7d.8.1 — P1 fix to A7d.8 from Dallen's 2026-05-23 real-iPhone
   * smoke. The video uploaded successfully (Blob 100%, clip played
   * inline, runtime auto-filled) but the field stayed stuck on
   * "Uploading… 100%" with the scrubber disabled. Root cause: the
   * auto first-frame capture HUNG on iOS Safari (the off-DOM <video>
   * the capture used was never decoded), AND the "done" state was
   * chained behind the capture completing.
   *
   * Three coupled invariants the fix establishes — provable from
   * source so a regression can't slip past Dallen's iPhone again
   * (a browser-driven test would need a real decodable phone-shot
   * MP4 fixture and a stubbed Vercel-Blob PUT endpoint; same shape
   * as the rest of A7d's wiring proofs).
   */
  test.describe('A7d.8.1 — iOS hang fix (decouple + timeout + off-screen render)', () => {
    test('done-state is decoupled from auto-capture: setUploading(false) runs BEFORE the capture await', () => {
      const src = readFileSync(FIELD, 'utf8');

      // setUploading(false) lives BEFORE the captureFrameBlob await
      // for the auto first-frame, not in a finally below it. A capture
      // that never resolves therefore cannot leave the field stuck on
      // "Uploading… 100%".
      const uploadFalseIdx = src.indexOf('setUploading(false)');
      const captureAwaitIdx = src.indexOf('await captureFrameBlob(nextObjectUrl');
      expect(uploadFalseIdx).toBeGreaterThan(0);
      expect(captureAwaitIdx).toBeGreaterThan(0);
      expect(uploadFalseIdx).toBeLessThan(captureAwaitIdx);

      // The onChange that delivers the hosted URL to the parent also
      // fires BEFORE the capture — the parent's runtime auto-fill +
      // value population must not wait on the optional poster.
      const onChangeIdx = src.indexOf('onChange(\n      hostedUrl');
      expect(onChangeIdx).toBeGreaterThan(0);
      expect(onChangeIdx).toBeLessThan(captureAwaitIdx);
    });

    test('scrubber + "Use this frame" are NOT gated on autoCapturing (only on capturingFrame)', () => {
      const src = readFileSync(FIELD, 'utf8');

      // Helper — pull out just the `disabled={…}` clause for the JSX
      // element carrying a given data-testid. We can't rely on
      // attribute-span regexes here because the same elements have
      // `onChange={(e) => { /* with "quoted" comments */ }}` attrs
      // that confuse a naïve brace/quote scanner. Instead: locate the
      // opening tag by walking backward to the nearest `<input` or
      // `<button`, slice the attribute region up to the data-testid,
      // then brace-count from `disabled={` forward to its closing `}`.
      // The `disabled` attribute itself never contains nested JS
      // expressions or comments, so a plain depth counter suffices.
      const getDisabledClause = (testid: string): string => {
        const testidLiteral = `data-testid={tid("${testid}")}`;
        const tIdx = src.indexOf(testidLiteral);
        expect(tIdx).toBeGreaterThan(0);
        const tagBoundary = Math.max(
          src.lastIndexOf('<input', tIdx),
          src.lastIndexOf('<button', tIdx),
        );
        expect(tagBoundary).toBeGreaterThan(0);
        const attrRegion = src.slice(tagBoundary, tIdx);
        const dIdx = attrRegion.indexOf('disabled={');
        if (dIdx < 0) return '';
        const dStart = dIdx + 'disabled={'.length;
        let depth = 1;
        for (let i = dStart; i < attrRegion.length; i++) {
          const c = attrRegion[i];
          if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) return attrRegion.slice(dStart, i);
          }
        }
        throw new Error(`unterminated disabled={…} for ${testid}`);
      };

      // The slider's disabled attribute references capturingFrame only.
      // autoCapturing remains a status hint, not a gate.
      expect(getDisabledClause('scrubber-range')).toBe('capturingFrame');
      expect(getDisabledClause('scrubber-use')).toBe(
        'scrubTime === null || capturingFrame',
      );
      // Replace + Remove also must NOT be gated on autoCapturing —
      // they need to be live the moment the upload is done.
      expect(getDisabledClause('replace')).toBe('uploading || capturingFrame');
      expect(getDisabledClause('remove')).toBe('uploading || capturingFrame');
    });

    test('captureFrameBlob is bounded by a hard timeout and mounts off-screen renderable', () => {
      const src = readFileSync(FIELD, 'utf8');

      // 1) A hard timeout constant exists and is wired into the
      //    promise via setTimeout → reject. A hang in iOS-Safari
      //    decode is converted into a soft-fail (the brief's "must be
      //    impossible to hang" criterion).
      expect(src).toMatch(/FRAME_CAPTURE_TIMEOUT_MS\s*=\s*4000/);
      expect(src).toMatch(/setTimeout\(\s*\(\)\s*=>/);
      expect(src).toMatch(/frame capture timed out/);

      // 2) The off-screen capture video is MOUNTED to document.body
      //    (iOS Safari only decodes a video that's actually in
      //    layout — an unmounted or display:none element silently
      //    never paints a frame, which was the 2026-05-23 root cause).
      expect(src).toMatch(/document\.body\.appendChild\(video\)/);
      // It's still off-screen (1×1px, opacity 0) — laid out, not
      // visible — and it's NOT class "hidden" (display:none).
      expect(src).toMatch(/position:\s*"absolute"/);
      expect(src).toMatch(/width:\s*"1px"/);
      expect(src).toMatch(/opacity:\s*"0"/);

      // 3) Decode-force: muted-inline play()/pause() bounce primes
      //    the iOS decoder before the seek so a painted frame can
      //    actually land. Muted inline autoplay is permitted on iOS
      //    without a user gesture.
      expect(src).toMatch(/video\.play\(\)/);
      expect(src).toMatch(/video\.pause\(\)/);

      // 4) Painted-frame await: requestVideoFrameCallback when
      //    available (Safari 15.4+) — it fires on a true painted
      //    frame, dodging the iOS "seeked fired but the buffer is
      //    empty" race. Falls back to seeked + rAF.
      expect(src).toMatch(/requestVideoFrameCallback/);
      expect(src).toMatch(/requestAnimationFrame\(draw\)/);

      // 5) Cleanup tears down the mounted element on EVERY resolution
      //    path (resolve, reject, timeout), so the body never grows a
      //    stray off-screen <video> per upload.
      expect(src).toMatch(/parentNode\.removeChild\(video\)/);
    });

    test('in-DOM scrubber-preview <video> is mounted off-screen renderable, not display:none', () => {
      const src = readFileSync(FIELD, 'utf8');

      // The in-DOM capture-source video (bound to captureVideoRef +
      // used by the live scrub-preview canvas pipeline) must NOT be
      // className="hidden". On iOS Safari that CSS rule (display:none)
      // caused the live preview to silently never paint a frame.
      //
      // Anchor by the unique `ref={captureVideoRef}` prop so the match
      // can't slide into the user-facing <video> above.
      const captureBlock = src.match(
        /<video\s+ref=\{captureVideoRef\}[\s\S]*?\/>/,
      );
      expect(captureBlock).toBeTruthy();
      expect(captureBlock![0]).not.toMatch(/className=["']hidden["']/);
      // It has an inline style anchoring it off-screen but in layout
      // (1×1px, opacity 0, absolutely positioned).
      expect(captureBlock![0]).toMatch(/position:\s*["']absolute["']/);
      expect(captureBlock![0]).toMatch(/opacity:\s*0/);
      // And it still carries the testid the wizard relies on.
      expect(captureBlock![0]).toMatch(
        /data-testid=\{tid\("capture-source"\)\}/,
      );
    });

    test('seller page omits the poster attribute when the cascade is empty', () => {
      const pageSrc = readFileSync(
        resolve(
          process.cwd(),
          'src/tools/seller-presentation/output/presentation-page.tsx',
        ),
        'utf8',
      );

      // The <video> on the seller page conditionally spreads poster
      // so an empty effectivePosterUrl renders WITHOUT a poster
      // attribute. With preload="metadata" the browser then paints
      // the native first frame — far better than the black box that
      // poster="" produces.
      const videoBlock = pageSrc.match(
        /<video[\s\S]*?data-testid="sep-video-el"[\s\S]*?\/>/,
      );
      expect(videoBlock).toBeTruthy();
      expect(videoBlock![0]).toMatch(/\{\.\.\.\(poster \? \{ poster \} : \{\}\)\}/);
      expect(videoBlock![0]).toContain('preload="metadata"');
      // The hard `poster={poster}` shape is GONE — that was the form
      // that could emit poster="" when the cascade returned empty.
      expect(videoBlock![0]).not.toMatch(/(?<!\.\.\.\()poster=\{poster\}/);
    });

    test('a never-blank fixture with NO poster fields still renders a non-blank video', async ({
      page,
    }) => {
      // The most paranoid version of the never-blank promise: if all
      // three poster slots are empty (cascade returns undefined), the
      // <video> still renders WITHOUT a poster attribute and the
      // browser's preload="metadata" path paints a native first frame.
      // Tests the renderer's omission rule end-to-end. The auto-only
      // fixture already covers the happy path.
      await page.goto(
        '/seller-presentation-preview?fixture=poster-none',
      );
      const video = page.getByTestId('sep-video-el');
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute('data-poster-source', 'none');
      // The poster attribute must be ABSENT — not present as "".
      // toHaveAttribute throws when the attribute is absent, so use
      // an evaluate to assert on the raw DOM.
      const hasPoster = await video.evaluate((el) =>
        (el as HTMLVideoElement).hasAttribute('poster'),
      );
      expect(hasPoster).toBe(false);
      // preload="metadata" is what lets the browser paint a native
      // first frame in lieu of a poster.
      await expect(video).toHaveAttribute('preload', 'metadata');
    });
  });
});
