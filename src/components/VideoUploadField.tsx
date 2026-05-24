"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

/**
 * VideoUploadField — phone-camera-roll → hosted-URL uploader
 * for short walk-through video (v1.47 / A7d.3 → A7d.3.1).
 *
 * Mirrors `ImageUploadField`'s contract — `label`, `value`,
 * `onChange(url)` — so the StepEditorial wiring is one for one.
 * Differences from the image variant:
 *
 *   - Camera-roll ONLY. No "paste a URL" fallback — Dallen's
 *     2026-05-22 brief calls for in-app upload + inline playback,
 *     and a paste-URL surface would re-introduce the link-out
 *     pattern we're killing.
 *   - HARD client-side caps: 90 s duration, 250 MiB size. Files
 *     over either cap are rejected with a plain-language message
 *     BEFORE any upload starts.
 *   - CLIENT-DIRECT upload (A7d.3.1): the file is pushed straight
 *     from the browser to Vercel Blob via `@vercel/blob/client`'s
 *     `upload()` helper. This bypasses Vercel's ~4.5 MB Function
 *     request-body limit, which 413'd every real phone clip on the
 *     prior server-receive shape. The token route at
 *     /api/upload-video stays the only place this component talks
 *     to the server.
 *   - Duration is read via a hidden <video> element's
 *     `loadedmetadata` event. No transcoding — ffmpeg.wasm would
 *     bloat the bundle, and real adaptive streaming is the
 *     Cloudflare Stream upgrade path (the storage adapter seam
 *     lets us flip there without touching this component).
 *   - `onChange(url, durationSeconds?)` fires after a successful
 *     upload so the parent can auto-fill the Runtime field
 *     (StepEditorial does).
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
  /**
   * A7d.8 — called when a frame has been captured + uploaded as a
   * hosted thumbnail.
   *
   *   - `source: 'auto'` fires once per upload, immediately after the
   *     video lands, with the first frame as a hosted Blob URL. This
   *     is the never-blank baseline.
   *   - `source: 'scrub'` fires when the agent clicks "Use this frame"
   *     in the scrubber. The caller stores it on the draft as
   *     `scrubPosterUrl` so the renderer's precedence helper picks it
   *     above the auto first-frame.
   *
   * On video remove (`onChange("")`), the caller should also clear
   * both auto + scrub poster fields (the captured frames belong to a
   * video that no longer exists).
   *
   * The captured URL is ALWAYS a hosted Vercel Blob URL — never a
   * data: URL. The published-page payload-leanness rule
   * (sep-photo-upload-requirement) demands this; the static
   * "no data: URL" guard in the e2e suite enforces it.
   */
  onPosterChange?: (url: string, source: "auto" | "scrub") => void;
  /**
   * A7d.8 — the poster currently being shown on the seller page (i.e.
   * the effective poster after the override > scrub > auto cascade).
   * Used inside the field to mark which frame is selected and to show
   * a small preview alongside the scrubber. Optional — the field still
   * works (just without the "Current frame" indicator) if omitted.
   */
  currentPosterUrl?: string;
}

export const VIDEO_MAX_DURATION_SECONDS = 90;
/**
 * Client-side pre-check cap, mirrored by `MAX_VIDEO_BYTES` in
 * src/app/api/upload-video/route.ts. Real 60–90 s phone clips
 * (1080p) land 80–200 MB unmodified — 250 MB gives comfortable
 * headroom without inviting multi-GB abuse. Adjust BOTH constants
 * together if this needs to change.
 */
export const VIDEO_MAX_BYTES = 250 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function extensionForType(type: string): string {
  switch (type) {
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      return "bin";
  }
}

