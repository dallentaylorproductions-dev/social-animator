"use client";

import { Timeline } from "./timeline";
import { getFFmpeg, recordCanvas, webmToMp4, getWarmupMs } from "./export";
import { renderTimelineToWebm } from "@/tools/listing-flyer/engine/render-mp4";

/**
 * Frame-by-frame MP4 render pipeline.
 *
 * Architecture (H-7.2.1):
 *   Replaces the MediaRecorder + canvas.captureStream() approach for
 *   the two top-tier composition tools (Listing Flyer + Open House
 *   Promo) with synchronous frame iteration → ffmpeg PNG-sequence
 *   encode. Wins:
 *     - No real-time canvas paint constraint, so heavy compositions
 *       can no longer drop frames in the captured output (vertical
 *       1080×1920 was where the lag manifested most).
 *     - Lossless input to ffmpeg (PNG vs 4Mbps captured stream),
 *       so quality is no longer ceiling-capped by the recorder
 *       bitrate.
 *     - We can afford `preset medium` since we're not racing
 *       wall-clock anymore.
 *
 * Trade-off:
 *   Total render time grows. PNG encoding at 1080×1920 runs
 *   ~80-150ms per frame in browser, so a 15s loop is ~80-130s
 *   end-to-end (5s ~30-40s, 10s ~55-75s). The export-loader UX
 *   (live thumbnail preview, frame counter, rotating tips) is the
 *   compensating change that makes the longer wait tolerable.
 *
 * iOS Safari fallback:
 *   Frame-by-frame is gated off on iOS Safari (< 16.4 lacks
 *   OffscreenCanvas, and even on 16.4+ the ffmpeg.wasm heap holds
 *   ~225-900MB of PNG sequence during encode — risky on iOS Safari's
 *   tighter wasm budget). iOS routes to the existing
 *   MediaRecorder + webmToMp4 path. Desktop + Android Chrome get
 *   the new path. Once iOS smoke-test telemetry confirms whether
 *   iOS users actually see the lag/quality issue desktop users
 *   reported, we can revisit migrating iOS in a separate phase.
 *
 * Social Animator templates (10 templates under
 * /social-animator/*) keep using recordCanvas + webmToMp4 directly
 * — those scenes are smaller and haven't shown the same
 * quality/smoothness complaints. Migrating them is out of scope
 * for this phase.
 */

export interface FrameRenderProgress {
  phase: "rendering" | "encoding" | "finalizing";
  /** 0-1 within the current phase. */
  progress: number;
  /** Current frame index (only set during phase="rendering"). */
  frameIndex?: number;
  /** Total frames the loop will render (only set during phase="rendering"). */
  totalFrames?: number;
  /**
   * Object URL for the most recently rendered frame as a JPEG
   * preview. Caller is responsible for revoking older URLs as new
   * ones arrive — emitted only by the frame-by-frame path; the iOS
   * MediaRecorder path leaves this undefined.
   */
  livePreviewUrl?: string;
}

/**
 * Detect iOS Safari (excluding Chrome/Firefox iOS, which embed
 * UIWebView/WKWebView and ID themselves with CriOS/FxiOS UA tokens).
 * Used to route the export pipeline through the legacy MediaRecorder
 * path until we have iOS smoke-test telemetry validating the
 * frame-by-frame path's memory profile on iOS.
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIOS && isSafari && !isOtherBrowser;
}

/**
 * Render the given timeline to an MP4 Blob. Branches internally:
 * iOS Safari → MediaRecorder + webmToMp4 (existing behavior),
 * else → frame-by-frame + ffmpeg PNG-sequence encode.
 *
 * The `canvas` argument is only used on the iOS path (MediaRecorder
 * needs a DOM canvas to captureStream from). The frame-by-frame
 * path renders to its own OffscreenCanvas / detached HTMLCanvasElement.
 */
export async function renderTimelineToMp4(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  size: { width: number; height: number },
  durationSec: number,
  background: string,
  onProgress?: (p: FrameRenderProgress) => void
): Promise<Blob> {
  if (isIOSSafari()) {
    return renderViaMediaRecorder(
      canvas,
      timeline,
      size,
      durationSec,
      background,
      onProgress
    );
  }
  return renderFrameByFrame(timeline, size, durationSec, background, onProgress);
}

