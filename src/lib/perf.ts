/**
 * H-7.14 perf instrumentation harness.
 *
 * Gated behind ?perf=1 — no behavior change and zero overhead when the URL
 * flag is absent. See docs/H-7.14-render-perf-audit.md (Commit 2) for the
 * measurement matrix this harness feeds.
 *
 * Usage pattern at an export entry point:
 *
 *   const run = startRun({ toolId: "listing-flyer", output: "pdf", photoCount: 5 });
 *   const doc = measurePhaseSync("pdf-doc-build", () => buildDoc(state));
 *   const blob = await measurePhase("pdf-render-to-blob", () => pdf(doc).toBlob());
 *   endRun(run);
 *
 * Phase names are canonical — keep them in sync with the audit doc so the
 * comparison table can be assembled mechanically. See PHASE_NAMES below.
 */

export const PHASE_NAMES = {
  // PDF path (all tools)
  PDF_DOC_BUILD: "pdf-doc-build",
  PDF_RENDER_TO_BLOB: "pdf-render-to-blob",
  // JPEG path (PDF + rasterization)
  PDFJS_LOAD: "pdfjs-load",
  PDFJS_RASTERIZE: "pdfjs-rasterize",
  CANVAS_TO_JPEG_BLOB: "canvas-to-jpeg-blob",
  // MP4 frame-by-frame path (desktop)
  FFMPEG_LOAD: "ffmpeg-load",
  FRAME_RENDER_LOOP: "frame-render-loop",
  FRAME_CAPTURE_LOOP: "frame-capture-loop",
  FFMPEG_ENCODE: "ffmpeg-encode",
  FINAL_BLOB_DELIVER: "final-blob-deliver",
  // MP4 MediaRecorder path (iOS Safari)
  RECORDER_WARMUP: "recorder-warmup",
  RECORDER_ACTIVE: "recorder-active",
  RECORDER_FINALIZE: "recorder-finalize",
  // Cross-tool
  PHOTO_DECODE_ALL: "photo-decode-all",
  // OH Promo only
  QR_GENERATE: "qr-generate",
} as const;

export type ToolId =
  | "listing-flyer"
  | "open-house-promo"
  | "listing-presentation"
  | "social-animator";

export type Output =
  | "pdf"
  | "jpeg"
  | "mp4-reel"
  | "mp4-sq"
  | "qr-png";

export interface RunMeta {
  toolId: ToolId;
  output: Output;
  templateId?: string;
  photoCount: number;
}

export interface FrameStats {
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

export interface RunRecord extends RunMeta {
  cold: boolean;
  totalMs: number;
  phases: Record<string, number>;
  frameStats?: FrameStats;
  userAgent: string;
  timestamp: string;
}

interface ActiveRun {
  meta: RunMeta;
  startTime: number;
  phases: Record<string, number>;
  frameTimes: number[];
  noop: boolean;
}

export type RunHandle = ActiveRun;

// ── Module state ────────────────────────────────────────────────────────

// Tracks whether any ffmpeg-using export has occurred this session. The
// first MP4 export pays the wasm-init tax (~1-2s); subsequent exports
// reuse the loaded module. The `cold` flag on RunRecord captures this so
// the audit doc can separate cold vs warm MP4 timings.
let coldRunHappened = false;

// Only one run can be active at a time. Subsequent startRun calls override
// (a paranoid safety — in practice exports are user-triggered + sequential).
let activeRun: ActiveRun | null = null;

const EVENT_NAME = "perf-run-recorded";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns true when the page URL contains `?perf=1`. Plain function (not
 * a React hook despite the `use` prefix — it must be callable from the
 * render engines that aren't React contexts). SSR-safe: returns false
 * when `window` is undefined.
 */
export function usePerfEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // URLSearchParams handles edge cases (perf=1&other=x, ?perf=1, etc.)
  // more cleanly than substring matching.
  try {
    return new URLSearchParams(window.location.search).get("perf") === "1";
  } catch {
    return false;
  }
}

/**
 * Begin a single user-triggered export run. Stores the start time + meta
 * on a module-level handle that subsequent measurePhase / recordFrameTime
 * calls attribute to. Returns the handle so the caller can pass it
 * explicitly to recordFrameTime + endRun.
 *
 * No-op when perf is disabled — returns a sentinel handle whose noop flag
 * causes all dependent calls to short-circuit. Total cost in the disabled
 * path: one URLSearchParams check + one object allocation.
 */
export function startRun(meta: RunMeta): RunHandle {
  // usePerfEnabled is named with the React `use` prefix per the spec but
  // is a plain function — no hooks called inside, safe in any context.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (!usePerfEnabled()) {
    return {
      meta,
      startTime: 0,
      phases: {},
      frameTimes: [],
      noop: true,
    };
  }
  const handle: ActiveRun = {
    meta,
    startTime: performance.now(),
    phases: {},
    frameTimes: [],
    noop: false,
  };
  activeRun = handle;
  return handle;
}