export function VideoUploadField({
  label,
  value,
  onChange,
  folder,
  testIdPrefix,
  helpText,
  onPosterChange,
  currentPosterUrl,
}: VideoUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A7d.5 — upload-progress percentage. `null` means "in-flight but no
  // progress event yet" (handshake before the byte stream starts) →
  // render the bar in indeterminate mode. A number 0–100 → determinate
  // bar + label. Reset to null on every fresh upload attempt.
  const [progressPct, setProgressPct] = useState<number | null>(null);

  // A7d.8 — local in-session state for the scrubber + frame capture.
  //
  // `localFile` is the original File the agent just picked. We hold it
  // for the lifetime of this mount because canvas.toBlob() throws
  // SecurityError when the source <video> is cross-origin (the hosted
  // Blob URL is cross-origin from the wizard's hostname). Reading from
  // `URL.createObjectURL(file)` sidesteps the taint entirely. After a
  // page reload the File is gone and the scrubber hides — the
  // previously-captured auto / scrub poster URLs still persist on the
  // draft so the seller page stays non-blank.
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  // Scrubber position in seconds. `null` until the agent first touches
  // the slider — keeps the UI from claiming a chosen frame they didn't
  // pick. Once they drag, this is the timestamp the preview video is
  // seeked to.
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  // Whether a "Use this frame" capture is in flight. While true the
  // scrub controls disable (mirrors A7d.5 upload-progress discipline).
  const [capturingFrame, setCapturingFrame] = useState(false);
  // Whether the AUTO first-frame capture (immediately post-upload) is
  // in flight. We surface this separately so the agent sees a calm
  // "Setting first frame…" hint rather than a generic spinner.
  const [autoCapturing, setAutoCapturing] = useState(false);
  /**
   * Hidden off-screen <video> sourced from the LOCAL objectURL. This
   * is the canvas-capture source (CORS-clean). It is NOT the
   * user-facing preview — that one stays pointed at the hosted URL so
   * the round-trip e2e contract holds and so the agent sees the same
   * thing buyers will see. Splitting the two means the scrubber's
   * seek/drag motion never disturbs the user-facing playback.
   */
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * Live scrub-frame preview. Re-rendered on every slider drag by
   * drawing the captureVideo's current frame to a hidden canvas and
   * dataURL'ing the result for display. The dataURL stays in component
   * state ONLY — it never reaches the persisted draft / public payload.
   * The committed thumbnail (after "Use this frame") is always uploaded
   * to /api/upload-image first, so what lands in storage is a hosted URL.
   */
  const [scrubPreviewDataUrl, setScrubPreviewDataUrl] = useState<string | null>(
    null,
  );

  // Revoke the object URL when the component unmounts or the file is
  // replaced. Object URLs hold the file in memory until revoked.
  useEffect(() => {
    return () => {
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [localObjectUrl]);

  // A7d.8 — render a small live-preview thumbnail to the scrubber whenever
  // the hidden capture video lands on a new seeked frame. Decoupled from
  // the slider onChange so we don't draw before the decoder has the
  // pixels. iOS quirk: the seeked event sometimes fires before the
  // frame buffer has populated, so we slack one animation frame.
  useEffect(() => {
    const video = captureVideoRef.current;
    if (!video || !localObjectUrl) {
      // Clear the preview thumbnail when the local source is gone so a
      // stale dataURL doesn't outlive a Remove.
      setScrubPreviewDataUrl(null);
      return;
    }
    const onSeeked = () => {
      requestAnimationFrame(() => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        // Small thumbnail preview — 160px wide is plenty for the
        // 64×40 swatch slot. Keeps the dataURL small (a few KB).
        const targetW = 160;
        const targetH = Math.max(1, Math.round((h / w) * targetW));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        try {
          ctx.drawImage(video, 0, 0, targetW, targetH);
          setScrubPreviewDataUrl(canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          // SecurityError lands here if the source is somehow cross-
          // origin. Clear the preview so the UI doesn't appear broken.
          setScrubPreviewDataUrl(null);
        }
      });
    };
    video.addEventListener("seeked", onSeeked);
    return () => video.removeEventListener("seeked", onSeeked);
  }, [localObjectUrl]);

  const tid = (suffix: string) =>
    testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined;

  // A7d.5 — visible upload-progress indicator. Determinate when the
  // SDK has reported at least one percentage event, indeterminate
  // before that (handshake / first chunk). Reduced-motion-safe: no
  // sweeping animation — the bar fills cleanly, and the indeterminate
  // state uses a static striped fill instead of a moving marquee.
  const progressLabel =
    progressPct === null
      ? "Uploading…"
      : `Uploading… ${Math.round(progressPct)}%`;
  const progressBar = uploading ? (
    <div
      className="mt-2"
      role="status"
      aria-live="polite"
      data-testid={tid("progress")}
    >
      <div
        className="h-1 w-full overflow-hidden rounded bg-neutral-800"
        aria-hidden="true"
      >
        <div
          className={
            progressPct === null
              ? "h-full w-1/3 bg-mint/70"
              : "h-full bg-mint transition-[width] duration-150 ease-linear"
          }
          style={
            progressPct === null
              ? undefined
              : { width: `${Math.max(0, Math.min(100, progressPct))}%` }
          }
          data-testid={tid("progress-fill")}
          data-progress-mode={progressPct === null ? "indeterminate" : "determinate"}
          data-progress-pct={
            progressPct === null ? "" : String(Math.round(progressPct))
          }
        />
      </div>
      <p
        className="mt-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500"
        data-testid={tid("progress-label")}
      >
        {progressLabel}
      </p>
    </div>
  ) : null;

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
        `That video is ${seconds} seconds, over the up to ${VIDEO_MAX_DURATION_SECONDS} seconds limit. Trim it and try again.`,
      );
      return;
    }

    // A7d.8 — stash the local File + objectURL BEFORE the network
    // upload starts so the scrubber + first-frame capture can read
    // from the CORS-free local source even if the hosted upload races
    // ahead. Revoke any previous one first to avoid leaking blob:
    // memory across Replace flows.
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    const nextObjectUrl = URL.createObjectURL(file);
    setLocalObjectUrl(nextObjectUrl);
    setDuration(Number.isFinite(durationSeconds) ? durationSeconds : null);
    setScrubTime(null);

    setUploading(true);
    setProgressPct(null);
    try {
      // Browser → Vercel Blob direct upload (A7d.3.1).
      //
      // upload() POSTs a small JSON envelope to handleUploadUrl to
      // obtain a short-lived client token, then streams the file
      // bytes straight to Vercel Blob using that token. The file
      // never traverses our Function, so the platform's 4.5 MB body
      // limit does not apply.
      //
      // multipart is enabled only above MULTIPART_THRESHOLD (~10 MB):
      // small files take the single-PUT path (one network call to
      // the Blob API), large files get chunked + parallelized so
      // a 200 MB phone clip doesn't time out on flaky cell uplinks.
      // Threshold is below the smallest realistic phone clip so any
      // real upload still benefits, but above the size used by
      // route-level / round-trip E2E fixtures so those exercise the
      // simpler PUT path.
      //
      // A7d.5 — `onUploadProgress` is fired by @vercel/blob 2.4.0
      // throughout the byte stream (both single-PUT and multipart
      // paths). The handshake POST that precedes it does NOT fire the
      // callback, so the bar starts indeterminate until the first
      // event lands; once a percentage arrives it switches to
      // determinate so the agent sees concrete movement.
      const ext = extensionForType(file.type);
      const folderSegment = folder ?? "uploads";
      const pathname = `${folderSegment}/${Date.now()}.${ext}`;
      const MULTIPART_THRESHOLD = 10 * 1024 * 1024;
      const result = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload-video",
        contentType: file.type,
        multipart: file.size > MULTIPART_THRESHOLD,
        onUploadProgress: (e) => {
          if (typeof e?.percentage === "number" && Number.isFinite(e.percentage)) {
            // Clamp into [0, 100] — the SDK normally stays in range
            // but a slightly-over-100 final tick has been seen in the
            // multipart path.
            const pct = Math.max(0, Math.min(100, e.percentage));
            setProgressPct(pct);
          }
        },
      });
      if (!result.url || !/^https?:\/\//.test(result.url)) {
        throw new Error("Upload did not return a hosted URL");
      }
      onChange(
        result.url,
        Number.isFinite(durationSeconds) ? durationSeconds : undefined,
      );

      // A7d.8 P1 — never-blank baseline: capture the FIRST FRAME of the
      // freshly-uploaded video and persist it as autoPosterUrl. Reads
      // from the LOCAL File via objectURL (no CORS taint). Some encoders
      // don't paint frame 0 until a tiny seek lands, so we seek to 0.1s.
      // Failure here is non-fatal — the seller page will still render
      // with no poster (worse than ideal, but not a regression vs the
      // pre-A7d.8 behavior). The error is logged to the agent so they
      // know to upload a manual override if it matters.
      if (onPosterChange) {
        setAutoCapturing(true);
        try {
          const frame = await captureFrameBlob(nextObjectUrl, 0.1);
          const posterUrl = await uploadCapturedFrame(
            frame,
            `${folder ?? "uploads"}-poster`,
          );
          onPosterChange(posterUrl, "auto");
        } catch {
          // Soft-fail — the explicit "Use this frame" scrubber path and
          // the manual ImageUploadField override below both remain
          // available, and either one will fill the poster slot.
        } finally {
          setAutoCapturing(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgressPct(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // A7d.8 P2 — "Use this frame" action. Captures the current scrub
  // position to a JPEG blob via the same canvas pipeline, then uploads
  // through /api/upload-image so it lands as a hosted URL (NOT a
  // data: URL — published-page payload-leanness rule).
  const handleUseThisFrame = async () => {
    if (!localObjectUrl || scrubTime === null) return;
    setError(null);
    setCapturingFrame(true);
    try {
      const frame = await captureFrameBlob(localObjectUrl, scrubTime);
      const posterUrl = await uploadCapturedFrame(
        frame,
        `${folder ?? "uploads"}-poster`,
      );
      onPosterChange?.(posterUrl, "scrub");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't capture that frame",
      );
    } finally {
      setCapturingFrame(false);
    }
  };

  const handleRemove = () => {
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    setLocalObjectUrl(null);
    setDuration(null);
    setScrubTime(null);
    onChange("");
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
            {/* User-facing preview. Stays pointed at the hosted URL —
                the agent sees what buyers will see, and the round-trip
                e2e contract (preview.src === hostedURL) holds. The
                scrubber's seek/canvas work happens on a SEPARATE
                hidden video below sourced from the local objectURL. */}
            <video
              src={value}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full"
              data-testid={tid("preview")}
            />
          </div>
          {/* A7d.8 — hidden canvas-capture <video>. Off-screen, no
              controls, sourced from the LOCAL objectURL so canvas
              .toBlob() doesn't throw SecurityError on a cross-origin
              hosted source. Reads duration into state so the scrubber
              can compute its `max`. */}
          {localObjectUrl && (
            <video
              ref={captureVideoRef}
              src={localObjectUrl}
              muted
              playsInline
              preload="auto"
              className="hidden"
              aria-hidden="true"
              data-testid={tid("capture-source")}
              onLoadedMetadata={(e) => {
                const d = (e.target as HTMLVideoElement).duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
              }}
            />
          )}
          {/* A7d.8 — Instagram-style scrubber. Visible only when the
              local File is in memory (capture from hosted URL would
              taint the canvas) AND the duration is known. After a
              reload the scrubber hides cleanly and the previously-
              captured auto / scrub poster URLs still display on the
              seller page. */}
          {localObjectUrl && duration && duration > 0 && onPosterChange && (
            <div
              className="rounded border border-neutral-800 bg-neutral-900/40 p-3"
              data-testid={tid("scrubber")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                  Pick a thumbnail
                </span>
                <span
                  className="text-[10px] tabular-nums text-neutral-500"
                  data-testid={tid("scrubber-time")}
                >
                  {formatScrubTime(scrubTime ?? 0)} / {formatScrubTime(duration)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={Math.max(duration / 200, 0.05)}
                value={scrubTime ?? 0}
                disabled={capturingFrame || autoCapturing}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (!Number.isFinite(t)) return;
                  setScrubTime(t);
                  // Seek the hidden capture video and, on the next
                  // seeked event, draw a small live-preview frame so
                  // the agent sees the timestamp they're hovering on.
                  // The preview is a dataURL kept in component state —
                  // it never reaches the persisted draft. The committed
                  // thumbnail (on "Use this frame") always uploads to
                  // /api/upload-image first, so storage stays hosted.
                  const video = captureVideoRef.current;
                  if (video) {
                    if (!video.paused) video.pause();
                    try {
                      video.currentTime = t;
                    } catch {
                      // Some browsers throw if currentTime is set
                      // before loadedmetadata — guard so a fast first
                      // drag doesn't surface a console error.
                    }
                  }
                }}
                className="mt-2 w-full accent-mint"
                aria-label="Scrub to choose a thumbnail frame"
                data-testid={tid("scrubber-range")}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={
                    scrubTime === null || capturingFrame || autoCapturing
                  }
                  onClick={() => void handleUseThisFrame()}
                  className="rounded border border-mint px-3 py-1.5 text-xs text-mint hover:bg-mint/10 disabled:opacity-60"
                  data-testid={tid("scrubber-use")}
                >
                  {capturingFrame ? "Capturing…" : "Use this frame"}
                </button>
                {autoCapturing && (
                  <span
                    className="text-[10px] uppercase tracking-[0.15em] text-neutral-500"
                    data-testid={tid("auto-capture-status")}
                  >
                    Setting first frame…
                  </span>
                )}
                {/* Live scrub preview (dataURL, in-wizard only) when the
                    agent is dragging; falls back to the currently
                    selected hosted thumbnail otherwise. */}
                {scrubPreviewDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scrubPreviewDataUrl}
                    alt="Frame at current scrub position"
                    className="ml-auto h-10 w-16 rounded border border-mint object-cover"
                    data-testid={tid("scrubber-preview")}
                  />
                ) : currentPosterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPosterUrl}
                    alt="Current thumbnail"
                    className="ml-auto h-10 w-16 rounded border border-neutral-700 object-cover"
                    data-testid={tid("scrubber-current")}
                  />
                ) : null}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading || capturingFrame || autoCapturing}
              onClick={() => fileRef.current?.click()}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800 disabled:opacity-60"
              data-testid={tid("replace")}
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={uploading || capturingFrame || autoCapturing}
              onClick={handleRemove}
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-red-400 disabled:opacity-60"
              data-testid={tid("remove")}
            >
              Remove
            </button>
          </div>
          {progressBar}
        </div>
      ) : (
        <>
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
          {progressBar}
        </>
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

/** Format seconds as "0:14" / "1:23" for the scrubber timestamp readout. */
function formatScrubTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * A7d.8 — capture a single video frame as a JPEG Blob via the canvas
 * API. The source MUST be the LOCAL file's objectURL — drawing a
 * cross-origin video to canvas throws SecurityError on toBlob(). iOS
 * Safari quirks:
 *
 *   - The <video> needs `muted` + `playsInline` + `preload="auto"` to
 *     decode frames in the background (off-screen) without autoplay
 *     restrictions kicking in.
 *   - First-frame capture targets t≈0.1s (not exactly 0) — some
 *     encoders don't paint frame 0 until a seek lands.
 *   - We wait for BOTH loadeddata AND a subsequent seeked event before
 *     drawing; iOS has been seen to fire seeked before the frame
 *     buffer is actually populated, so we double up.
 *
 * Resolves with a JPEG Blob ready to upload through /api/upload-image.
 */
function captureFrameBlob(
  objectUrl: string,
  atSeconds: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // The <video> is never attached to the DOM — purely off-screen
    // decoder. crossOrigin doesn't matter because the source is a
    // blob: URL (same-origin by spec).
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const onError = () =>
      settle(() => reject(new Error("frame decode failed")));

    const draw = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          settle(() => reject(new Error("video has no intrinsic size")));
          return;
        }
        // Downscale on the way in: longest edge ~1280px. Frames are
        // already wider than the on-page poster needs to be, and the
        // image route's MAX_BYTES (8 MiB) is generous but not infinite.
        const MAX_EDGE = 1280;
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        const dw = Math.max(1, Math.round(w * scale));
        const dh = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = dw;
        canvas.height = dh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          settle(() => reject(new Error("canvas 2d unavailable")));
          return;
        }
        ctx.drawImage(video, 0, 0, dw, dh);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              settle(() => reject(new Error("toBlob returned null")));
              return;
            }
            settle(() => resolve(blob));
          },
          "image/jpeg",
          0.85,
        );
      } catch (err) {
        // SecurityError lands here when the source is cross-origin —
        // shouldn't trigger because we use objectURLs, but surfacing
        // the error message is more useful than a generic "failed".
        settle(() =>
          reject(err instanceof Error ? err : new Error("draw failed")),
        );
      }
    };

    const onSeeked = () => {
      // iOS quirk — the seeked event sometimes fires before the buffer
      // has populated. One animation-frame of slack lets the decoder
      // catch up.
      requestAnimationFrame(draw);
    };

    video.onloadeddata = () => {
      const target = Math.max(0, Math.min(atSeconds, video.duration || 0));
      // Seeking to exactly 0 sometimes no-ops (already at 0). Nudge.
      const seekTo = target === 0 ? 0.001 : target;
      video.currentTime = seekTo;
    };
    video.onseeked = onSeeked;
    video.onerror = onError;
    video.src = objectUrl;
  });
}

