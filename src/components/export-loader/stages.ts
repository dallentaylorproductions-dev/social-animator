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
 * Per-export personalization context. H-7.2.2b: stage copy now
 * weaves in the actual listing address when available, so the
 * wait reads as "we're working on YOUR house" instead of generic
 * "preparing your video" boilerplate. Empty values fall through
 * to a tasteful generic phrasing.
 */
export interface StageContext {
  /** Property street address, if the draft has one. */
  address?: string;
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
    copy: "Polishing photos at print quality. Your photos stay on your device — never uploaded.",
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
    copy: "Optimizing at the bitrate that survives Instagram and TikTok recompression.",
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

/**
 * Personalized stage title/copy. Falls back to the generic
 * STAGE_DEFS values when no listing context is available. Address
 * is woven into the rendering stage title because that's the
 * longest stage — the user sees that title for most of the wait,
 * so the personalization beat pays off.
 */
export function personalizedStageCopy(
  stage: ExportStage,
  ctx: StageContext
): { title: string; copy: string } {
  const def = STAGE_DEFS[stage];
  const address = ctx.address?.trim();
  if (!address) return { title: def.title, copy: def.copy };

  switch (stage) {
    case "preparing":
      return {
        title: def.title,
        copy: `Polishing photos for ${address}. Your photos stay on your device — never uploaded.`,
      };
    case "rendering":
      return {
        title: `Crafting ${address}`,
        copy: def.copy,
      };
    case "encoding":
    case "finalizing":
      return { title: def.title, copy: def.copy };
  }
}

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
