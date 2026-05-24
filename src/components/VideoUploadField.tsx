"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
   * A7d.8.2 — visible live-preview canvas above the slider. Drawn
   * directly from the in-DOM `captureVideoRef` <video> on every seeked
   * event. The agent sees the frame at the current scrub position so
   * they can pick a thumbnail with their eyes open instead of guessing
   * (Dallen 2026-05-23 smoke: slider moved but no visible preview).
   */
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * Intrinsic aspect ratio of the loaded video (videoWidth / videoHeight).
   * Used to size the preview canvas so the visible surface matches the
   * shape of the video (portrait phone clips don't get letterboxed into
   * a 16:9 box). Null until loadedmetadata fires.
   */
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  /**
   * A7d.8.2 — last-wins seek coalescer.
   *
   *   - `pendingSeekRef`  = the most recent target time the agent has
   *                         dragged to that hasn't been seeked yet
   *   - `seekInFlightRef` = a seek is currently between `currentTime=`
   *                         and its `seeked` event
   *
   * Slider input fires `requestSeek(t)` — cheap: it just stamps the
   * pending target and calls `pumpSeek()`. `pumpSeek()` only starts a
   * seek if none is in flight; otherwise the seek already running will
   * pick up the latest `pendingSeekRef` from inside its `seeked` handler
   * and fire the next one. This means the agent can scrub as fast as
   * they like — at most ONE seek is in flight + ONE pending (the
   * latest). No backlog, the slider never lags waiting on the decoder.
   *
   * Refs (not state) on purpose: changing them must NOT re-render and
   * MUST stay in sync with the live <video> across rapid input events.
   */
  const pendingSeekRef = useRef<number | null>(null);
  const seekInFlightRef = useRef<boolean>(false);

  // Revoke the object URL when the component unmounts or the file is
  // replaced. Object URLs hold the file in memory until revoked.
  useEffect(() => {
    return () => {
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [localObjectUrl]);

  /**
   * Paint the capture video's CURRENT frame onto the visible preview
   * canvas. Sized internally to longest-edge ~640px (plenty for the
   * thumbnail-sized surface — keeps the per-seek draw cheap on phones).
   * CSS aspect-ratio on the canvas handles the on-page sizing.
   */
  const drawPreviewFrame = useCallback(() => {
    const video = captureVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const MAX_EDGE = 640;
    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
    const dw = Math.max(1, Math.round(vw * scale));
    const dh = Math.max(1, Math.round(vh * scale));
    if (canvas.width !== dw) canvas.width = dw;
    if (canvas.height !== dh) canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, dw, dh);
    } catch {
      // SecurityError would only fire on a cross-origin source — our
      // source is the local objectURL, so this branch is paranoia.
      // Leave whatever was last drawn on screen rather than blanking.
    }
  }, []);

  /**
   * Start the next pending seek IF none is in flight. Called from
   * `requestSeek` (on slider input) and from the `seeked` handler (to
   * pick up whatever the agent dragged to while we were busy).
   */
  const pumpSeek = useCallback(() => {
    if (seekInFlightRef.current) return;
    const t = pendingSeekRef.current;
    if (t === null) return;
    const video = captureVideoRef.current;
    if (!video) return;
    pendingSeekRef.current = null;
    // If we're already at the requested time (within a tick), no seek
    // would fire `seeked` — and the coalescer would stay stuck "in
    // flight" forever waiting for it. Bail with the preview unchanged.
    if (Math.abs(video.currentTime - t) < 0.01) return;
    seekInFlightRef.current = true;
    try {
      if (!video.paused) video.pause();
      video.currentTime = t;
    } catch {
      // currentTime can throw if set before loadedmetadata. Drop the
      // in-flight flag so the next requestSeek can retry.
      seekInFlightRef.current = false;
    }
  }, []);

  /**
   * Stamp the latest target time and (if idle) kick a seek. Synchronous
   * and fire-and-forget — the slider's onChange MUST NOT await this, or
   * a slow phone decode would freeze the slider (A7d.8.1 invariant).
   */
  const requestSeek = useCallback(
    (t: number) => {
      pendingSeekRef.current = t;
      pumpSeek();
    },
    [pumpSeek],
  );

  // A7d.8.2 — on every `seeked`, draw the new frame to the preview
  // canvas, mark the seek done, and pump the next pending seek (if the
  // agent dragged further while this one was in flight). iOS quirk: the
  // seeked event sometimes fires before the buffer has the new pixels,
  // so slack one animation frame before drawing.
  useEffect(() => {
    const video = captureVideoRef.current;
    if (!video || !localObjectUrl) return;
    const onSeeked = () => {
      requestAnimationFrame(() => {
        drawPreviewFrame();
        seekInFlightRef.current = false;
        if (pendingSeekRef.current !== null) pumpSeek();
      });
    };
    video.addEventListener("seeked", onSeeked);
    return () => {
      video.removeEventListener("seeked", onSeeked);
      // Reset on source change — the OLD pending seek is meaningless
      // against the NEW src that's about to load.
      pendingSeekRef.current = null;
      seekInFlightRef.current = false;
    };
  }, [localObjectUrl, drawPreviewFrame, pumpSeek]);

  // A7d.8.2 — initial first-frame paint when the capture video loads.
  // The brief: "when the scrubber first appears, show the first-frame
  // (t≈0) in the preview so it's never empty."
  //
  // iOS decode-force: a muted-inline play()/pause() bounce primes the
  // decoder so the subsequent seek can actually land a painted frame
  // (same trick the off-DOM captureFrameBlob path uses). Then we
  // requestSeek(0.1) — some encoders don't paint frame 0 until a tiny
  // seek lands. Mirrors the auto-capture's 0.1s.
  //
  // The readyState check guards the race where `loadeddata` fires
  // BEFORE this effect mounts its listener (the <video> starts loading
  // the moment `src` is set during render, before useEffect runs).
  useEffect(() => {
    const video = captureVideoRef.current;
    if (!video || !localObjectUrl) return;
    const primeAndSeek = () => {
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          try {
            video.pause();
          } catch {
            // ignore
          }
        }).catch(() => {
          // autoplay may be blocked under strict policies; the seek
          // below still fires and the preview is best-effort anyway
        });
      }
      requestSeek(0.1);
    };
    if (video.readyState >= 2) {
      primeAndSeek();
      return;
    }
    video.addEventListener("loadeddata", primeAndSeek, { once: true });
    return () => video.removeEventListener("loadeddata", primeAndSeek);
  }, [localObjectUrl, requestSeek]);

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
    //
    // A7d.5 — `onUploadProgress` is fired by @vercel/blob 2.4.0
    // throughout the byte stream (both single-PUT and multipart
    // paths). The handshake POST that precedes it does NOT fire the
    // callback, so the bar starts indeterminate until the first
    // event lands; once a percentage arrives it switches to
    // determinate so the agent sees concrete movement.
    let hostedUrl: string;
    try {
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
      hostedUrl = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setProgressPct(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    // A7d.8.1 — DONE STATE, decoupled from frame capture. The Blob
    // upload resolved with a hosted URL, so the field MUST reach the
    // done state here — clear "Uploading…", re-enable Replace/Remove,
    // and notify the parent. Whatever happens in the auto-capture
    // below is best-effort and CANNOT freeze the UI.
    //
    // Pre-A7d.8.1 this lived in a `finally` AFTER the awaited
    // captureFrameBlob. On iOS Safari the capture could hang (the
    // off-DOM <video> never decoded a frame), which left the field
    // stuck on "Uploading… 100%" with the scrubber disabled even
    // though the upload was finished. Dallen's 2026-05-23 real-iPhone
    // smoke caught it.
    onChange(
      hostedUrl,
      Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    );
    setUploading(false);
    setProgressPct(null);
    if (fileRef.current) fileRef.current.value = "";

    // A7d.8 P1 — never-blank baseline: capture the FIRST FRAME of the
    // freshly-uploaded video and persist it as autoPosterUrl. Reads
    // from the LOCAL File via objectURL (no CORS taint). Some encoders
    // don't paint frame 0 until a tiny seek lands, so we seek to 0.1s.
    //
    // This is a FIRE-AND-FORGET best-effort step: it must never gate
    // the done state above. captureFrameBlob carries its own hard
    // timeout (FRAME_CAPTURE_TIMEOUT_MS) so a stalled decoder can't
    // freeze the UI, and the seller page's never-blank fallback (omit
    // empty poster attr → preload="metadata") covers a timeout.
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
        // the manual ImageUploadField override both remain available,
        // and either one will fill the poster slot. The seller page's
        // <video preload="metadata"> with no poster attribute will
        // paint a native first frame in the meantime.
      } finally {
        setAutoCapturing(false);
      }
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
          {/* A7d.8 — off-screen canvas-capture <video>. Sourced from
              the LOCAL objectURL so canvas.toBlob() doesn't throw
              SecurityError on a cross-origin hosted source. Reads
              duration into state so the scrubber can compute its `max`.

              A7d.8.1 — IMPORTANT: do NOT use display:none / className=
              "hidden" here. iOS Safari only decodes frames for a video
              that is actually in layout — a display:none video never
              paints, so the live scrub-preview pipeline (the useEffect
              above that draws on seeked) silently never produces a
              frame on iPhone. Mounting at 1×1px with opacity 0 keeps
              the element in layout while staying visually invisible. */}
          {localObjectUrl && (
            <video
              ref={captureVideoRef}
              src={localObjectUrl}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              data-testid={tid("capture-source")}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
              onLoadedMetadata={(e) => {
                const v = e.target as HTMLVideoElement;
                if (Number.isFinite(v.duration) && v.duration > 0) {
                  setDuration(v.duration);
                }
                // A7d.8.2 — capture intrinsic aspect so the preview
                // canvas sizes to the actual video shape (a portrait
                // phone clip should not letterbox into a 16:9 box).
                if (v.videoWidth > 0 && v.videoHeight > 0) {
                  setVideoAspect(v.videoWidth / v.videoHeight);
                }
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
              {/* A7d.8.2 — visible live-preview canvas ABOVE the slider.
                  Drawn from the in-DOM captureVideoRef <video> on every
                  seeked event (coalesced via pendingSeekRef /
                  seekInFlightRef so we never queue a backlog). Sized to
                  the video's intrinsic aspect ratio so portrait phone
                  clips don't get letterboxed.

                  WYSIWYG with "Use this frame": both pipelines read from
                  the SAME localObjectUrl at the SAME scrubTime — the
                  live preview through this canvas, the committed
                  capture through captureFrameBlob below. */}
              <div className="mt-2">
                <canvas
                  ref={previewCanvasRef}
                  className="block w-full rounded border border-neutral-800 bg-black"
                  style={{ aspectRatio: videoAspect ?? 16 / 9 }}
                  aria-label="Live preview of frame at current scrub position"
                  data-testid={tid("scrubber-preview-canvas")}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={Math.max(duration / 200, 0.05)}
                value={scrubTime ?? 0}
                // A7d.8.1 — slider is gated ONLY on an in-flight scrub
                // capture, NOT on the auto first-frame capture. The
                // scrubber becomes usable the instant duration is known
                // (the readVideoDuration() pre-upload pass writes it),
                // independent of whether the background auto-capture is
                // still running. iOS Safari can let auto-capture hang
                // (pre-fix root cause) but the scrubber must stay live.
                disabled={capturingFrame}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (!Number.isFinite(t)) return;
                  setScrubTime(t);
                  // A7d.8.2 — fire-and-forget coalesced seek. requestSeek
                  // stamps the latest target and either kicks a seek (if
                  // idle) or lets the in-flight seek pick this up on its
                  // way out. Crucially, the slider does NOT await any
                  // draw or seek — a slow phone decode can never freeze
                  // the slider, the controls, or the upload-done state
                  // (A7d.8.1 invariant).
                  requestSeek(t);
                }}
                className="mt-2 w-full accent-mint"
                aria-label="Scrub to choose a thumbnail frame"
                data-testid={tid("scrubber-range")}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  // A7d.8.1 — see slider comment above. "Use this frame"
                  // must NOT be gated on autoCapturing.
                  disabled={scrubTime === null || capturingFrame}
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
                {currentPosterUrl && (
                  // Small "currently selected" indicator — what's
                  // persisted on the draft right now (auto first-frame,
                  // or a scrub the agent already committed). The big
                  // canvas above is the LIVE preview as they drag.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPosterUrl}
                    alt="Current thumbnail"
                    className="ml-auto h-10 w-16 rounded border border-neutral-700 object-cover"
                    data-testid={tid("scrubber-current")}
                  />
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              // A7d.8.1 — Replace/Remove must be available the moment the
              // upload itself is done. autoCapturing is a background
              // best-effort step and intentionally NOT in this gate.
              disabled={uploading || capturingFrame}
              onClick={() => fileRef.current?.click()}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800 disabled:opacity-60"
              data-testid={tid("replace")}
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={uploading || capturingFrame}
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
 * A7d.8.1 — hard upper bound on how long any single frame capture is
 * allowed to take. iOS Safari has been observed to silently never
 * fire `seeked` if the <video> isn't in layout, and even with the
 * off-screen-renderable fix below a degenerate codec / file can still
 * stall mid-decode. The timeout converts a hang into the documented
 * soft-fail path so the UI never freezes. 4 s is plenty for a real
 * decode (sub-second on modern phones) without making the user wait
 * an awkward long beat when something is actually broken.
 */
export const FRAME_CAPTURE_TIMEOUT_MS = 4000;

/**
 * Type-only declaration for HTMLVideoElement.requestVideoFrameCallback
 * — shipped in Safari 15.4+ / Chrome 83+ / Firefox 132+. Lib.dom.d.ts
 * in TS 5.x does not yet include it, so we narrow locally rather than
 * widen the global type. When absent we fall back to seeked + rAF.
 */
interface VideoFrameMetadata {
  presentationTime: number;
  expectedDisplayTime: number;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
}
type VideoFrameRequestCallback = (
  now: number,
  metadata: VideoFrameMetadata,
) => void;

/**
 * A7d.8 — capture a single video frame as a JPEG Blob via the canvas
 * API. The source MUST be the LOCAL file's objectURL — drawing a
 * cross-origin video to canvas throws SecurityError on toBlob().
 *
 * A7d.8.1 (Dallen 2026-05-23 real-iPhone smoke) — the iOS-safe shape:
 *
 *   1. The <video> is MOUNTED off-screen but in layout (1×1px,
 *      opacity 0, absolutely positioned). iOS Safari only decodes
 *      frames for a video that's actually in layout; an unmounted
 *      element OR display:none / visibility:hidden silently never
 *      paints a frame, so the seeked event never fires.
 *   2. After loadeddata we DECODE-FORCE by play()→pause(). Muted
 *      inline autoplay is permitted on iOS without a user gesture
 *      — this primes the decoder so the subsequent seek can actually
 *      land a painted frame.
 *   3. We prefer `requestVideoFrameCallback` when available — it
 *      fires when a frame is genuinely presented for compositing
 *      (post-decode, post-paint), avoiding the "seeked fired but the
 *      buffer is still empty" iOS race. Falls back to seeked + rAF.
 *   4. A FRAME_CAPTURE_TIMEOUT_MS hard cap converts any hang into a
 *      reject so callers can soft-fail cleanly. Always cleans up the
 *      mounted element regardless of resolution path.
 *
 * Resolves with a JPEG Blob ready to upload through /api/upload-image.
 */
function captureFrameBlob(
  objectUrl: string,
  atSeconds: number,
  timeoutMs: number = FRAME_CAPTURE_TIMEOUT_MS,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    // Some older WebKit builds only respect muted via the attribute,
    // not the property — set both so the muted-autoplay gate is open.
    video.setAttribute("muted", "");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    // Off-screen but in layout — see point (1) above. opacity:0 +
    // pointerEvents:none keeps it visually + interactively inert
    // while leaving it laid out so the decoder will paint.
    Object.assign(video.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    });
    video.setAttribute("aria-hidden", "true");

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore — best-effort teardown
      }
      if (video.parentNode) video.parentNode.removeChild(video);
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    timeoutId = setTimeout(() => {
      // A7d.8.1 — hang → soft-fail. The caller catches and the seller
      // page's never-blank fallback covers a missing poster.
      settle(() => reject(new Error("frame capture timed out")));
    }, timeoutMs);

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
        settle(() =>
          reject(err instanceof Error ? err : new Error("draw failed")),
        );
      }
    };

    // Prefer requestVideoFrameCallback when available — it fires on a
    // genuinely PAINTED frame, sidestepping the iOS "seeked fired but
    // the buffer is empty" race. Falls back to seeked + rAF slack.
    const rvfc = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: VideoFrameRequestCallback) => number;
      }
    ).requestVideoFrameCallback?.bind(video);
    const awaitPaintedFrame = () => {
      if (rvfc) {
        rvfc(() => requestAnimationFrame(draw));
      } else {
        video.addEventListener(
          "seeked",
          () => requestAnimationFrame(draw),
          { once: true },
        );
      }
    };

    video.addEventListener(
      "loadeddata",
      () => {
        // Decode-force on iOS: a muted inline play() bounce primes the
        // decoder so the subsequent seek can land a painted frame.
        // Ignored errors are fine — autoplay can still be blocked by
        // some configs, and the timeout safety net covers true hangs.
        const playAttempt = video.play();
        if (playAttempt && typeof playAttempt.then === "function") {
          playAttempt
            .then(() => {
              try {
                video.pause();
              } catch {
                // ignore
              }
            })
            .catch(() => {
              // ignore — play() can reject under strict autoplay
              // policies; the awaited frame callback below still
              // arms, and the timeout catches any genuine hang.
            });
        }
        const target = Math.max(0, Math.min(atSeconds, video.duration || 0));
        // Seeking to exactly 0 sometimes no-ops (already at 0). Nudge.
        const seekTo = target === 0 ? 0.001 : target;
        awaitPaintedFrame();
        try {
          video.currentTime = seekTo;
        } catch {
          // ignore — timeout will catch true hangs
        }
      },
      { once: true },
    );
    video.onerror = onError;

    // Mount BEFORE assigning src so iOS has a laid-out element to
    // decode into from the very first byte.
    document.body.appendChild(video);
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