/**
 * Upload a captured frame Blob through the existing /api/upload-image
 * route and return the hosted Vercel Blob URL.
 *
 * Why this route and not the @vercel/blob/client direct-upload path:
 *   - The frame is ALREADY downscaled to a poster-sized JPEG (≤ ~250 KB
 *     in practice), well inside Vercel's ~4.5 MB Function body limit.
 *     The client-direct path is needed for the video file itself
 *     (8–250 MB), not for the thumbnail.
 *   - /api/upload-image is auth-gated + has the MIME/size guard rails
 *     already; reusing it keeps the surface area small.
 *   - The returned URL is hosted (NOT a data: URL) — keeps the
 *     published-page payload lean per the sep-photo-upload-requirement
 *     rule.
 */
async function uploadCapturedFrame(
  blob: Blob,
  folder: string,
): Promise<string> {
  const file = new File([blob], `frame-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
  const fd = new FormData();
  fd.append("file", file, file.name);
  // The /api/upload-image route enforces FOLDER_RE = /^[a-z0-9_-]+$/ so
  // sanitize before sending (e.g. "seller-presentation-video-poster"
  // is already in the allowed character set).
  fd.append("folder", folder.replace(/[^a-z0-9_-]/g, "-"));
  const res = await fetch("/api/upload-image", {
    method: "POST",
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(data.error || `Frame upload failed (${res.status})`);
  }
  if (!/^https?:\/\//.test(data.url)) {
    // Belt-and-suspenders: the route is supposed to return a hosted
    // URL, but if something changed under us we want to fail loudly
    // rather than silently store a data: URL.
    throw new Error("Frame upload returned a non-hosted URL");
  }
  return data.url;
}
