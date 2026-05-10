/**
 * Shared progress contract for MP4 export pipelines (Listing Flyer +
 * Open House Promo). The render-mp4 engines emit phase-based updates;
 * the ExportButtons handler translates those into this 4-stage shape
 * before handing it to ExportLoader. Keeping the engine-side types
 * unchanged means new tools can opt in by mapping their own progress
 * stream to ExportProgress at the call site.
 */

export type ExportStage =
  | "preparing"
  | "rendering"
  | "encoding"
  | "finalizing";

export interface ExportProgress {
  stage: ExportStage;
  /** 0-100 within the current stage. */
  stagePercent: number;
  /** 0-100 across the full pipeline (derived from stage + stagePercent). */
  overallPercent: number;
  /** Wall-clock ms since the export handler kicked off. */
  elapsedMs: number;
  /** Optional sub-label for batch exports — e.g. "Reel (1 of 2)". */
  label?: string;
  /** Current frame number (only meaningful during stage="rendering"). */
  frameIndex?: number;
  /** Total frame count (only meaningful during stage="rendering"). */
  totalFrames?: number;
  /**
   * Object URL for a JPEG preview of the most recently rendered
   * frame. Only populated by the frame-by-frame engine path; the
   * iOS MediaRecorder fallback leaves it undefined.
   */
  livePreviewUrl?: string;
  /** Aspect of the video being exported — drives LiveThumbnail sizing. */
  aspect?: "reel" | "square";
}
