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
 * Overall percentages reflect the rough wall-clock split observed
 * during a typical 10s desktop export after the H-7.1.1 encoding
 * fixes:
 *   preparing:  ~1-2s   (10%)
 *   rendering:  ~6-7s   (40%)  — recording floor + animation
 *   encoding:   ~15-20s (45%)  — ffmpeg dominates
 *   finalizing: ~0.5s   (5%)   — blob assembly + share-sheet prep
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
    copy: "Building each frame in your browser at full resolution. Generating locally — no cloud, no server.",
    overallStart: 10,
    overallEnd: 50,
  },
  encoding: {
    title: "Encoding for social platforms",
    copy: "Optimizing for Instagram, TikTok, and Stories. Encoding at the bitrate that survives platform recompression.",
    overallStart: 50,
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
