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
    "video/mp4;codecs=avc1.42E01E", // Safari/iOS native
    "video/mp4",
  ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) {
    throw new Error(
      "This browser does not support video recording. Please use Chrome, Safari 14.1+, or Edge."
    );
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
  durationSec: number,
  onProgress?: (progress: number) => void
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
    await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));

    // Force exact output duration:
    //  - tpad clones the last frame for durationSec extra seconds
    //  - -t trims output to exactly durationSec
    //  - -r 30 normalizes output framerate at the output stage
    //  - ultrafast preset trades file size for speed (Instagram re-encodes
    //    anyway, so file size doesn't matter; speed shaves ~30-50% off conversion)
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      `tpad=stop_mode=clone:stop_duration=${durationSec},scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=decrease,pad=${targetSize.width}:${targetSize.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "-t",
      String(durationSec),
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
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
    return new Blob([buffer], { type: "video/mp4" });
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
