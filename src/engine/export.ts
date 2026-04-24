"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

// Single-threaded core: no SharedArrayBuffer / COOP+COEP required.
const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

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
 */
export async function recordCanvas(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps = 30,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const stream = canvas.captureStream(fps);

  const mimeCandidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) {
    throw new Error("This browser does not support WebM recording.");
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    recorder.onerror = (e) =>
      reject(new Error(`MediaRecorder error: ${String(e)}`));

    recorder.start(100);

    const startTime = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(1, elapsed / durationSec);
      onProgress?.(progress);
      if (elapsed < durationSec) {
        requestAnimationFrame(tick);
      } else {
        try {
          recorder.stop();
        } catch (err) {
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
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));

    // Scale to target size (forces exact output dimensions for Instagram).
    // -pix_fmt yuv420p ensures compatibility with all players including Instagram.
    // -movflags +faststart puts metadata at the start so the file streams well.
    await ffmpeg.exec([
      "-i",
      "input.webm",
      "-vf",
      `scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=decrease,pad=${targetSize.width}:${targetSize.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      "30",
      "output.mp4",
    ]);

    const data = await ffmpeg.readFile("output.mp4");
    if (typeof data === "string") {
      throw new Error("Unexpected text data from ffmpeg output.");
    }
    return new Blob([data], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    // Best-effort cleanup; ignore if files don't exist.
    try {
      await ffmpeg.deleteFile("input.webm");
    } catch {}
    try {
      await ffmpeg.deleteFile("output.mp4");
    } catch {}
  }
}

/**
 * Trigger a browser download of the given Blob with the given filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
