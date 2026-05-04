import { Timeline } from "@/engine/timeline";
import { recordCanvas } from "@/engine/export";

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
  onProgress?: (progress: number) => void
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
  console.log(
    `[MP4-DEBUG] renderTimelineToWebm: ${size.width}x${size.height} duration=${seconds}s bg=${background}`
  );

  const frame = (ts: DOMHighResTimeStamp) => {
    if (startTs === null) startTs = ts;
    const t = (ts - startTs) / 1000;

    // Background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);

    timeline.render(t, ctx);

    // Heartbeat pixel — keeps captureStream emitting frames during static
    // holds. Vary BOTH the channel value (mod 256, so the pixel actually
    // changes color frame-to-frame, not just sub-byte alpha that an
    // encoder might dedupe) AND the (x,y) position so iOS Safari's
    // captureStream registers each tick as a real frame difference.
    const tick = frameCount % 256;
    ctx.fillStyle = `rgb(${tick},${tick},${tick})`;
    ctx.fillRect(frameCount % 2, 0, 1, 1);

    frameCount += 1;
    if (frameCount % 30 === 0) {
      console.log(
        `[MP4-DEBUG] frame ${frameCount} @ t=${t.toFixed(2)}s`
      );
    }

    if (t < seconds + 0.2) {
      rafId = requestAnimationFrame(frame);
    }
  };
  rafId = requestAnimationFrame(frame);

  try {
    return await recordCanvas(canvas, seconds, 30, onProgress);
  } finally {
    if (rafId) cancelAnimationFrame(rafId);
  }
}
