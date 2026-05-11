"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

// Single-threaded core: no SharedArrayBuffer / COOP+COEP required.
const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

/**
 * Pre-roll buffer (ms) before the animation timeline starts. iOS Safari's
 * second sequential canvas.captureStream() takes ~3-4 seconds to start
 * producing real frames; if the animation begins immediately, those entry
 * tracks (which all land within t=3.3s in listing-showcase) get partially
 * or entirely missed by the recorder. During warmup the canvas is held at
 * t=0 — the heartbeat pixel still varies frame-to-frame so the encoder
 * doesn't dedupe — and ffmpeg trims the warmup section out via `-ss` so
 * the final MP4 length matches the duration slider exactly.
 *
 * H-1.8g bumped 5000 → 5500 to absorb a residual ~1s captureStream
 * "stabilization tail" surfacing as black frames at the start of the
 * trimmed output.
 *
 * H-7.1.1 split the constant into a device-gated function: desktop
 * Chromium/WebKit start emitting captureStream frames within ~200ms,
 * so 1500ms is plenty of headroom — saves ~4s of recording floor per
 * export. Mobile (iOS + Android) keeps the 5500ms value to preserve
 * MediaRecorder reliability on Safari, which is the original reason
 * the warmup exists. Same `-ss warmup/1000` placement on both paths,
 * the value just shrinks on desktop.
 */
const WARMUP_MS_DESKTOP = 1500;
const WARMUP_MS_MOBILE = 5500;

export function getWarmupMs(): number {
  return isMobileDevice() ? WARMUP_MS_MOBILE : WARMUP_MS_DESKTOP;
}

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

/**
 * Lazily load ffmpeg.wasm. Calling this multiple times returns the same instance.
 */
export function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();

  return ffmpegLoadPromise;
}

/**
 * Record a canvas for the given duration and return a WebM Blob.
 * Progress callback fires with 0..1 during recording.
 *
 * Mobile/iOS notes:
 *  - mime candidates are ordered with mp4/avc1 first when on mobile so
 *    iOS Safari picks its native encoder up front (it can't do webm);
 *    desktop Chrome/Edge still get vp9/vp8 first via fallthrough.
 *  - Stream tracks get explicitly stopped after recording to release
 *    iOS Safari's hold on the canvas — without this, calling
 *    canvas.captureStream() a second time on the same canvas (e.g.
 *    when the flyer tool exports both reel + square) may yield a
 *    stream that doesn't capture frames on iOS, producing a static
 *    video for the second size.
 */
