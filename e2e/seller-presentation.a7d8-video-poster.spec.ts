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

/**
 * Strip JS/JSX block + line comments out of a TS source string so
 * source-grep assertions don't false-positive on prose mentions of
 * JSX-shaped tokens (e.g. `<video controls playsInline>` in a JSDoc
 * preamble, or `crossOrigin="anonymous"` in a "why we removed it"
 * comment).
 *
 * For block comments, the `/*` opener must NOT be preceded by a
 * word/quote char — otherwise `accept="video/*"` (a legitimate JSX
 * MIME-pattern attribute, not the start of a comment) would be
 * mis-detected as a comment opener and we'd eat through to the next
 * unrelated `*​/` and lose huge chunks of real code.
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^"'`\w])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/\/\/[^\n]*/g, '');
}

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
      await page.getByTestId('step-property-city').fill('Tacoma');
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
      //    frame 0 until a seek lands. A7d.11 moved the call site from
      //    handleFile's local `nextObjectUrl` to a completion effect
      //    that reads `session.localObjectUrl` (aliased to `sourceUrl`
      //    for the inner async closure) — same semantics, survives a
      //    mid-upload remount.
      expect(src).toMatch(/captureFrameBlob\(sourceUrl,\s*0\.1\)/);

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
    test('done-state is decoupled from auto-capture: completion flips the UI BEFORE the capture effect runs', () => {
      const src = readFileSync(FIELD, 'utf8');

      // A7d.11 — the A7d.8.1 invariant was preserved across the
      // refactor, just expressed differently. The session reaches
      // `status: "completed"` (the field's "done" view) the instant
      // the upload's Promise resolves; the auto first-frame capture
      // moved into a SEPARATE `useEffect` that fires only AFTER the
      // session has already transitioned to completed (because the
      // effect depends on `session.status`). React runs effects
      // strictly after render commits, so the field has already
      // rendered the completed UI by the time captureFrameBlob is
      // awaited. A hang in the capture therefore CANNOT freeze the
      // field on "Uploading… 100%" — the same invariant the pre-
      // A7d.11 setUploading(false)-before-await shape encoded.
      expect(src).toMatch(
        /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?session\.status\s*!==\s*["']completed["'][\s\S]*?await\s+captureFrameBlob/,
      );
      // The capture is FIRE-AND-FORGET inside the effect (an inner
      // async IIFE) so a slow / hung capture doesn't block the
      // surrounding render or the completion signal to the parent.
      expect(src).toMatch(
        /useEffect\([\s\S]*?\(\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?captureFrameBlob/,
      );
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

  /*
   * A7d.8.3 — consolidate to ONE preview surface (the main video) +
   * Instagram-style filmstrip + live scrub correlation. Reverses the
   * A7d.8.2 separate-preview-canvas direction after Dallen's 2026-05-23
   * smoke: the A7d.8.2 canvas rendered huge (sized to the clip's
   * intrinsic portrait aspect → filled the screen) and showed BLACK
   * because the off-DOM capture pipeline wasn't actually painting on
   * iOS. The new shape:
   *
   *   - Seek the MAIN visible <video> on slider input — iOS decodes a
   *     visible, in-layout, in-DOM <video> reliably, sidestepping the
   *     off-DOM decode problem entirely. The agent sees the current
   *     frame live in the same window buyers will see.
   *   - A best-effort filmstrip of N pre-extracted thumbnails sits as
   *     a visual scrub track ABOVE the slider; fallback to a plain
   *     slider if extraction soft-fails (the slider still seeks the
   *     main video, so scrubbing always works).
   *   - The separate preview canvas the A7d.8.2 round introduced is
   *     GONE. Portrait clips can't blow up the layout — the main video
   *     keeps its existing aspect-video constraint.
   *
   * All assertions are source-grep — a browser-driven seek-and-paint
   * exercise needs a real decodable MP4 fixture (same shape as the
   * rest of the A7d wiring proofs).
   */
  test.describe('A7d.8.3 — single preview + filmstrip scrub', () => {
    test('the separate A7d.8.2 preview canvas is GONE — only ONE preview surface', () => {
      const src = readFileSync(FIELD, 'utf8');

      // 1) No scrubber-preview-canvas element in source.
      expect(src).not.toContain('scrubber-preview-canvas');
      // 2) No previewCanvasRef / drawPreviewFrame / videoAspect (the
      //    A7d.8.2 plumbing). Their absence proves the canvas pipeline
      //    is fully removed, not just hidden.
      expect(src).not.toMatch(/previewCanvasRef/);
      expect(src).not.toMatch(/drawPreviewFrame/);
      expect(src).not.toMatch(/setVideoAspect/);
      // 3) No second <video> bound to captureVideoRef in the JSX —
      //    the off-DOM scrub source the A7d.8.2 canvas needed is gone
      //    (captureFrameBlob still mounts its own helper-scoped one).
      expect(src).not.toMatch(/<video[\s\S]*?ref=\{captureVideoRef\}/);
      // 4) There is still exactly ONE <video> JSX tag in the component
      //    region — the user-facing preview the slider now seeks. Strip
      //    comments first so JSDoc mentions of "<video>" don't inflate
      //    the count; match JSX-shape openings (whitespace after the
      //    name, which precludes "<video>" in prose).
      const componentEndIdx = src.indexOf('function readVideoDuration(');
      expect(componentEndIdx).toBeGreaterThan(0);
      const componentSrc = src
        .slice(0, componentEndIdx)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      const videoTags = componentSrc.match(/<video\s/g) ?? [];
      expect(videoTags.length).toBe(1);
      expect(componentSrc).toMatch(/<video[\s\S]*?ref=\{mainVideoRef\}/);
    });

    test('slider onChange seeks the MAIN video (no direct currentTime, no await)', () => {
      const src = readFileSync(FIELD, 'utf8');

      // 1) The coalescer pumps against mainVideoRef now, not the old
      //    captureVideoRef. Pin both halves of the indirection.
      const pumpMatch = src.match(/const\s+pumpSeek\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[\s*\]\s*\)/);
      expect(pumpMatch).toBeTruthy();
      expect(pumpMatch![0]).toMatch(/mainVideoRef\.current/);
      expect(pumpMatch![0]).not.toMatch(/captureVideoRef/);

      // 2) The seeked listener targets the main video on src change
      //    (value or localObjectUrl) so a Replace flow re-binds.
      expect(src).toMatch(/const\s+video\s*=\s*mainVideoRef\.current[\s\S]{0,400}addEventListener\(\s*["']seeked["']/);

      // 3) Slider onChange routes through requestSeek and does NOT
      //    set currentTime directly or await any seek (A7d.8.1
      //    invariant — the slider must never freeze).
      const rangeTestidIdx = src.indexOf('data-testid={tid("scrubber-range")}');
      expect(rangeTestidIdx).toBeGreaterThan(0);
      const inputTagStart = src.lastIndexOf('<input', rangeTestidIdx);
      expect(inputTagStart).toBeGreaterThan(0);
      const onChangeIdx = src.indexOf('onChange={', inputTagStart);
      expect(onChangeIdx).toBeGreaterThan(0);
      expect(onChangeIdx).toBeLessThan(rangeTestidIdx);
      const bodyStart = onChangeIdx + 'onChange={'.length;
      let depth = 1;
      let bodyEnd = bodyStart;
      for (let i = bodyStart; i < src.length; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            bodyEnd = i;
            break;
          }
        }
      }
      const onChangeCode = src
        .slice(bodyStart, bodyEnd)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(onChangeCode).toMatch(/requestSeek\(/);
      expect(onChangeCode).not.toMatch(/\.currentTime\s*=/);
      expect(onChangeCode).not.toMatch(/\bawait\b/);
    });

    test('coalescer is retained — last-wins prevents seek backlog under fast drags', () => {
      const src = readFileSync(FIELD, 'utf8');

      // Same coalescer-shape rules as A7d.8.2 carried forward: refs (not
      // state), pump bails when busy, seeked re-pumps the latest target.
      expect(src).toMatch(/pendingSeekRef\s*=\s*useRef/);
      expect(src).toMatch(/seekInFlightRef\s*=\s*useRef/);
      expect(src).toMatch(/const\s+pumpSeek\s*=/);
      expect(src).toMatch(/if\s*\(\s*seekInFlightRef\.current\s*\)\s*return/);
      expect(src).toMatch(
        /if\s*\(\s*pendingSeekRef\.current\s*!==\s*null\s*\)\s*pumpSeek\(\)/,
      );
    });

    test('main preview <video> sources localObjectUrl while available, hosted URL after reload', () => {
      const src = readFileSync(FIELD, 'utf8');

      // The main video's src falls back from local (fast random-access
      // seek) to hosted (post-reload). The local source is the same
      // one canvas.toBlob() reads from for "Use this frame" — so the
      // WYSIWYG promise holds (same bytes, same time).
      const mainVideoBlock = src.match(
        /<video[\s\S]*?ref=\{mainVideoRef\}[\s\S]*?\/>/,
      );
      expect(mainVideoBlock).toBeTruthy();
      expect(mainVideoBlock![0]).toMatch(/src=\{localObjectUrl\s*\?\?\s*value\}/);
      // Layout safety: aspect-video keeps portrait clips from blowing
      // up the picker — they letterbox inside the constrained frame.
      expect(mainVideoBlock![0]).toMatch(/aspect-video/);
      // Still controls + playsInline so the agent can also play/scrub
      // natively when they're done picking.
      expect(mainVideoBlock![0]).toMatch(/\bcontrols\b/);
      expect(mainVideoBlock![0]).toMatch(/playsInline/);
    });

    test('filmstrip pre-extraction exists, is bounded, and is best-effort fallback', () => {
      const src = readFileSync(FIELD, 'utf8');

      // 1) The helper exists with a total wall-clock budget. Hangs
      //    convert to "resolve with whatever we got" rather than
      //    reject — the strip is purely a visual aid and the slider
      //    works without it.
      expect(src).toMatch(/FILMSTRIP_TOTAL_TIMEOUT_MS\s*=\s*6000/);
      expect(src).toMatch(/async function extractFilmstripFrames/);
      expect(src).toMatch(/setTimeout\(/);

      // 2) Reuses the A7d.8.1 decode-safe machinery on a single
      //    off-screen renderable <video> (mounted in layout, opacity 0)
      //    and walks N seeks serially. Decode-force + painted-frame
      //    await (rVFC w/ seeked fallback) are present.
      const helperIdx = src.indexOf('async function extractFilmstripFrames');
      expect(helperIdx).toBeGreaterThan(0);
      const helperSrc = src.slice(helperIdx);
      expect(helperSrc).toMatch(/document\.body\.appendChild\(video\)/);
      expect(helperSrc).toMatch(/position:\s*["']absolute["']/);
      expect(helperSrc).toMatch(/opacity:\s*["']0["']/);
      expect(helperSrc).toMatch(/video\.play\(\)/);
      expect(helperSrc).toMatch(/video\.pause\(\)/);
      expect(helperSrc).toMatch(/requestVideoFrameCallback/);
      expect(helperSrc).toMatch(/parentNode\.removeChild\(video\)/);

      // 3) Result is best-effort: per-frame failure skips the frame,
      //    and the outer promise NEVER rejects. The component treats
      //    [] as "fall back to a plain slider".
      expect(helperSrc).not.toMatch(/Promise<string\[\]>\s*\([\s\S]*?reject/);
      expect(src).toMatch(/Promise<string\[\]>/);

      // 4) The component renders the strip conditionally on
      //    filmstripFrames.length > 0 — empty array hides the strip
      //    cleanly, leaving the slider as the sole scrub control.
      expect(src).toMatch(/filmstripFrames\.length\s*>\s*0/);
    });

    test('filmstrip extraction does NOT gate the upload-done state (A7d.8.1 invariant)', () => {
      const src = readFileSync(FIELD, 'utf8');

      // The filmstrip kicks via a useEffect reactive to localObjectUrl,
      // NOT from inside handleFile. That structural decoupling means the
      // upload-done state (setUploading(false) + onChange(hostedUrl))
      // can NEVER be chained behind filmstrip extraction landing.
      const handleFileMatch = src.match(
        /const\s+handleFile\s*=\s*async[\s\S]*?\n\s*\};\s*\n/,
      );
      expect(handleFileMatch).toBeTruthy();
      const handleFileSrc = handleFileMatch![0];
      // No call to extractFilmstripFrames inside handleFile.
      expect(handleFileSrc).not.toMatch(/extractFilmstripFrames\s*\(/);
      // No `await` on it anywhere either — fire-and-forget by design.
      expect(src).not.toMatch(/await\s+extractFilmstripFrames\s*\(/);

      // The scrubber + Use-this-frame + Replace + Remove disabled
      // attributes are STILL not gated on the filmstrip extraction —
      // the strip is purely visual and never blocks the slider.
      expect(src).not.toMatch(/disabled=\{[^}]*filmstripStatus[^}]*\}/);
      expect(src).not.toMatch(/disabled=\{[^}]*filmstripFrames[^}]*\}/);
    });

    test('filmstrip thumbnails are data URLs in state — hosted-URL guard for FINAL poster intact', () => {
      const src = readFileSync(FIELD, 'utf8');

      // The filmstrip thumbs are ephemeral UI hints (component state
      // only) so canvas.toDataURL() is acceptable here. But the
      // PERSISTED poster ("Use this frame" → onPosterChange) still
      // routes through uploadCapturedFrame which rejects a non-hosted
      // URL — that's the sep-photo-upload-requirement rule.
      expect(src).toMatch(/canvas\.toDataURL\(/);
      expect(src).toMatch(/non-hosted URL/);
      expect(src).toContain('/api/upload-image');
      // Sanity: the "Use this frame" path goes via the main-video
      // capture helper (A7d.8.4 — draw the previewed <video>) +
      // uploadCapturedFrame, NOT via the filmstrip data URL.
      expect(src).toMatch(/captureFrameFromVideoElement\(\s*video\s*\)/);
      expect(src).toMatch(/await\s+uploadCapturedFrame\(/);
    });
  });

  /*
   * A7d.8.4 — two thumbnail-picker bugs from Dallen's 2026-05-23 smoke.
   *
   *   1) DISCREPANCY: the frame the agent picked in the scrubber didn't
   *      match the poster on the published landing page. Root cause —
   *      "Use this frame" captured from a SEPARATE off-screen <video>
   *      seeked independently of the main preview, so two decoders
   *      could land on different painted frames at the same timestamp.
   *      Fix — draw the MAIN visible <video> element directly. Same
   *      element, same currentTime, same painted bytes.
   *
   *   2) PICKER VANISHES → FORCES VIDEO RE-UPLOAD: after viewing the
   *      landing page and returning to the editor, the scrubber was
   *      gone because it gated on the in-memory `localObjectUrl`. Fix
   *      — gate on (localObjectUrl OR persisted hosted URL) and mark
   *      the main <video> as crossOrigin="anonymous" so the hosted-URL
   *      canvas draw is taint-free (Vercel Blob serves CORS).
   *
   * Source-grep assertions in the same shape as A7d.8.1 / .8.3 — a
   * full browser-driven exercise needs a real decodable MP4 fixture
   * plus a CORS-clean stubbed hosted endpoint.
   */
  test.describe('A7d.8.4 — WYSIWYG + scrubber persists from hosted URL (no re-upload)', () => {
    test('WYSIWYG — "Use this frame" captures from the MAIN previewed <video>, not an independent off-screen decode', () => {
      const src = readFileSync(FIELD, 'utf8');

      // 1) The commit path uses the new captureFrameFromVideoElement
      //    helper, called with mainVideoRef.current (renamed `video`).
      //    The OLD captureFrameBlob(localObjectUrl, scrubTime) shape
      //    is GONE — pin its absence so a regression can't slip back.
      expect(src).toMatch(/captureFrameFromVideoElement\(\s*video\s*\)/);
      expect(src).not.toMatch(/captureFrameBlob\(localObjectUrl,\s*scrubTime\)/);

      // 2) handleUseThisFrame reads mainVideoRef.current at the top.
      //    The captured frame is therefore drawn from the SAME element
      //    the slider just seeked — the agent's preview IS the bytes
      //    that ship as the poster.
      const fn = src.match(
        /const\s+handleUseThisFrame\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n\s*\};\s*\n/,
      );
      expect(fn).toBeTruthy();
      expect(fn![0]).toMatch(/const\s+video\s*=\s*mainVideoRef\.current/);
      expect(fn![0]).toMatch(/captureFrameFromVideoElement\(\s*video\s*\)/);
      // Still routes the resulting blob through the hosted uploader.
      expect(fn![0]).toMatch(/uploadCapturedFrame\(/);
      // Auto first-frame (captureFrameBlob) is unaffected — it runs
      // before the main video has mounted/decoded and intentionally
      // uses its own off-screen pipeline. A7d.11 renamed the local
      // variable (was `nextObjectUrl` inside handleFile, now
      // `sourceUrl` inside the completion effect's closure).
      expect(src).toMatch(/captureFrameBlob\(sourceUrl,\s*0\.1\)/);
    });

    test('captureFrameFromVideoElement draws the live element and is bounded by the same hard timeout', () => {
      const src = readFileSync(FIELD, 'utf8');

      const helperIdx = src.indexOf(
        'function captureFrameFromVideoElement(',
      );
      expect(helperIdx).toBeGreaterThan(0);
      // Slice to the START of the NEXT helper so the assertions only
      // see this helper's body (the file also defines captureFrameBlob
      // and extractFilmstripFrames, which DO mount their own
      // off-screen <video>s and would false-positive a naive slice).
      const nextHelperIdx = src.indexOf('function ', helperIdx + 10);
      expect(nextHelperIdx).toBeGreaterThan(helperIdx);
      const helperSrc = src.slice(helperIdx, nextHelperIdx);
      // drawImage is called on the passed-in video element (the live
      // main preview), NOT on a freshly-mounted off-screen one.
      expect(helperSrc).toMatch(/ctx\.drawImage\(\s*video\s*,/);
      expect(helperSrc).not.toMatch(/document\.body\.appendChild\(video\)/);
      // Painted-frame await is the same iOS-safe pattern as A7d.8.1:
      // requestVideoFrameCallback (preferred) → rAF → draw. We DO wait
      // for an in-flight seek to settle before drawing so the slider's
      // last-wins coalescer can't land a stale frame.
      expect(helperSrc).toMatch(/requestVideoFrameCallback/);
      expect(helperSrc).toMatch(/requestAnimationFrame\(draw\)/);
      expect(helperSrc).toMatch(/video\.seeking/);
      // Hard timeout converts any hang into a soft-fail (same shape +
      // same message as captureFrameBlob, so the existing UI handling
      // works unchanged).
      expect(helperSrc).toMatch(/FRAME_CAPTURE_TIMEOUT_MS/);
      expect(helperSrc).toMatch(/frame capture timed out/);
      // canvas.toBlob output (image/jpeg) — matches the upload route.
      expect(helperSrc).toMatch(/canvas\.toBlob\(/);
      expect(helperSrc).toMatch(/image\/jpeg/);
    });

    test('scrubber appears on remount from the hosted URL alone — no local File required', () => {
      const src = readFileSync(FIELD, 'utf8');

      // Old gate: `localObjectUrl && duration && duration > 0 && …`
      // — the scrubber vanished after the wizard remounted because
      // localObjectUrl was reset to null.
      // New gate: `(localObjectUrl || value) && duration && …` — the
      // scrubber stays available whenever ANY video exists (local OR
      // persisted hosted URL). Pin the new shape.
      expect(src).toMatch(
        /\(localObjectUrl\s*\|\|\s*value\)\s*&&\s*duration\s*&&\s*duration\s*>\s*0\s*&&\s*onPosterChange/,
      );
      // Belt-and-suspenders: the old single-arm gate is GONE so a
      // refactor can't accidentally reintroduce the re-upload trap.
      expect(src).not.toMatch(
        /\{\s*localObjectUrl\s*&&\s*duration\s*&&\s*duration\s*>\s*0\s*&&\s*onPosterChange\s*&&/,
      );
    });

    test('main <video> attaches crossOrigin="anonymous" on the hosted-URL path so canvas capture is taint-free', () => {
      const src = stripComments(readFileSync(FIELD, 'utf8'));

      const mainVideoBlock = src.match(
        /<video\s[\s\S]*?ref=\{mainVideoRef\}[\s\S]*?\/>/,
      );
      expect(mainVideoBlock).toBeTruthy();
      // A7d.8.5 made this conditional — set ONLY on the hosted-URL
      // path (revisit) and OMITTED on the local blob: objectURL path
      // (in-session). The literal `crossOrigin: "anonymous"` still
      // appears in source, just inside a conditional spread; the
      // taint-free behavior on the hosted path remains the contract.
      expect(mainVideoBlock![0]).toMatch(/crossOrigin:\s*"anonymous"/);
    });

    test('A7d.8.5 — crossOrigin is CONDITIONAL: omitted on local blob: URL, set on hosted URL', () => {
      const src = stripComments(readFileSync(FIELD, 'utf8'));

      const mainVideoBlock = src.match(
        /<video\s[\s\S]*?ref=\{mainVideoRef\}[\s\S]*?\/>/,
      );
      expect(mainVideoBlock).toBeTruthy();
      // The attribute is GONE as a static JSX attr — it's now spread
      // from a ternary on localObjectUrl. The literal JSX shape
      // `crossOrigin="anonymous"` (attribute syntax) must NOT appear
      // — that would be the unconditional regression A7d.8.5 fixes.
      expect(mainVideoBlock![0]).not.toMatch(/crossOrigin="anonymous"/);
      // The new shape: conditional spread that resolves to
      // `crossOrigin: "anonymous"` (object property) ONLY when
      // localObjectUrl is falsy.
      expect(mainVideoBlock![0]).toMatch(
        /\{\.\.\.\(localObjectUrl\s*\?\s*\{\}\s*:\s*\{\s*crossOrigin:\s*"anonymous"[\s\S]*?\}\)\}/,
      );
    });

    test('re-thumbnailing on revisit uploads only the IMAGE — the video is never re-uploaded', () => {
      const src = readFileSync(FIELD, 'utf8');

      // The thumbnail commit path uses /api/upload-image (small frame
      // bytes), NOT /api/upload-video. The video file is uploaded
      // exactly once, by handleFile via the @vercel/blob client SDK.
      const useFrameFn = src.match(
        /const\s+handleUseThisFrame\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n\s*\};\s*\n/,
      );
      expect(useFrameFn).toBeTruthy();
      expect(useFrameFn![0]).not.toMatch(/upload-video/);
      expect(useFrameFn![0]).not.toMatch(/@vercel\/blob\/client/);
      expect(useFrameFn![0]).toMatch(/uploadCapturedFrame\(/);

      // The uploadCapturedFrame helper itself targets /api/upload-image
      // (auth-gated, size-capped) — the video upload route is reachable
      // ONLY from the file-picker handleFile flow.
      const uploadHelper = src.match(
        /async\s+function\s+uploadCapturedFrame[\s\S]*?\n\}\s*\n/,
      );
      expect(uploadHelper).toBeTruthy();
      expect(uploadHelper![0]).toContain('/api/upload-image');
      expect(uploadHelper![0]).not.toMatch(/upload-video/);

      // handleFile (the only path that runs upload() on the video) is
      // ONLY invoked from the hidden <input type="file"> onChange —
      // not from any thumbnail action.
      expect(src).toMatch(
        /void\s+handleFile\(file\)/,
      );
    });
  });

  /*
   * A7d.8.5 — capture-reliability fix. Dallen's 2026-05-23 real-iPhone
   * smoke: tapping "Use this frame" returned "frame capture timed out"
   * and the published landing page rendered the video section as a
   * solid black box. Two coupled root causes:
   *
   *   1) requestVideoFrameCallback as SOLE resolver. On iOS Safari rVFC
   *      only fires for a NEW frame being presented (during playback or
   *      right after a seek paints). For the paused, static frame the
   *      agent stares at while tapping "Use this frame", rVFC never
   *      fires → the 4 s FRAME_CAPTURE_TIMEOUT_MS hits → reject →
   *      no poster. The same rVFC-only pattern in captureFrameBlob
   *      (auto first-frame) was unreliable for the same reason.
   *
   *   2) Posterless <video> on iOS = solid black box. The "native first
   *      frame" fallback the renderer relies on doesn't actually paint
   *      on iOS Safari for a fresh page load with preload="metadata".
   *      So when capture failed for every slot, the page was visibly
   *      blank — even though we OMIT the empty `poster=""` correctly.
   *
   * Fixes:
   *   A) rVFC is now wired as an OPTIONAL accelerator RACED against the
   *      rAF / seeked path. The rAF path is the iOS-reliable primary;
   *      whichever fires first calls `draw`, the loser sees `landed`
   *      and bails. Capture resolves well under timeoutMs even when
   *      rVFC stays silent.
   *   B) crossOrigin="anonymous" on the main <video> is CONDITIONAL —
   *      omitted for local blob: URLs (where it's a no-op in spec but
   *      has been seen to introduce a brief not-ready state on iOS).
   *   C) Wrapper data-no-poster + CSS branded panel as the last-ditch
   *      safety net for the rare case where all three poster slots are
   *      empty.
   *
   * All source-grep — a browser-driven device-only failure mode (rVFC
   * silence on a static paused frame) is not exercisable in Chromium.
   */
  test.describe('A7d.8.5 — capture reliability on iOS (rVFC race, conditional crossOrigin, never-blank)', () => {
    test('captureFrameFromVideoElement does NOT block solely on rVFC — rAF is the reliable primary', () => {
      const src = readFileSync(FIELD, 'utf8');

      const helperIdx = src.indexOf(
        'function captureFrameFromVideoElement(',
      );
      expect(helperIdx).toBeGreaterThan(0);
      const nextHelperIdx = src.indexOf('function ', helperIdx + 10);
      expect(nextHelperIdx).toBeGreaterThan(helperIdx);
      const helperSrc = src.slice(helperIdx, nextHelperIdx);

      // rVFC is wired (for capable browsers as an accelerator) but
      // NOT inside an if/else where it's the sole-when-available
      // branch — that was the pre-A7d.8.5 regression. The new
      // structure ALWAYS schedules an rAF path; rVFC is fired in
      // parallel and the first to land calls `draw`.
      expect(helperSrc).toMatch(/requestVideoFrameCallback/);

      // The race land flag: a single `draw` call regardless of which
      // resolver arrived first (rVFC OR rAF OR seeked-on-seeking).
      expect(helperSrc).toMatch(/landed\s*=\s*false/);
      expect(helperSrc).toMatch(/if\s*\(\s*landed\s*\)\s*return/);
      expect(helperSrc).toMatch(/landed\s*=\s*true/);

      // The reliable rAF path is present — that's what lands on
      // iOS where rVFC stays silent. Double rAF is intentional: one
      // schedules the next paint, the second runs AFTER it presents.
      expect(helperSrc).toMatch(
        /requestAnimationFrame\(\s*\(\)\s*=>\s*requestAnimationFrame\(/,
      );
      // The OLD shape — `if (rvfc) { rvfc(...) } else { rAF(draw) }`
      // — is GONE. Pinning the absence of the if/else gate prevents
      // a regression where someone "simplifies" back to rVFC-only.
      expect(helperSrc).not.toMatch(
        /if\s*\(\s*rvfc\s*\)\s*\{\s*rvfc\([\s\S]*?\)\s*\}\s*else\s*\{\s*requestAnimationFrame\(\s*draw\s*\)/,
      );

      // Wait-for-seek-first remains: when a coalesced seek is in
      // flight, we listen for seeked THEN race the painted-frame
      // resolvers. Bypassing this would risk capturing a stale frame.
      expect(helperSrc).toMatch(/video\.seeking/);
      expect(helperSrc).toMatch(/addEventListener\(\s*["']seeked["']/);
    });

    test('captureFrameBlob (auto first-frame) also races rVFC against seeked — no SOLE resolver', () => {
      const src = readFileSync(FIELD, 'utf8');

      const helperIdx = src.indexOf('function captureFrameBlob(');
      expect(helperIdx).toBeGreaterThan(0);
      // Slice up to the start of the NEXT helper so the assertions
      // only see captureFrameBlob's body (the file also defines
      // captureFrameFromVideoElement and extractFilmstripFrames,
      // which would false-positive this scope.)
      const nextHelperIdx = src.indexOf('function ', helperIdx + 10);
      expect(nextHelperIdx).toBeGreaterThan(helperIdx);
      const helperSrc = src.slice(helperIdx, nextHelperIdx);

      // BOTH resolvers arm — seeked listener AND rVFC (when present).
      // First to fire calls draw via landAndDraw; the loser bails.
      expect(helperSrc).toMatch(
        /addEventListener\(\s*["']seeked["']\s*,\s*\(\)\s*=>\s*landAndDraw\(\)/,
      );
      expect(helperSrc).toMatch(/if\s*\(\s*rvfc\s*\)/);
      expect(helperSrc).toMatch(/rvfc\(\s*\(\)\s*=>\s*landAndDraw\(\)/);
      expect(helperSrc).toMatch(/landed\s*=\s*true/);

      // The pre-A7d.8.5 SOLE-resolver shape (`if (rvfc) { rvfc(...) }
      // else { seeked }`) is GONE — both arm together now, no
      // either/or, so iOS rVFC silence can't strand the capture.
      expect(helperSrc).not.toMatch(
        /if\s*\(\s*rvfc\s*\)\s*\{\s*rvfc\([\s\S]*?\)\s*\}\s*else\s*\{\s*video\.addEventListener\(\s*["']seeked["']/,
      );
    });

    test('main <video> conditional crossOrigin keeps local blob: src attribute-free', () => {
      const src = stripComments(readFileSync(FIELD, 'utf8'));

      const mainVideoBlock = src.match(
        /<video\s[\s\S]*?ref=\{mainVideoRef\}[\s\S]*?\/>/,
      );
      expect(mainVideoBlock).toBeTruthy();
      // No literal JSX attribute — that's the unconditional shape
      // that introduced the iOS not-ready race for blob: URLs.
      expect(mainVideoBlock![0]).not.toMatch(/crossOrigin="anonymous"/);
      // The conditional spread sets it ONLY when localObjectUrl is
      // falsy (revisit case, src is the hosted URL). The local-file
      // case omits the attribute entirely so iOS Safari treats the
      // blob: src as the same-origin source it actually is.
      expect(mainVideoBlock![0]).toMatch(
        /\{\.\.\.\(localObjectUrl\s*\?\s*\{\}\s*:\s*\{\s*crossOrigin:/,
      );
    });

    test('seller page marks the no-poster wrapper for the branded fallback panel', () => {
      const pageSrc = readFileSync(
        resolve(
          process.cwd(),
          'src/tools/seller-presentation/output/presentation-page.tsx',
        ),
        'utf8',
      );

      // The .video-poster wrapper carries data-no-poster="true" only
      // when the cascade is empty (poster is falsy). Conditional
      // spread keeps the happy-path DOM unchanged for the auto/scrub/
      // override cases the existing precedence tests already pin.
      const wrapperBlock = pageSrc.match(
        /<div[\s\S]*?className="video-poster reveal"[\s\S]*?>/,
      );
      expect(wrapperBlock).toBeTruthy();
      expect(wrapperBlock![0]).toMatch(
        /\{\.\.\.\(poster\s*\?\s*\{\}\s*:\s*\{\s*"data-no-poster":\s*"true"\s*\}\)\}/,
      );
    });

    test('seller page CSS renders a branded fallback panel for [data-no-poster]', () => {
      const cssSrc = readFileSync(
        resolve(
          process.cwd(),
          'src/tools/seller-presentation/output/presentation-page.css',
        ),
        'utf8',
      );

      // The wrapper rule exists, uses existing surface tokens (no new
      // hardcoded colours), and the inner .video-player goes
      // transparent so the wrapper's gradient shows through whatever
      // the paused video would otherwise paint as black on iOS.
      expect(cssSrc).toMatch(
        /\.video-poster\[data-no-poster="true"\]\s*\{[\s\S]*?background:[\s\S]*?linear-gradient/,
      );
      expect(cssSrc).toMatch(
        /\.video-poster\[data-no-poster="true"\]\s+\.video-player\s*\{[\s\S]*?background:\s*transparent/,
      );
      // No new hex colours snuck in — uses the existing CSS variables.
      const noPosterRule = cssSrc.match(
        /\.video-poster\[data-no-poster="true"\]\s*\{[\s\S]*?\}/,
      );
      expect(noPosterRule).toBeTruthy();
      expect(noPosterRule![0]).toMatch(/var\(--/);
    });

    test('a no-poster fixture renders the branded panel marker on the wrapper', async ({
      page,
    }) => {
      // End-to-end: the renderer actually emits the data-no-poster
      // attribute when the cascade is empty. The CSS rule above
      // hooks off the same attribute selector, so this is the proof
      // the safety net is plumbed all the way through.
      await page.goto('/seller-presentation-preview?fixture=poster-none');
      const wrapper = page.getByTestId('sep-video-player');
      await expect(wrapper).toBeVisible();
      await expect(wrapper).toHaveAttribute('data-no-poster', 'true');
      // The <video> itself still renders posterless (existing
      // never-blank-fixture test pins that contract); this attribute
      // is on the wrapper so the CSS can swap the surface without
      // touching the video element.
      const video = page.getByTestId('sep-video-el');
      await expect(video).toHaveAttribute('data-poster-source', 'none');
    });

    test('happy-path posters do NOT carry the data-no-poster marker', async ({
      page,
    }) => {
      // When ANY poster slot resolves, the safety-net marker MUST be
      // absent so the standard .video-poster surface (which already
      // sits behind the loading poster image) stays in place.
      await page.goto('/seller-presentation-preview?fixture=poster-auto-only');
      const wrapper = page.getByTestId('sep-video-player');
      await expect(wrapper).toBeVisible();
      const hasMarker = await wrapper.evaluate((el) =>
        el.hasAttribute('data-no-poster'),
      );
      expect(hasMarker).toBe(false);
    });
  });
});
