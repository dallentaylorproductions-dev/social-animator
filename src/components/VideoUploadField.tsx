"use client";

import { useRef, useState } from "react";

/**
 * VideoUploadField — phone-camera-roll → hosted-URL uploader
 * for short walk-through video (v1.47 / A7d.3).
 *
 * Mirrors `ImageUploadField`'s contract — `label`, `value`,
 * `onChange(url)` — so the StepEditorial wiring is one for one.
 * Differences from the image variant:
 *
 *   - Camera-roll ONLY. No "paste a URL" fallback — Dallen's
 *     2026-05-22 brief calls for in-app upload + inline playback,
 *     and a paste-URL surface would re-introduce the link-out
 *     pattern we're killing.
 *   - HARD client-side caps: 90 s duration, 75 MiB size. Files
 *     over either cap are rejected with a plain-language message
 *     BEFORE any upload starts (margin guardrail: SEP pages are
 *     1:1, so the per-file size × views math has to stay tight).
 *   - Duration is read via a hidden <video> element's
 *     `loadedmetadata` event. No transcoding — ffmpeg.wasm would
 *     bloat the bundle, and real adaptive streaming is the
 *     Cloudflare Stream upgrade path (the storage adapter seam
 *     lets us flip there without touching this component).
 *   - `onDuration(seconds)` fires after a successful upload so the
 *     parent can auto-fill the Runtime field (StepEditorial does).
 *
 * The hosted URL is what gets persisted in `draft.video.videoUrl`;
 * the seller page renders it inline via <video controls playsInline>.
 */

interface VideoUploadFieldProps {
  /** Label shown above the field. */
  label: string;
  /** Current hosted URL, or empty string. */
  value: string;
  /**
   * Called with the hosted URL after a successful upload, or "" on
   * remove. On upload, the source video's duration in seconds is
   * passed as a second argument so the caller can fill a sibling
   * field (e.g. runtime auto-fill) ATOMICALLY in the same setState —
   * otherwise two back-to-back updates that both read draft.video
   * would clobber each other under the rapid microtask flush that
   * follows fetch resolution.
   */
  onChange: (url: string, durationSeconds?: number) => void;
  /** Optional subfolder for the Blob path. */
  folder?: string;
  /** test id prefix; the inner elements suffix this. */
  testIdPrefix?: string;
  /** Help text shown below the field. */
  helpText?: string;
}

export const VIDEO_MAX_DURATION_SECONDS = 90;
export const VIDEO_MAX_BYTES = 75 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function VideoUploadField({
  label,
  value,
  onChange,
  folder,
  testIdPrefix,
  helpText,
}: VideoUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tid = (suffix: string) =>
    testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined;

  const handleFile = async (file: File) => {
    setError(null);

    // Quick MIME guard (the picker's accept="video/*" already
    // narrows things; iOS can still surface oddballs).
    if (!file.type.startsWith("video/")) {
      setError("That file isn't a video.");
      return;
    }

    if (!ALLOWED_MIME.has(file.type)) {
      setError(
        `Unsupported video format (${file.type}). Try MP4, MOV, or WebM.`,
      );
      return;
    }

    if (file.size > VIDEO_MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      const cap = Math.round(VIDEO_MAX_BYTES / (1024 * 1024));
      setError(
        `That video is ${mb} MB, over the ${cap} MB limit. Trim it on your phone and try again.`,
      );
      return;
    }

    // Read duration BEFORE upload so an over-cap file never burns
    // bandwidth. Falls through with a clear error if metadata fails
    // to load (very rare; usually a corrupt file).
    let durationSeconds: number;
    try {
      durationSeconds = await readVideoDuration(file);
    } catch {
      setError(
        "Couldn't read this video's length. Try a different file or format.",
      );
      return;
    }

    if (
      Number.isFinite(durationSeconds) &&
      durationSeconds > VIDEO_MAX_DURATION_SECONDS
    ) {
      const seconds = Math.round(durationSeconds);
      setError(
        `That video is ${seconds} seconds, over the ${VIDEO_MAX_DURATION_SECONDS}-second limit. Trim it and try again.`,
      );
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      if (folder) fd.append("folder", folder);
      const res = await fetch("/api/upload-video", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      onChange(
        data.url,
        Number.isFinite(durationSeconds) ? durationSeconds : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
      </label>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        data-testid={tid("file-input")}
      />

      {value ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded border border-neutral-700 bg-black">
            <video
              src={value}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full"
              data-testid={tid("preview")}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800 disabled:opacity-60"
              data-testid={tid("replace")}
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => onChange("")}
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-red-400 disabled:opacity-60"
              data-testid={tid("remove")}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-mint rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center disabled:opacity-60"
          data-testid={tid("upload")}
        >
          {uploading
            ? "Uploading…"
            : "Choose a video from your camera roll"}
        </button>
      )}

      {error && (
        <p
          className="mt-1 text-[11px] text-red-400"
          data-testid={tid("error")}
        >
          {error}
        </p>
      )}

      {helpText && (
        <span className="mt-1 block text-[11px] text-neutral-500">
          {helpText}
        </span>
      )}
    </div>
  );
}

/**
 * Read a video file's duration in seconds via a hidden <video>'s
 * loadedmetadata event. Resolves with the duration or rejects on
 * decode failure. The blob URL is revoked once metadata is read so
 * memory doesn't leak per attempt.
 */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      const d = video.duration;
      cleanup();
      resolve(d);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("video metadata decode failed"));
    };
    video.src = url;
  });
}