/**
 * Existing iOS-compatible path: real-time MediaRecorder capture
 * followed by webmToMp4 transcode. Wraps the two-step flow behind
 * the unified FrameRenderProgress event shape so callers can use a
 * single progress callback regardless of the underlying pipeline.
 */
async function renderViaMediaRecorder(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  size: { width: number; height: number },
  durationSec: number,
  background: string,
  onProgress?: (p: FrameRenderProgress) => void
): Promise<Blob> {
  // H-7.2.4-3: live preview comes in on a separate cadence
  // (every ~500ms) from progress (per-rAF). Track both in
  // closure-local state and re-emit FrameRenderProgress whenever
  // either updates so the loader's LiveThumbnail receives blob
  // URLs alongside the regular progress ticks.
  let lastProgress = 0;
  let lastPreviewUrl: string | undefined;
  const emitRendering = () =>
    onProgress?.({
      phase: "rendering",
      progress: lastProgress,
      livePreviewUrl: lastPreviewUrl,
    });

  const webm = await renderTimelineToWebm(
    canvas,
    timeline,
    size,
    durationSec,
    background,
    (p) => {
      lastProgress = p;
      emitRendering();
    },
    undefined,
    (url) => {
      lastPreviewUrl = url;
      emitRendering();
    }
  );
  const mp4 = await webmToMp4(
    webm,
    size,
    durationSec,
    (p) => onProgress?.({ phase: "encoding", progress: p }),
    getWarmupMs()
  );
  onProgress?.({ phase: "finalizing", progress: 1 });
  return mp4;
}

/**
 * Frame-by-frame path: iterate every frame at 30fps, write a PNG
 * to ffmpeg.wasm's virtual filesystem, then encode the sequence
 * to MP4 with `-preset medium -crf 18`. Yields to the UI thread
 * every 5 frames so the loader animation stays responsive during
 * the long render loop.
 */
