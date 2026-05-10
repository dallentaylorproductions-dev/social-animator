import type { ExportStage } from "./types";

interface StageDef {
  title: string;
  copy: string;
  /** Where this stage starts in the overall 0-100 progress bar. */
  overallStart: number;
  /** Where this stage ends. */
  overallEnd: number;
}

/**
 * Stage definitions drive both the loader UI (title + copy) and the
 * overall-progress mapping. Copy is intentionally educational —
 * each stage reinforces a positioning beat (privacy, quality,
 * platform optimization) so the wait time builds trust instead of
 * burning patience.
 *
 * H-7.2.1 retuned the overall split now that frame-by-frame is the
 * desktop path. Wall-clock observations (desktop, 10s export):
 *   preparing:  ~1-2s     (10%)
 *   rendering:  ~30-45s   (55%)  — frame loop dominates
 *   encoding:   ~15-25s   (30%)  — ffmpeg PNG-sequence encode
 *   finalizing: ~0.5s     (5%)   — blob assembly + share-sheet prep
 *
 * Per-duration end-to-end estimates (desktop frame-by-frame path):
 *   5s:  ~30-40s
 *   10s: ~55-75s
 *   15s: ~95-130s
 * iOS uses the legacy MediaRecorder path with shorter wall-clock
 * times (~10-25s) but those numbers are platform-specific.
 */
export const STAGE_DEFS: Record<ExportStage, StageDef> = {
  preparing: {
    title: "Preparing your assets",
    copy: "Compressing photos at print quality. Your photos stay on your device — never uploaded.",
    overallStart: 0,
    overallEnd: 10,
  },
  rendering: {
    title: "Rendering frames at 1080p",
    copy: "Drawing each frame in your browser — no cloud, no upload.",
    overallStart: 10,
    overallEnd: 65,
  },
  encoding: {
    title: "Encoding for social platforms",
    copy: "Optimizing at the bitrate that survives platform recompression.",
    overallStart: 65,
    overallEnd: 95,
  },
  finalizing: {
    title: "Almost there",
    copy: "Wrapping up — about to hand off to your share sheet.",
    overallStart: 95,
    overallEnd: 100,
  },
};

export const STAGE_ORDER: ExportStage[] = [
  "preparing",
  "rendering",
  "encoding",
  "finalizing",
];

/** Map a (stage, stagePercent 0-100) pair to an overall 0-100 value. */
export function overallProgress(
  stage: ExportStage,
  stagePercent: number
): number {
  const def = STAGE_DEFS[stage];
  const clamped = Math.max(0, Math.min(100, stagePercent));
  return def.overallStart + (def.overallEnd - def.overallStart) * (clamped / 100);
}
