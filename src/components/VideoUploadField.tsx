"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getVideoUploadSessionState,
  resetVideoUploadSession,
  startVideoUpload,
  subscribeVideoUploadSession,
} from "@/lib/video-upload-session";

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
 *
 * A7d.8.3 — Thumbnail picker rework (Dallen 2026-05-23 smoke):
 *
 *   - ONE preview surface: the MAIN visible <video>. Scrubbing the
 *     slider seeks the main video so the agent sees the current
 *     frame live in the same window buyers will see. The A7d.8.2
 *     separate preview canvas (which rendered huge + black on iOS)
 *     is GONE.
 *   - Instagram-style filmstrip: best-effort pre-extracted thumbnails
 *     of N evenly-spaced frames, rendered as a thin track above the
 *     slider for visual scrub orientation. Falls back to a plain
 *     slider (still seeking the main video) if extraction fails —
 *     no UI state is gated on the strip landing.
 *   - The main video is sourced from the LOCAL objectURL while
 *     available (fast random-access seek for the scrubber); falls
 *     back to the hosted URL after reload. Buyers ALWAYS see the
 *     hosted URL via the seller-page renderer; this swap only
 *     affects the wizard's preview surface during a live edit.
 *
 * A7d.8.4 — Two thumbnail-picker bugs Dallen hit on 2026-05-23:
 *
 *   1. WYSIWYG. "Use this frame" used to spin up a SEPARATE off-screen
 *      <video> (captureFrameBlob), seek IT to scrubTime, and draw THAT
 *      element to canvas. Two independent decoders can land on different
 *      painted frames at the same timestamp (keyframe snapping, decode
 *      timing, paint races), so the captured poster ≠ what the agent
 *      saw in the preview. The commit path now draws the MAIN visible
 *      <video> directly at its currentTime — same element, same frame.
 *      The off-screen captureFrameBlob path is retained for the AUTO
 *      first-frame (immediately post-upload, before the main video has
 *      mounted; iOS-safe shape is unchanged).
 *
 *   2. NO RE-UPLOAD ON REVISIT. The scrubber used to gate on the local
 *      `File` (objectURL) so it disappeared after the wizard remounted
 *      — the only way back was a fresh upload, which re-stored the
 *      large video file. The scrubber is now available whenever a
 *      video exists (local in-session OR persisted hosted URL on
 *      remount). The main <video> carries crossOrigin="anonymous" so
 *      canvas.drawImage() on the hosted source is taint-free — Vercel
 *      Blob's `access:"public"` objects serve Access-Control-Allow-
 *      Origin:* + range requests (verified 2026-05-23). Re-picking a
 *      thumbnail uploads only the small captured IMAGE; the video is
 *      never re-uploaded.
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

/**
 * A7d.8.3 — how many filmstrip frames to pre-extract. 8 evenly-spaced
 * thumbnails fit a phone-width track without scrolling and stay cheap
 * enough to extract in well under the total budget on real devices.
 */
const FILMSTRIP_FRAME_COUNT = 8;

/**
 * A7d.8.3 — total wall-clock budget for filmstrip pre-extraction
 * across all N frames. Best-effort: when the budget expires we resolve
 * with whatever frames have been captured so far (possibly zero), and
 * the picker falls back to a plain slider. iOS Safari has been seen
 * to take ~300–500 ms per painted seek on a cold decode of a real
 * phone clip — 6 s leaves comfortable headroom for 8 frames.
 */