/**
 * Wrap an async phase. Records the wall-clock duration into the active
 * run's phases bag under `name`. If perf is disabled or no run is active,
 * the function passes through with zero overhead (no timer started).
 *
 * Multiple calls with the same name accumulate (useful for loops that
 * want to track total time across iterations under one phase name).
 */
export async function measurePhase<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!activeRun || activeRun.noop) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const dur = performance.now() - start;
    activeRun.phases[name] = (activeRun.phases[name] ?? 0) + dur;
  }
}

/**
 * Synchronous variant of measurePhase. Same semantics, no Promise.
 */
export function measurePhaseSync<T>(name: string, fn: () => T): T {
  if (!activeRun || activeRun.noop) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    const dur = performance.now() - start;
    activeRun.phases[name] = (activeRun.phases[name] ?? 0) + dur;
  }
}

/**
 * Record a single frame's render time onto the run's frameTimes array.
 * Aggregated into FrameStats (count/min/max/avg) at endRun. Caller is
 * responsible for measuring the frame interval; this just stashes the
 * number cheaply.
 */
export function recordFrameTime(handle: RunHandle, frameMs: number): void {
  if (handle.noop) return;
  handle.frameTimes.push(frameMs);
}

/**
 * Finish a run. Computes the RunRecord (including cold/warm + frame
 * aggregates), pushes it onto window.__perf, and dispatches a custom
 * event so PerfToast can pick it up without prop drilling.
 *
 * Returns the RunRecord (or an empty placeholder when perf is disabled
 * — useful so callers can `const rec = endRun(run); doSomething(rec)`
 * without null-checking everywhere).
 */
export function endRun(handle: RunHandle): RunRecord {
  if (handle.noop) {
    return {
      ...handle.meta,
      cold: false,
      totalMs: 0,
      phases: {},
      userAgent: "",
      timestamp: new Date().toISOString(),
    };
  }
  const totalMs = performance.now() - handle.startTime;
  const isFfmpegRun =
    handle.meta.output === "mp4-reel" || handle.meta.output === "mp4-sq";
  const cold = isFfmpegRun && !coldRunHappened;
  if (isFfmpegRun) coldRunHappened = true;

  const record: RunRecord = {
    ...handle.meta,
    cold,
    totalMs,
    phases: { ...handle.phases },
    frameStats: aggregateFrameTimes(handle.frameTimes),
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const w = window as PerfWindow;
    if (!w.__perf) w.__perf = [];
    w.__perf.push(record);
    window.dispatchEvent(
      new CustomEvent<RunRecord>(EVENT_NAME, { detail: record })
    );
  }

  if (activeRun === handle) activeRun = null;
  return record;
}

/**
 * Currently-active run, or null if no run is in progress. Exposed so engine
 * code (frame-render loop, recorder loop) can attribute per-frame stats
 * without each helper signature carrying an explicit RunHandle parameter.
 * The handle returned is the same one startRun returned — pass it to
 * recordFrameTime directly.
 */
export function getActiveRun(): RunHandle | null {
  return activeRun;
}

/** Most recent run, or null if none recorded this session. */
export function getLastRun(): RunRecord | null {
  if (typeof window === "undefined") return null;
  const arr = (window as PerfWindow).__perf;
  return arr && arr.length > 0 ? arr[arr.length - 1] : null;
}

/** Every RunRecord this session, in chronological order. */
export function getAllRuns(): RunRecord[] {
  if (typeof window === "undefined") return [];
  return (window as PerfWindow).__perf ?? [];
}

/** Constant for PerfToast to subscribe to. Exported so test code can fire
 *  synthetic events without re-stringifying the name. */
export const PERF_EVENT_NAME = EVENT_NAME;

// ── Internals ───────────────────────────────────────────────────────────

interface PerfWindow extends Window {
  __perf?: RunRecord[];
}

function aggregateFrameTimes(times: number[]): FrameStats | undefined {
  if (times.length === 0) return undefined;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const t of times) {
    if (t < min) min = t;
    if (t > max) max = t;
    sum += t;
  }
  return {
    count: times.length,
    minMs: min,
    maxMs: max,
    avgMs: sum / times.length,
  };
}
