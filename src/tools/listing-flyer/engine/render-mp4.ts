import { Timeline } from "@/engine/timeline";
import { recordCanvas, WARMUP_MS } from "@/engine/export";

/**
 * Render the given Timeline to a hidden canvas and capture its rAF output as
 * a WebM Blob via MediaRecorder. The caller owns the canvas element (must be
 * mounted in the DOM and appropriately sized — we'll set width/height to
 * `size` here, but layout/styling is the caller's responsibility).
 *
 * Pipeline:
 *  - Resize canvas buffer to size.width × size.height
 *  - Start rAF loop that paints background + timeline.render(t) every frame
 *  - In parallel, recordCanvas captures the canvas's MediaStream for `seconds`
 *  - When recordCanvas resolves, stop the rAF loop and return the blob
 */
export async function renderTimelineToWebm(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  size: { width: number; height: number },
  seconds: number,
  background: string,
  onProgress?: (progress: number) => void,
  warmupMs: number = WARMUP_MS
): Promise<Blob> {
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context on hidden canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let rafId = 0;
  let startTs: number | null = null;
  let frameCount = 0;
  let warmupEndedLogged = false;
  const warmupSec = warmupMs / 1000;
  const totalSec = warmupSec + seconds;
  console.log(
    `[MP4-DEBUG] renderTimelineToWebm: ${size.width}x${size.height} duration=${seconds}s warmup=${warmupSec.toFixed(1)}s bg=${background}`
  );

  const frame = (ts: DOMHighResTimeStamp) => {
    if (startTs === null) startTs = ts;
    const wallT = (ts - startTs) / 1000;
    // The animation timeline is held at t=0 for the warmup period, then
    // advances normally. Wall-clock vs animation-clock split lets iOS's
    // captureStream wake up while the canvas is still being painted (so
    // the encoder is happy + the heartbeat is firing) without the user
    // missing the first 3-4s of the entry sequence.
    const animT = Math.max(0, wallT - warmupSec);

    // Background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);

    timeline.render(animT, ctx);

    // Heartbeat pixel — keeps captureStream emitting frames during static
    // holds (and especially during warmup, where animT is pinned at 0).
    // Varies BOTH the channel value AND the (x,y) position so iOS Safari's
    // captureStream registers each tick as a real frame difference, not
    // a sub-byte alpha change an encoder might dedupe.
    const tick = frameCount % 256;
    ctx.fillStyle = `rgb(${tick},${tick},${tick})`;
    ctx.fillRect(frameCount % 2, 0, 1, 1);

    frameCount += 1;
    if (frameCount % 30 === 0) {
      console.log(
        `[MP4-DEBUG] frame ${frameCount} @ wall=${wallT.toFixed(2)}s anim=${animT.toFixed(2)}s`
      );
    }
    if (!warmupEndedLogged && wallT >= warmupSec) {
      console.log(
        `[MP4-DEBUG] warmup ended at frame ${frameCount} (wall=${wallT.toFixed(2)}s) — animation timeline now advancing`
      );
      warmupEndedLogged = true;
    }

    if (wallT < totalSec + 0.2) {
      rafId = requestAnimationFrame(frame);
    } else {
      // Final-frame log so the in-page debug panel can show whether the
      // rAF loop actually ran for the full window (warmup + animation).
      // Compare this against recordCanvas's actualDuration log to spot a
      // stalled capture.
      console.log(
        `[MP4-DEBUG] rAF stop: total frames=${frameCount} final wall=${wallT.toFixed(2)}s anim=${(wallT - warmupSec).toFixed(2)}s`
      );
    }
  };
  rafId = requestAnimationFrame(frame);

  try {
    return await recordCanvas(canvas, seconds, 30, onProgress, warmupMs);
  } finally {
    if (rafId) cancelAnimationFrame(rafId);
  }
}