export const FILMSTRIP_TOTAL_TIMEOUT_MS = 6000;

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
  const [error, setError] = useState<string | null>(null);

  // A7d.11 — the in-flight upload state lives in a module-level session
  // (src/lib/video-upload-session.ts), NOT in this component's `useState`.
  // That's load-bearing for two real-deploy bugs Dallen hit 2026-05-24:
  // (1) DESKTOP: any parent re-render that unmounts/remounts the field
  // would lose `uploading` + `localObjectUrl` and the completed-upload UI
  // never rendered, even though the blob did land. (2) BOTH: editing
  // sibling fields during an upload clobbered the user's typing because
  // the OLD onChange arrow captured a stale `setVideo` closure.
  //
  // Both go away when the upload state outlives any React mount and the
  // completion path uses a functional setDraft updater (the parent owns
  // that — see StepEditorial.tsx). The session key is the upload folder
  // (one in-flight upload per field surface). useSyncExternalStore is
  // the React 19 hook for subscribing to a non-React store while keeping
  // the snapshot stable across re-renders.
  const sessionKey = folder ?? "uploads";
  const session = useSyncExternalStore(
    useCallback((l) => subscribeVideoUploadSession(sessionKey, l), [sessionKey]),
    useCallback(() => getVideoUploadSessionState(sessionKey), [sessionKey]),
    // Server snapshot — the session is client-only; on the server we
    // always look idle so SSR + first-client-paint match.
    useCallback(() => getVideoUploadSessionState(sessionKey), [sessionKey]),
  );
  const uploading = session.status === "uploading";
  const progressPct = session.progressPct;
  const localObjectUrl = session.localObjectUrl;

  // A7d.11 — stash the latest `onChange` so the completion effect can
  // call it without re-firing whenever the prop's identity changes (each
  // parent render creates a fresh inline arrow). The effect's deps are
  // the session's *terminal* fields (status + hostedUrl), so it fires
  // exactly once per completed upload regardless of prop churn.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // A7d.11 — drive the parent's draft from a `completed` session. Use a
  // mounted flag to gate against the `value`-feedback double-fire: when
  // the parent applies the URL, `value === session.hostedUrl` becomes
  // true on the next render, the effect sees the post-fire state, and
  // does nothing. If the field remounts mid-upload, this effect still
  // fires once the session reaches `completed` — the parent's functional
  // setDraft merges the URL into the latest draft without clobbering.
  const lastFiredHostedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      session.status === "completed" &&
      session.hostedUrl &&
      session.hostedUrl !== value &&
      lastFiredHostedUrlRef.current !== session.hostedUrl
    ) {
      lastFiredHostedUrlRef.current = session.hostedUrl;
      onChangeRef.current(
        session.hostedUrl,
        session.durationSeconds !== null && Number.isFinite(session.durationSeconds)
          ? session.durationSeconds
          : undefined,
      );
    }
  }, [session.status, session.hostedUrl, session.durationSeconds, value]);

  const [duration, setDuration] = useState<number | null>(
    session.durationSeconds,
  );
  // Scrubber position in seconds. `null` until the agent first touches
  // the slider — keeps the UI from claiming a chosen frame they didn't
  // pick. Once they drag, this is the timestamp the main video is
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
   * A7d.8.3 — the MAIN visible <video>. The slider seeks this element
   * directly so the agent sees the current frame live in the same
   * window buyers will see (Instagram-style: one preview surface, not
   * a separate canvas). iOS decodes a visible, in-layout, in-DOM
   * <video> reliably — that sidesteps the off-DOM hidden-video decode
   * problem A7d.8.1 had to work around.
   */
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);

  /**
   * A7d.8.3 — filmstrip thumbnails. Data URLs (kept in-memory, never
   * persisted on the draft — the persisted poster goes through
   * uploadCapturedFrame's hosted-URL guard below). Empty array means
   * extraction hasn't landed yet or soft-failed; in either case the
   * plain slider remains fully functional.
   */
  const [filmstripFrames, setFilmstripFrames] = useState<string[]>([]);
  type FilmstripStatus = "idle" | "extracting" | "ready" | "failed";
  const [filmstripStatus, setFilmstripStatus] =
    useState<FilmstripStatus>("idle");

  /**
   * A7d.8.2 — last-wins seek coalescer (retained in A7d.8.3 but now
   * targets the MAIN video instead of an off-screen capture source).
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

  // A7d.11 — local objectURL lifecycle is owned by the session module
  // (it survives remount); revocation happens on Replace / Remove via
  // `resetVideoUploadSession`. No per-mount cleanup needed here.

  /**
   * Start the next pending seek IF none is in flight. Called from
   * `requestSeek` (on slider input) and from the `seeked` handler (to
   * pick up whatever the agent dragged to while we were busy).
   */
  const pumpSeek = useCallback(() => {
    if (seekInFlightRef.current) return;
    const t = pendingSeekRef.current;
    if (t === null) return;
    const video = mainVideoRef.current;
    if (!video) return;
    pendingSeekRef.current = null;
    // If we're already at the requested time (within a tick), no seek
    // would fire `seeked` — and the coalescer would stay stuck "in
    // flight" forever waiting for it. Bail with the preview unchanged.
    if (Math.abs(video.currentTime - t) < 0.01) return;
    seekInFlightRef.current = true;
    try {
      // Pause-while-scrubbing: setting currentTime on a playing video
      // shows the seek frame, but the controls UI still treats it as
      // "playing" which is confusing. Match Instagram's "pause + step"
      // behavior — the agent can re-tap play when they're done picking.
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

  // A7d.8.3 — on every `seeked` of the main video, mark the seek done
  // and pump the next pending seek (if the agent dragged further while
  // this one was in flight). No canvas draw needed — the main <video>
  // element shows the new frame natively.
  useEffect(() => {
    const video = mainVideoRef.current;
    if (!video) return;
    const onSeeked = () => {
      seekInFlightRef.current = false;
      if (pendingSeekRef.current !== null) pumpSeek();
    };
    video.addEventListener("seeked", onSeeked);
    return () => {
      video.removeEventListener("seeked", onSeeked);
      // Reset on source change — the OLD pending seek is meaningless
      // against the NEW src that's about to load.
      pendingSeekRef.current = null;
      seekInFlightRef.current = false;
    };
    // Re-bind when the underlying src changes (local objectURL → hosted
    // URL on reload, or Replace flow swaps the file). value AND
    // localObjectUrl both feed `src` on the main video.
  }, [value, localObjectUrl, pumpSeek]);

  // A7d.11 — no useEffect needed to mirror session.durationSeconds into
  // local `duration`: the useState above initializes from the session,
  // and on remount React calls the initializer again, picking up the
  // session value across the mount boundary. After mount, fresh
  // uploads update local `duration` in handleFile BEFORE delegating to
  // startVideoUpload, so the two stay coherent without a sync effect.

  // A7d.8.3 — filmstrip pre-extraction. Best-effort, fire-and-forget.
  // Runs on every fresh local file (and re-runs on Replace). Cancelled
  // on unmount or before the next file lands so a stale result doesn't
  // splash onto a new clip.
  useEffect(() => {
    if (!localObjectUrl) {
      setFilmstripFrames([]);
      setFilmstripStatus("idle");
      return;
    }
    let cancelled = false;
    setFilmstripStatus("extracting");
    setFilmstripFrames([]);
    extractFilmstripFrames(localObjectUrl, FILMSTRIP_FRAME_COUNT)
      .then((frames) => {
        if (cancelled) return;
        setFilmstripFrames(frames);
        setFilmstripStatus(frames.length > 0 ? "ready" : "failed");
      })
      .catch(() => {
        if (cancelled) return;
        setFilmstripStatus("failed");
      });
    return () => {
      cancelled = true;
    };
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

    setScrubTime(null);
    setDuration(Number.isFinite(durationSeconds) ? durationSeconds : null);

    // A7d.11 — delegate the upload to the module-level session. State
    // (uploading/progress/localObjectUrl/hostedUrl) lives there now so
    // a re-render or remount of this field can't lose it. The fileRef
    // value is cleared here so picking the SAME file again immediately
    // after a Remove still fires onChange (otherwise <input type=file>
    // de-dups by value and the change event never fires).
    if (fileRef.current) fileRef.current.value = "";
    const ext = extensionForType(file.type);
    const folderSegment = folder ?? "uploads";
    const pathname = `${folderSegment}/${Date.now()}.${ext}`;
    const MULTIPART_THRESHOLD = 10 * 1024 * 1024;
    // Fire-and-forget. The session's external store drives the UI;
    // the completion effect at the top of this component picks up the
    // hostedUrl and calls onChange exactly once. Awaiting here would
    // re-couple the in-flight state to this React frame's lifecycle —
    // the whole point of the A7d.11 refactor is that this component
    // can mount/unmount during the upload and the upload doesn't care.
    void startVideoUpload(sessionKey, file, {
      pathname,
      contentType: file.type,
      handleUploadUrl: "/api/upload-video",
      multipart: file.size > MULTIPART_THRESHOLD,
      durationSeconds: Number.isFinite(durationSeconds)
        ? durationSeconds
        : null,
    });
  };

  // A7d.11 — never-blank auto first-frame capture, moved out of
  // handleFile so it survives a remount mid-upload. Fires when the
  // session reaches `completed` AND we have the local objectURL +
  // a poster sink to fill. Best-effort: a soft-fail leaves the seller
  // page's native first-frame fallback in place.
  const autoCapturedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      session.status !== "completed" ||
      !session.localObjectUrl ||
      !onPosterChange ||
      autoCapturedRef.current === session.hostedUrl
    ) {
      return;
    }
    autoCapturedRef.current = session.hostedUrl;
    let cancelled = false;
    setAutoCapturing(true);
    const sourceUrl = session.localObjectUrl;
    (async () => {
      try {
        const frame = await captureFrameBlob(sourceUrl, 0.1);
        const posterUrl = await uploadCapturedFrame(
          frame,
          `${folder ?? "uploads"}-poster`,
        );
        if (!cancelled) onPosterChange(posterUrl, "auto");
      } catch {
        // Soft-fail; the renderer's preload="metadata" + no-poster
        // fallback paints a native first frame in the meantime.
      } finally {
        if (!cancelled) setAutoCapturing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `folder` and `onPosterChange` are stable across the upload's
    // lifetime in practice; we depend only on the terminal session
    // fields so a redundant in-progress re-render can't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, session.hostedUrl, session.localObjectUrl]);

  // A7d.8.4 — "Use this frame" captures from the SAME <video> the agent
  // is previewing, at its CURRENT painted frame. Before A7d.8.4 this
  // path spun up a separate off-screen <video> seeked independently to
  // scrubTime — two decoders can land on different frames at the same
  // timestamp, so the captured poster could differ from what the agent
  // saw in the preview window. WYSIWYG fix: draw the main element now.
  //
  // Hosted-source taint: when the local objectURL is gone (remount),
  // the main video is sourced from the hosted Vercel Blob URL with
  // crossOrigin="anonymous". Vercel Blob's public objects serve
  // Access-Control-Allow-Origin:*, so canvas.drawImage()/toBlob() do
  // not throw SecurityError. This is what lets the agent re-pick a
  // thumbnail without re-uploading the video.
  const handleUseThisFrame = async () => {
    const video = mainVideoRef.current;
    if (!video || scrubTime === null) return;
    setError(null);
    setCapturingFrame(true);
    try {
      const frame = await captureFrameFromVideoElement(video);
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
    // A7d.11 — tear down the module-level session (revokes the local
    // objectURL, aborts any in-flight upload, snaps to `idle`). The
    // completion-effect guard `lastFiredHostedUrlRef` is intentionally
    // NOT reset here — without that, a session that's torn down and
    // immediately restarted with the SAME hostedUrl could re-fire
    // onChange. Replace below uses a fresh pathname (Date.now()) so
    // hostedUrl uniqueness in practice is a non-issue.
    resetVideoUploadSession(sessionKey);
    setDuration(null);
    setScrubTime(null);
    setFilmstripFrames([]);
    setFilmstripStatus("idle");
    setError(null);
    onChange("");
  };

  // A7d.11 — display the field-local error (pre-upload validations,
  // frame-capture failures) PLUS the upload session's error if it
  // failed. Computed inline rather than mirrored via useEffect so we
  // don't trigger the cascading-setState lint and so the displayed
  // error is always a pure function of the current state.
  const displayedError =
    error ?? (session.status === "failed" ? session.error : null);

  // A7d.8.3 — when the agent clicks a filmstrip frame, jump the slider
  // (and the main video) to that frame's timestamp. Provides a quick
  // coarse-grained pick on top of the fine-grained slider drag.
  const handleFilmstripFrameClick = (index: number) => {
    if (!duration || duration <= 0) return;
    const t = ((index + 0.5) / FILMSTRIP_FRAME_COUNT) * duration;
    setScrubTime(t);
    requestSeek(t);
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
            {/* A7d.8.3 — single preview surface. Sourced from the LOCAL
                objectURL while available (fast random-access seek for
                the scrubber; iOS decodes a visible, in-layout, in-DOM
                <video> reliably). Falls back to the hosted URL after
                reload so the preview still works once the local File
                is gone. Buyers always see the hosted URL via the
                seller-page renderer; this swap only affects the
                wizard's preview during a live edit.
                A7d.8.4 — crossOrigin="anonymous" so canvas.drawImage()
                on the hosted-URL src is taint-free. Verified: Vercel
                Blob public objects serve Access-Control-Allow-Origin:*.

                A7d.8.5 — crossOrigin is CONDITIONAL. When sourcing
                the local blob: objectURL (in-session, freshly uploaded)
                we OMIT crossOrigin entirely — the attribute is a no-op
                for same-origin blob: URLs in spec, but on iOS Safari
                its presence has been seen to introduce a brief reload
                / not-ready state when set on a `blob:` src, leaving
                the video stuck `seeking=true` at "Use this frame" tap
                time. Conditional spread sets it ONLY on the hosted-URL
                path (revisit, where it's actually required). */}
            <video
              ref={mainVideoRef}
              src={localObjectUrl ?? value}
              {...(localObjectUrl ? {} : { crossOrigin: "anonymous" as const })}
              controls
              playsInline
              preload="metadata"
              // P2-VIDEO-3 (Dallen real-iPhone 2026-06-10) — `sep-video-
              // authoring-preview` lets sep-wizard.css hide iOS Safari's big
              // CENTRAL "start playback" button, which sat over the agent's
              // face while they scrubbed "Pick a thumbnail" — they couldn't
              // see their expression to choose a frame. The native controls
              // BAR (with its own play button) stays, so there's still a way
              // to play. Authoring-only; the consumer player is untouched.
              className="aspect-video w-full sep-video-authoring-preview"
              data-testid={tid("preview")}
              onLoadedMetadata={(e) => {
                // Mirror the duration into state from the MAIN video
                // too — the pre-upload readVideoDuration() already
                // wrote it from the File, this is a belt-and-braces
                // refresh in case the upstream value differs slightly.
                // On remount with NO local File, this is the ONLY
                // source of duration (the pre-upload pass didn't run)
                // — without it the scrubber would never appear.
                const v = e.target as HTMLVideoElement;
                if (Number.isFinite(v.duration) && v.duration > 0) {
                  setDuration(v.duration);
                }
                // P2-VIDEO-3 (Dallen real-iPhone 2026-06-10) — iOS Safari
                // paints a posterless <video> BLACK until it's played or
                // seeked, so the preview box showed black right after upload
                // until the agent dragged the scrubber. Nudge to ~0.1s on
                // first load so the first frame paints immediately (desktop
                // already paints frame 1 — this is invisible there). This is
                // a plain seek, NOT a canvas capture (capture hangs on iOS).
                // The `#t=` URL trick isn't used here because this src can be
                // a `blob:` objectURL, which doesn't reliably honor media
                // fragments on iOS. Guarded to the very start so it never
                // yanks a video the agent has already scrubbed, and wrapped
                // because currentTime can throw if set before metadata.
                if (v.currentTime < 0.05) {
                  try {
                    v.currentTime = 0.1;
                  } catch {
                    // ignore — a pre-metadata seek guard; the scrubber's
                    // own seek path covers any later positioning.
                  }
                }
              }}
            />
          </div>
          {/* A7d.8.4 — Instagram-style scrubber. Available whenever a
              video exists (local File in-session OR persisted hosted
              URL on revisit) and the duration is known. The hosted-URL
              case requires crossOrigin="anonymous" on the main <video>
              so canvas.drawImage() is taint-free — Vercel Blob serves
              Access-Control-Allow-Origin:*, verified 2026-05-23.
              Re-picking a thumbnail uploads only the small captured
              IMAGE; the video is never re-uploaded. */}
          {(localObjectUrl || value) && duration && duration > 0 && onPosterChange && (
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
              {/* A7d.8.3 — filmstrip track. Best-effort visual aid;
                  failure / empty array drops back to a plain slider
                  that still seeks the main video. Frame clicks jump
                  the slider; the drag fine-tunes. */}
              {filmstripFrames.length > 0 && (
                <div
                  className="mt-2 flex h-12 w-full overflow-hidden rounded border border-neutral-800 bg-black"
                  data-testid={tid("scrubber-filmstrip")}
                >
                  {filmstripFrames.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleFilmstripFrameClick(i)}
                      className="relative h-full flex-1 overflow-hidden border-r border-neutral-900 last:border-r-0 disabled:opacity-60"
                      disabled={capturingFrame}
                      style={{ minWidth: 0 }}
                      data-testid={tid(`scrubber-filmstrip-frame-${i}`)}
                      aria-label={`Jump to frame ${i + 1} of ${FILMSTRIP_FRAME_COUNT}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        aria-hidden="true"
                        className="block h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              {filmstripStatus === "extracting" && filmstripFrames.length === 0 && (
                <p
                  className="mt-2 text-[10px] uppercase tracking-[0.15em] text-neutral-500"
                  data-testid={tid("scrubber-filmstrip-status")}
                >
                  Building filmstrip…
                </p>
              )}
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
                  // A7d.8.3 — fire-and-forget coalesced seek of the MAIN
                  // video. The main <video> shows the frame natively;
                  // no separate canvas draw is needed. The slider does
                  // NOT await any seek — a slow phone decode can never
                  // freeze the slider, the controls, or the upload-done
                  // state (A7d.8.1 invariant).
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
                  // or a scrub the agent already committed). The main
                  // video above is the LIVE preview as they drag.
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

      {displayedError && (
        <p
          className="mt-1 text-[11px] text-red-400"
          data-testid={tid("error")}
        >
          {displayedError}
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

    // A7d.8.5 — race rVFC against the seeked event + rAF. Both arm at
    // once; the first to fire calls `draw`, the loser bails on the
    // `landed` flag. rVFC was previously the SOLE resolver when
    // available, but on iOS Safari it can stay silent even after the
    // seek presents a new frame (race with the play()→pause() decode-
    // force prime above) — that left the auto first-frame capture
    // hitting the 4 s timeout and the seller page rendering blank.
    // The seeked + rAF path is the iOS-reliable primary; rVFC just
    // lets capable browsers land a tick earlier.
    const rvfc = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: VideoFrameRequestCallback) => number;
      }
    ).requestVideoFrameCallback?.bind(video);
    let landed = false;
    const landAndDraw = () => {
      if (landed) return;
      landed = true;
      requestAnimationFrame(draw);
    };
    const awaitPaintedFrame = () => {
      video.addEventListener("seeked", () => landAndDraw(), { once: true });
      if (rvfc) {
        rvfc(() => landAndDraw());
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
 * A7d.8.4 — capture the CURRENTLY PAINTED frame from an existing
 * <video> element to a JPEG Blob. Unlike captureFrameBlob this does
 * NOT mount its own off-screen <video> + seek it independently — it
 * draws the live element the agent is looking at, so the captured
 * frame matches the preview byte-for-byte (the WYSIWYG fix).
 *
 * Taint discipline:
 *   - In-session the main <video>'s src is the local blob: objectURL
 *     (same-origin) so drawImage()/toBlob() are trivially safe.
 *   - On remount the src is the hosted Vercel Blob URL. The element
 *     gets crossOrigin="anonymous" ONLY in that case (A7d.8.5 made
 *     this conditional — see the JSX above). Vercel Blob serves
 *     Access-Control-Allow-Origin:*, so the response is treated as
 *     CORS-clean → no taint.
 *
 * A7d.8.5 — rVFC is NOT the sole resolver. Dallen's 2026-05-23
 * real-iPhone smoke: "Use this frame" timed out with
 * "frame capture timed out" because the pre-A7d.8.5 path armed
 * requestVideoFrameCallback to wait for a "painted frame" — but on
 * iOS Safari rVFC only fires for a NEW frame presented during
 * playback or right after a seek paints. For a PAUSED, already-
 * settled, static frame (the exact state when the agent taps "Use
 * this frame"), rVFC NEVER fires. The wait hit the 4 s timeout,
 * `handleUseThisFrame` caught the reject, and no poster ever landed.
 *
 * The reliable path: the frame is ALREADY on screen — the agent is
 * staring at it — so a single rAF (giving the browser a paint tick)
 * is sufficient to capture it. Two rAFs to be paranoid about the
 * frame being committed to the compositor pipeline on slow devices.
 * rVFC is wired as an OPTIONAL accelerator raced against rAF: first
 * one to fire calls `draw`, the loser is ignored. This means iOS
 * (rVFC silent) lands via rAF; Chromium (rVFC fast) lands a tick
 * earlier via rVFC; either way capture resolves well under timeoutMs.
 *
 * If a seek is in flight when "Use this frame" is tapped, the
 * slider's last-wins coalescer is still mid-decode. Listen for
 * `seeked` first (the seek IS presenting a new frame, so rVFC would
 * fire here too, but rAF after `seeked` is equally reliable and
 * cheaper to reason about). Hard FRAME_CAPTURE_TIMEOUT_MS cap is
 * preserved as a last-resort safety net, NOT the common path.
 */
function captureFrameFromVideoElement(
  video: HTMLVideoElement,
  timeoutMs: number = FRAME_CAPTURE_TIMEOUT_MS,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      fn();
    };
    timeoutId = setTimeout(() => {
      settle(() => reject(new Error("frame capture timed out")));
    }, timeoutMs);

    const draw = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          settle(() => reject(new Error("video has no intrinsic size")));
          return;
        }
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
        // Most likely SecurityError on a tainted canvas — surface it
        // so the caller can show a real message instead of a hang.
        settle(() =>
          reject(err instanceof Error ? err : new Error("draw failed")),
        );
      }
    };

    // A7d.8.5 — race rVFC against rAF. Whichever fires first calls
    // `draw` once; the loser sees `landed` and bails. The rAF path is
    // the RELIABLE primary on iOS (where rVFC stays silent for static
    // frames). rVFC just lets capable browsers land a tick earlier.
    let landed = false;
    const landAndDraw = () => {
      if (landed) return;
      landed = true;
      // One rAF gives the compositor a paint tick — drawing here on
      // the same tick the previous frame already presented is what
      // captures the visible bytes.
      requestAnimationFrame(draw);
    };
    const racePaintedFrame = () => {
      // Primary: double rAF. The first schedules the next paint; the
      // second fires AFTER it has presented, so by the time `draw`
      // runs the back-buffer for the current frame is finalized. On
      // a static-paused video this completes in ~32 ms regardless of
      // whether rVFC ever calls back.
      requestAnimationFrame(() => requestAnimationFrame(landAndDraw));
      // Optional accelerator: rVFC, if the browser supports it AND
      // happens to fire. iOS Safari typically won't for a paused
      // static frame — that's fine, rAF above lands first.
      const rvfc = (
        video as HTMLVideoElement & {
          requestVideoFrameCallback?: (
            cb: VideoFrameRequestCallback,
          ) => number;
        }
      ).requestVideoFrameCallback?.bind(video);
      if (rvfc) {
        rvfc(() => landAndDraw());
      }
    };

    if (video.seeking) {
      // A coalesced seek is still in flight — wait for it to land
      // before drawing, otherwise we'd capture the previous frame.
      // The new frame paints on the next rAF after `seeked` fires.
      video.addEventListener(
        "seeked",
        () => racePaintedFrame(),
        { once: true },
      );
      return;
    }

    if (video.readyState < 2 /* HAVE_CURRENT_DATA */) {
      // Defensive — the main video has metadata + the current frame
      // by the time the agent can see and tap "Use this frame", but
      // surface this as a real condition just in case (e.g. a hosted-
      // URL revisit captured before the network roundtrip lands).
      video.addEventListener(
        "loadeddata",
        () => racePaintedFrame(),
        { once: true },
      );
      return;
    }

    // Common case: a paused video sitting on the chosen frame. Draw
    // on the next paint tick — this is the path that pre-A7d.8.5
    // hit the 4 s timeout on iOS.
    racePaintedFrame();
  });
}

/**
 * A7d.8.3 — pre-extract N evenly-spaced filmstrip thumbnails from the
 * LOCAL objectURL. Reuses the A7d.8.1 decode-safe machinery (off-screen
 * renderable <video>, muted-inline play()/pause() decode-force, the
 * requestVideoFrameCallback painted-frame await with seeked-fallback)
 * but on a SINGLE <video> that walks N seek targets serially — much
 * cheaper than N separate captureFrameBlob() calls (each of which would
 * re-prime its own decoder).
 *
 * Best-effort + bounded:
 *
 *   - Hard total-time budget (FILMSTRIP_TOTAL_TIMEOUT_MS). On expiry,
 *     resolves with whatever frames have been captured so far (possibly
 *     zero). Caller treats `[]` as "fall back to a plain slider".
 *   - Per-frame failure (no painted frame, no intrinsic size) skips the
 *     frame and moves on rather than aborting the whole strip.
 *   - Always tears down the mounted <video> on every resolution path
 *     (timeout, completion, decode error) so the body never grows a
 *     stray element per upload.
 *
 * Output is JPEG **data URLs** because the strip is purely a UI hint
 * — they live in component state and are never persisted on the draft.
 * The committed "Use this frame" path still routes through the hosted
 * uploadCapturedFrame helper below so the sep-photo-upload-requirement
 * (no data: URLs in the published payload) remains intact.
 */
async function extractFilmstripFrames(
  objectUrl: string,
  count: number,
  totalTimeoutMs: number = FILMSTRIP_TOTAL_TIMEOUT_MS,
): Promise<string[]> {
  return new Promise((resolve) => {
    const frames: string[] = [];
    const video = document.createElement("video");
    video.muted = true;
    video.setAttribute("muted", "");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
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
        // ignore
      }
      if (video.parentNode) video.parentNode.removeChild(video);
    };

    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(frames);
    };

    timeoutId = setTimeout(() => {
      // Budget expired — resolve with whatever we got. UI falls back
      // to a plain slider if frames is empty.
      settle();
    }, totalTimeoutMs);

    const rvfc = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: VideoFrameRequestCallback) => number;
      }
    ).requestVideoFrameCallback?.bind(video);

    const drawAndPush = () => {
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return;
        // Small thumbnail: longest edge ~128px. The on-screen strip
        // renders ~48–64px wide per cell, so 128 keeps it crisp on
        // retina without ballooning the data-URL string in state.
        const MAX_EDGE = 128;
        const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
        const dw = Math.max(1, Math.round(vw * scale));
        const dh = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement("canvas");
        canvas.width = dw;
        canvas.height = dh;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, dw, dh);
        frames.push(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        // Per-frame failure: skip and move on.
      }
    };

    const armPainted = (onPainted: () => void) => {
      if (rvfc) {
        rvfc(() => requestAnimationFrame(onPainted));
      } else {
        video.addEventListener("seeked", () => requestAnimationFrame(onPainted), {
          once: true,
        });
      }
    };

    const seekNext = (index: number, duration: number) => {
      if (settled) return;
      if (index >= count) {
        settle();
        return;
      }
      // Evenly distributed. Center each frame in its slice + skip the
      // very start (some encoders don't paint frame 0) and very end
      // (often a partial frame on phone clips).
      const target = ((index + 0.5) / count) * duration;
      const seekTo = Math.max(0.05, Math.min(target, Math.max(0.05, duration - 0.05)));
      armPainted(() => {
        drawAndPush();
        seekNext(index + 1, duration);
      });
      try {
        video.currentTime = seekTo;
      } catch {
        // Skip this frame on error.
        seekNext(index + 1, duration);
      }
    };

    video.addEventListener(
      "loadeddata",
      () => {
        // Decode-force on iOS (same trick as captureFrameBlob).
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
              // ignore
            });
        }
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          settle();
          return;
        }
        seekNext(0, duration);
      },
      { once: true },
    );
    video.onerror = () => settle();

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
