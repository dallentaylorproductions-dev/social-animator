"use client";

import { Timeline } from "./timeline";
import { getWarmupMs, webmToMp4 } from "./export";
import { renderTimelineToWebm } from "@/tools/listing-flyer/engine/render-mp4";
import { PHASE_NAMES, measurePhase } from "@/lib/perf";

/**
 * MP4 render pipeline (W-3.2 consolidation).
 *
 * All four tools (Listing Flyer, Open House Promo, Listing Presentation,
 * Social Animator) and all platforms (Mac/Windows Chrome, iOS Safari,
 * Android) now use a single MP4 export path:
 *
 *   canvas paint via rAF → MediaRecorder captureStream → WebM blob →
 *   ffmpeg.wasm transcode → MP4 blob
 *
 * The frame-by-frame PNG-sequence path that used to live here (active for
 * desktop Chrome on the Listing Flyer + OH Promo tools) has been deleted.
 * It produced equivalent visual output at ~5x the wall-clock cost (per the
 * H-7.14 perf audit) by encoding every frame as a PNG in JavaScript and
 * feeding the sequence to ffmpeg from scratch. The MediaRecorder path is
 * what the iOS Safari branch already used and what Social Animator has
 * always used; consolidating onto it both speeds up exports and eliminates
 * the parallel-path divergence class that caused the v1.39.2 bullet
 * regression.
 *
 * The W-3.1 audit at docs/W-3-mp4-pipeline-consolidation-audit.md has the
 * full rationale, code refs, and risk analysis.
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
   * Object URL for the most recently rendered frame as a JPEG preview.
   * Caller is responsible for revoking older URLs as new ones arrive.
   */
  livePreviewUrl?: string;
}

/**
 * Render the given timeline to an MP4 Blob.
 *
 * Thin wrapper around renderViaMediaRecorder kept as the public API so
 * external callers (Listing Flyer ExportButtons.handleMp4Export, OH
 * Promo renderPromoMp4) don't need to change. Social Animator's
 * ExportButton.tsx bypasses this and calls recordCanvas + webmToMp4
 * directly — the building blocks renderViaMediaRecorder composes.
 */
export async function renderTimelineToMp4(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  size: { width: number; height: number },
  durationSec: number,
  background: string,
  onProgress?: (p: FrameRenderProgress) => void
): Promise<Blob> {
  return renderViaMediaRecorder(
    canvas,
    timeline,
    size,
    durationSec,
    background,
    onProgress
  );
}

/**
 * MediaRecorder + WebM-to-MP4 path. Two steps:
 *
 *   1. renderTimelineToWebm — paints the timeline into the caller's
 *      canvas via a rAF loop, then captures the canvas's MediaStream
 *      into a WebM (or MP4 on iOS Safari native) blob. Holds the
 *      animation at t=0 for getWarmupMs() to absorb iOS Safari's
 *      captureStream startup gap.
 *   2. webmToMp4 — transcodes the recorded blob to a normalized MP4
 *      via ffmpeg.wasm, trimming the warmup pre-roll out via `-ss`.
 */
async function renderViaMediaRecorder(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  size: { width: number; height: number },
  durationSec: number,
  background: string,
  onProgress?: (p: FrameRenderProgress) => void
): Promise<Blob> {
  // H-7.2.4-3: live preview comes in on a separate cadence (every ~500ms)
  // from progress (per-rAF). Track both in closure-local state and re-emit
  // FrameRenderProgress whenever either updates so the loader's
  // LiveThumbnail receives blob URLs alongside the regular progress ticks.
  let lastProgress = 0;
  let lastPreviewUrl: string | undefined;
  const emitRendering = () =>
    onProgress?.({
      phase: "rendering",
      progress: lastProgress,
      livePreviewUrl: lastPreviewUrl,
    });

  // H-7.14: recorder-active covers the entire recordCanvas-driven capture
  // (the warmup pre-roll is internal to that function and reported as part
  // of this same phase). recorder-finalize covers the webm → mp4 transcode
  // (the wasm container swap + re-encode).
  const webm = await measurePhase(PHASE_NAMES.RECORDER_ACTIVE, () =>
    renderTimelineToWebm(
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
    )
  );
  const mp4 = await measurePhase(PHASE_NAMES.RECORDER_FINALIZE, () =>
    webmToMp4(
      webm,
      size,
      durationSec,
      (p) => onProgress?.({ phase: "encoding", progress: p }),
      getWarmupMs()
    )
  );
  onProgress?.({ phase: "finalizing", progress: 1 });
  return mp4;
}