async function renderFrameByFrame(
  timeline: Timeline,
  size: { width: number; height: number },
  durationSec: number,
  background: string,
  onProgress?: (p: FrameRenderProgress) => void
): Promise<Blob> {
  const fps = 30;
  const totalFrames = Math.round(durationSec * fps);

  const { canvas, ctx } = createRenderCanvas(size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const ffmpeg = await getFFmpeg();

  // Defensive cleanup before render. Two leak sources to scrub:
  //   1. A previous render that crashed mid-loop and left frames
  //      behind in ffmpeg's virtual filesystem.
  //   2. A previous render that was LONGER than this one and
  //      cleaned up only its own range — leftover frame_NNNNN.png
  //      files past `totalFrames` would still be present and get
  //      picked up by the upcoming `frame_%05d.png` demuxer,
  //      polluting the encode.
  // Scrubbing the worst-case range (MAX_DURATION × fps = 450)
  // every time covers both. Best-effort — deleteFile throws on
  // missing files which we swallow.
  await cleanupFrameFiles(MAX_FRAME_SLOTS);

  // Live preview thumbnail — emitted every THUMB_EVERY frames as a
  // small JPEG object URL so the loader can show a crossfading
  // miniature of the export coming together.
  //
  // H-7.2.2b dropped the capture frequency 10→30 (~1 thumb per
  // second @ 30fps) AND switched from immediate revoke to a
  // 500ms-delayed revoke. The old immediate-revoke pattern was
  // tearing down the previous URL before the LiveThumbnail
  // component's crossfade had a chance to render it, producing
  // visible strobing + occasional broken-image fallbacks. The
  // delay gives the new <img> time to swap in via its onLoad
  // handler before the old blob disappears.
  const THUMB_EVERY = 30;
  let lastThumbUrl: string | null = null;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);
    timeline.render(t, ctx);

    const blob = await canvasToBlob(canvas, "image/png");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    const filename = frameFilename(i);
    await ffmpeg.writeFile(filename, buffer);

    // Capture a thumbnail every THUMB_EVERY frames. JPEG q=0.6
    // is plenty for a 90×160 / 140×140 preview and encodes much
    // faster than another PNG. The previous URL is revoked on a
    // 500ms timer (see THUMB_EVERY block above) so the LiveThumbnail
    // crossfade has time to swap before the source blob is freed.
    let livePreviewUrl: string | undefined;
    if (i % THUMB_EVERY === 0 || i === totalFrames - 1) {
      const thumbBlob = await canvasToBlob(canvas, "image/jpeg", 0.6);
      const previousUrl = lastThumbUrl;
      lastThumbUrl = URL.createObjectURL(thumbBlob);
      livePreviewUrl = lastThumbUrl;
      if (previousUrl) {
        setTimeout(() => URL.revokeObjectURL(previousUrl), 500);
      }
    }

    onProgress?.({
      phase: "rendering",
      progress: (i + 1) / totalFrames,
      frameIndex: i + 1,
      totalFrames,
      livePreviewUrl,
    });

    // Yield to the event loop every 5 frames so the loader's
    // framer-motion animations and tip rotation stay smooth.
    if (i % 5 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  onProgress?.({ phase: "encoding", progress: 0 });

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.({
      phase: "encoding",
      progress: Math.min(1, Math.max(0, progress)),
    });
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.exec([
      "-framerate",
      String(fps),
      "-i",
      "frame_%05d.png",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);

    onProgress?.({ phase: "finalizing", progress: 0.5 });

    const data = await ffmpeg.readFile("output.mp4");
    if (typeof data === "string") {
      throw new Error("Unexpected text data from ffmpeg output.");
    }
    const arrayBuffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(arrayBuffer).set(data);
    const out = new Blob([arrayBuffer], { type: "video/mp4" });

    onProgress?.({ phase: "finalizing", progress: 1 });
    return out;
  } finally {
    ffmpeg.off("progress", progressHandler);
    // Memory cleanup: delete the PNG sequence + output file from
    // ffmpeg.wasm's virtual filesystem so subsequent exports in
    // the same session don't accumulate the prior export's
    // ~225-900MB working set. Scrub the worst-case range so a
    // future shorter render's defensive cleanup catches any
    // missed slots (see comment at the top of the function for
    // why this matters).
    await cleanupFrameFiles(MAX_FRAME_SLOTS);
    try {
      await ffmpeg.deleteFile("output.mp4");
    } catch {
      // best-effort
    }
    // Revoke the final thumbnail URL after a generous 2s delay so
    // the loader's completion celebration has time to keep
    // displaying it. The blob owner (the page) has already gotten
    // its mp4 result by this point — the only remaining consumer
    // is the loader UI which dismisses well within 2s.
    if (lastThumbUrl) {
      const toRevoke = lastThumbUrl;
      setTimeout(() => URL.revokeObjectURL(toRevoke), 2000);
    }
  }
}

/**
 * Worst-case slot count for the PNG sequence cleanup loop.
 * 15s × 30fps = 450 frames is the longest export the duration
 * slider allows (MAX_MP4_DURATION). Anything past that doesn't
 * exist on disk, so deleteFile no-ops harmlessly inside the
 * best-effort catch.
 */
const MAX_FRAME_SLOTS = 15 * 30;

/**
 * Create a render-target canvas at the requested size. Prefers
 * OffscreenCanvas (faster compositing, no DOM repaint pressure)
 * but falls back to a detached HTMLCanvasElement on platforms
 * that lack OffscreenCanvas — rare in 2026 but the fallback is
 * cheap defense.
 */
function createRenderCanvas(
  width: number,
  height: number
): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable.");
    // OffscreenCanvasRenderingContext2D and CanvasRenderingContext2D
    // share the entire surface area Timeline.render() touches
    // (fillStyle, fillRect, drawImage, save/restore, etc.). The cast
    // bridges TS without any runtime branching at the timeline level.
    return {
      canvas,
      ctx: ctx as unknown as CanvasRenderingContext2D,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  return { canvas, ctx };
}

/**
 * Encode a render-target canvas to a Blob. OffscreenCanvas exposes
 * `convertToBlob`; HTMLCanvasElement uses `toBlob`. Both produce a
 * PNG by default but we pass the type explicitly so the contract
 * is clear at the call site.
 */
function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
      quality
    );
  });
}

function frameFilename(index: number): string {
  return `frame_${String(index).padStart(5, "0")}.png`;
}

async function cleanupFrameFiles(totalFrames: number): Promise<void> {
  const ffmpeg = await getFFmpeg();
  for (let i = 0; i < totalFrames; i++) {
    try {
      await ffmpeg.deleteFile(frameFilename(i));
    } catch {
      // best-effort — the file may not exist (defensive cleanup)
    }
  }
}