export async function recordCanvas(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps = 30,
  onProgress?: (progress: number) => void,
  // Defaults to 0 so existing Social Animator callers (ExportButton,
  // BatchExportButton) get unchanged behavior. The listing-flyer path
  // explicitly opts in to getWarmupMs() via renderTimelineToWebm.
  warmupMs: number = 0,
  // H-7.2.4-3: optional periodic canvas snapshot for the loader's
  // LiveThumbnail. Emits a JPEG object URL every PREVIEW_INTERVAL_MS
  // (~500ms). Mirrors the desktop frame-by-frame thumbnail cadence so
  // iOS Safari (which uses this MediaRecorder path) now shows a
  // live preview in the export loader instead of the empty
  // placeholder. Caller is responsible for handling the URL (the
  // engine revokes previous URLs on a delay so the LiveThumbnail
  // crossfade has time to swap).
  onPreview?: (url: string) => void
): Promise<Blob> {
  const stream = canvas.captureStream(fps);

  const isMobile = isMobileDevice();
  const mimeCandidates = isMobile
    ? [
        "video/mp4;codecs=avc1.42E01E", // iOS Safari native
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ]
    : [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4;codecs=avc1.42E01E",
        "video/mp4",
      ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) {
    throw new Error(
      "This browser does not support video recording. Please use Chrome, Safari 14.1+, or Edge."
    );
  }

  const totalSec = warmupMs / 1000 + durationSec;
  console.log(
    `[MP4-DEBUG] recordCanvas: mobile=${isMobile} mime=${mimeType} canvas=${canvas.width}x${canvas.height} duration=${durationSec}s warmup=${(warmupMs / 1000).toFixed(1)}s total=${totalSec.toFixed(1)}s`
  );

  // H-7.1.1: 8M → 4M. The captured webm is intermediate — ffmpeg
  // re-encodes at CRF 18, which is the actual quality lever. Our
  // content is mostly static (Ken Burns subtle zoom, fade-in text,
  // QR pulse) with no high-motion scenes that need 8Mbps source
  // headroom. Halving the source bitrate halves ffmpeg input bytes,
  // shaving meaningful encode time off every export.
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  let chunkCount = 0;
  let totalBytes = 0;
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      chunkCount += 1;
      totalBytes += e.data.size;
    }
  };

  // H-7.2.4-3 live preview snapshot loop. Captures the current
  // canvas as a JPEG every PREVIEW_INTERVAL_MS while recording.
  // Each new URL is emitted to the caller; previous URLs are
  // revoked on a delay so the LiveThumbnail crossfade has time to
  // swap before the source blob is freed (same pattern as the
  // frame-by-frame engine path in src/engine/frame-render.ts).
  // Only runs when an onPreview callback is provided — Social
  // Animator's recordCanvas callers don't pass one, so they pay
  // no cost.
  //
  // H-7.2.4-3.5 added an immediate first snapshot fired via rAF
  // (so the caller's paint loop, registered in renderTimelineToWebm
  // before this function is called, has finished its first frame
  // by the time we capture). Without it, plain setInterval first-
  // fires at t=500ms; with iOS Safari's ~5.5s captureStream
  // warmup tail, the user saw a blank LiveThumbnail for almost
  // the entire warmup window before the first interval tick.
  const PREVIEW_INTERVAL_MS = 500;
  let lastPreviewUrl: string | null = null;
  let previewTimer: ReturnType<typeof setInterval> | null = null;
  const captureSnapshot = () => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const previousUrl = lastPreviewUrl;
        lastPreviewUrl = URL.createObjectURL(blob);
        onPreview?.(lastPreviewUrl);
        if (previousUrl) {
          setTimeout(() => URL.revokeObjectURL(previousUrl), 500);
        }
      },
      "image/jpeg",
      0.6
    );
  };
  const stopPreview = () => {
    if (previewTimer !== null) {
      clearInterval(previewTimer);
      previewTimer = null;
    }
    if (lastPreviewUrl) {
      const toRevoke = lastPreviewUrl;
      setTimeout(() => URL.revokeObjectURL(toRevoke), 2000);
      lastPreviewUrl = null;
    }
  };
  if (onPreview) {
    // First snapshot fires after one rAF tick — the paint loop in
    // renderTimelineToWebm was registered before recordCanvas was
    // called, so by the time this rAF runs the canvas has already
    // been painted with frame 0 of the timeline. User sees a
    // thumbnail within ~16ms of clicking Export instead of having
    // to wait out the warmup window.
    requestAnimationFrame(captureSnapshot);
    previewTimer = setInterval(captureSnapshot, PREVIEW_INTERVAL_MS);
  }

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      stopPreview();
      const blob = new Blob(chunks, { type: mimeType });
      console.log(
        `[MP4-DEBUG] recordCanvas stop: chunks=${chunkCount} totalBytes=${totalBytes} blobSize=${blob.size}`
      );
      // Release the canvas's captureStream tracks so a subsequent
      // captureStream() call on the same canvas gets a fresh stream.
      // iOS Safari otherwise leaves the prior stream in a half-bound
      // state on the second invocation.
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore — best-effort cleanup
      }
      resolve(blob);
    };
    recorder.onerror = (e) => {
      stopPreview();
      reject(new Error(`MediaRecorder error: ${String(e)}`));
    };

    recorder.start(100);
    console.log(`[MP4-DEBUG] recordCanvas: recorder.start() ok, state=${recorder.state}`);

    const startTime = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      // Progress is reported across the FULL recording window
      // (warmup + animation) so the UI bar moves smoothly. The user-facing
      // pacing is unchanged — they always saw a "rendering reel" / "rendering
      // square" stage that took some seconds; this just makes it longer by
      // the warmup amount.
      const progress = Math.min(1, elapsed / totalSec);
      onProgress?.(progress);
      if (elapsed < totalSec) {
        requestAnimationFrame(tick);
      } else {
        const actualDuration = (performance.now() - startTime) / 1000;
        console.log(
          `[MP4-DEBUG] recordCanvas: target ${totalSec.toFixed(1)}s (warmup ${(warmupMs / 1000).toFixed(1)}s + animation ${durationSec}s), actual ${actualDuration.toFixed(2)}s — calling recorder.stop()`
        );
        try {
          recorder.stop();
        } catch (err) {
          stopPreview();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Convert a WebM Blob to an MP4 Blob using ffmpeg.wasm.
 * The output is scaled/padded to exactly targetSize (width x height).
 */
export async function webmToMp4(
  webmBlob: Blob,
  targetSize: { width: number; height: number },
  durationSec: number,
  onProgress?: (progress: number) => void,
  // 0 default = no input skip (existing Social Animator callers). The
  // listing-flyer path passes getWarmupMs() explicitly to trim the warmup
  // section recorded ahead of the animation timeline.
  warmupMs: number = 0
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on("progress", progressHandler);

  // Detect input format from blob type (Safari produces MP4, Chrome produces WebM)
  const inputExt = webmBlob.type.includes("mp4") ? "mp4" : "webm";
  const inputName = `input.${inputExt}`;

  try {
    const inputBytes = await fetchFile(webmBlob);
    console.log(
      `[MP4-DEBUG] webmToMp4: input ${inputName} (${inputBytes.byteLength} bytes, type=${webmBlob.type}) → ${targetSize.width}x${targetSize.height} for ${durationSec}s`
    );
    await ffmpeg.writeFile(inputName, inputBytes);

    // Force exact output duration:
    //  - `-ss warmupSec` AFTER `-i` is an output (decode) seek — frame-
    //    accurate at the cost of decoding the warmup region. For the 5s
    //    warmup the perf hit is negligible; input-side -ss could land
    //    between WebM keyframes and produce a smeared first frame.
    //  - tpad clones the last frame for durationSec extra seconds (defense
    //    against the rAF loop finishing slightly short of target)
    //  - -t trims output to exactly durationSec
    //  - -r 30 normalizes output framerate at the output stage
    //
    // Encoding history:
    //   H-7v:   ultrafast/crf22 → fast/crf18 + High profile
    //           (Instagram re-encode compounds softness on softness)
    //   H-7w:   `medium` → `fast` (encode time was past 60s UX threshold)
    //   H-7.1:  duration-aware `fast` ≤10s, `veryfast` >10s
    //   H-7.1.1 single preset `ultrafast` for all durations. CRF 18
    //           still does the heavy lifting on quality — preset only
    //           controls encode-time vs file-size tradeoff. ffmpeg.wasm
    //           runs 3-5x slower than native; `ultrafast` is what
    //           makes 5s desktop export land under 30s. File grows
    //           ~25% vs `fast` but stays well within social upload
    //           limits, and visual quality after CRF 18 is unchanged.
    const warmupSec = warmupMs / 1000;
    await ffmpeg.exec([
      "-i",
      inputName,
      "-ss",
      String(warmupSec),
      "-vf",
      `tpad=stop_mode=clone:stop_duration=${durationSec},scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=decrease,pad=${targetSize.width}:${targetSize.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "-t",
      String(durationSec),
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);

    const data = await ffmpeg.readFile("output.mp4");
    if (typeof data === "string") {
      throw new Error("Unexpected text data from ffmpeg output.");
    }
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    const out = new Blob([buffer], { type: "video/mp4" });
    console.log(`[MP4-DEBUG] webmToMp4: output ${out.size} bytes`);
    return out;
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {}
    try {
      await ffmpeg.deleteFile("output.mp4");
    } catch {}
  }
}

/**
 * Trigger a browser download of the given Blob with the given filename.
 *
 * iOS Safari notes (the WebKitBlobResource bug):
 *  - target="_blank" forces the new tab so the editor tab is never
 *    navigated. Without this Safari opens the blob inline in the
 *    current tab and a back-nav fails ("WebKitBlobResource error 1"),
 *    losing the editor session.
 *  - Revocation is deferred 60s so the new tab has time to render the
 *    blob. Synchronous revoke (the prior 1s timer was effectively that)
 *    races the tab swap on iOS and produces a blank page.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * On mobile (iOS Safari, Android Chrome), prefer the Web Share API so users can
 * save the file directly to Camera Roll / Photos via the native share sheet.
 * On desktop, or if Share isn't supported, falls back to a regular download.
 *
 * If the user cancels the share sheet, we respect that and don't fall through
 * to a download — they explicitly dismissed.
 */
export type SaveResult = "shared" | "downloaded" | "cancelled";

export async function shareOrDownload(
  blob: Blob,
  filename: string
): Promise<SaveResult> {
  if (typeof navigator === "undefined") {
    return "cancelled";
  }

  const isMobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);

  if (
    isMobile &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return "shared";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Other errors fall through to download
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
}

/** Detect mobile devices for UX branching. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
}
