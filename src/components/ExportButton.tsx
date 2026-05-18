"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  recordCanvas,
  webmToMp4,
  shareOrDownload,
  isMobileDevice,
  getFFmpeg,
} from "@/engine/export";
import {
  PHASE_NAMES,
  endRun,
  measurePhase,
  startRun,
} from "@/lib/perf";

interface ExportButtonProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  duration: number;
  size: { width: number; height: number };
  filename: string;
  onStartRecording?: () => void;
  /** H-7.14: template identity for the perf record. Optional so existing
   *  callers that don't supply it still compile; perf record is created
   *  regardless but the templateId field is left undefined. */
  templateId?: string;
  /** H-7.14: counted from the editor's loaded image assets. Drives the
   *  audit's "scaling with photoCount" cuts. */
  photoCount?: number;
}

type ExportState =
  | { kind: "idle" }
  | { kind: "recording"; progress: number }
  | { kind: "converting"; progress: number }
  | { kind: "ready"; blob: Blob; filename: string }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function ExportButton({
  canvasRef,
  duration,
  size,
  filename,
  onStartRecording,
  templateId,
  photoCount = 0,
}: ExportButtonProps) {
  const [state, setState] = useState<ExportState>({ kind: "idle" });

  // Auto-revert from saved → idle so user can immediately export again
  useEffect(() => {
    if (state.kind === "saved") {
      const t = setTimeout(() => setState({ kind: "idle" }), 3000);
      return () => clearTimeout(t);
    }
  }, [state.kind]);

  const reset = () => setState({ kind: "idle" });

  const doRecord = async (): Promise<Blob> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas is not ready yet.");

    onStartRecording?.();

    // Two frames for React commit + Canvas re-init at t=0
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    return recordCanvas(canvas, duration, 30, (progress) =>
      setState({ kind: "recording", progress })
    );
  };

  /** After export completes: auto-save on desktop, wait for tap on mobile. */
  const finishWithBlob = async (blob: Blob, finalFilename: string) => {
    if (isMobileDevice()) {
      // Mobile: hold blob, wait for explicit user tap so navigator.share() gets
      // a fresh user gesture. Without this, iOS Safari blocks the share sheet
      // and falls back to a "Do you want to download" prompt.
      setState({ kind: "ready", blob, filename: finalFilename });
    } else {
      // Desktop: auto-download as before, no extra click required
      await shareOrDownload(blob, finalFilename);
      setState({ kind: "saved" });
    }
  };

  const handleExportMp4 = async () => {
    // H-7.14: portrait-ish (height > width) → mp4-reel; otherwise mp4-sq.
    // Covers the 3 Social Animator sizes (Feed 1080×1350, Square 1080×1080,
    // Story 1080×1920) since the perf enum is intentionally coarse.
    const perfRun = startRun({
      toolId: "social-animator",
      output: size.height > size.width ? "mp4-reel" : "mp4-sq",
      templateId,
      photoCount,
    });
    try {
      const ffmpegPromise = measurePhase(PHASE_NAMES.FFMPEG_LOAD, () =>
        getFFmpeg()
      );

      setState({ kind: "recording", progress: 0 });
      const webm = await measurePhase(PHASE_NAMES.RECORDER_ACTIVE, () =>
        doRecord()
      );

      setState({ kind: "converting", progress: 0 });
      await ffmpegPromise;
      const mp4 = await measurePhase(PHASE_NAMES.RECORDER_FINALIZE, () =>
        webmToMp4(webm, size, duration, (progress) =>
          setState({ kind: "converting", progress })
        )
      );

      await finishWithBlob(mp4, `${filename}.mp4`);
    } catch (err) {
      console.error("MP4 export failed:", err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      endRun(perfRun);
    }
  };

  const handleSave = async () => {
    if (state.kind !== "ready") return;
    try {
      const result = await shareOrDownload(state.blob, state.filename);
      if (result === "cancelled") {
        // User dismissed the share sheet — stay in "ready" so they can tap again
        return;
      }
      setState({ kind: "saved" });
    } catch (err) {
      console.error("Save failed:", err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const isBusy = state.kind === "recording" || state.kind === "converting";

  return (
    <div className="space-y-2">
      {state.kind === "ready" ? (
        <button
          onClick={handleSave}
          className="w-full bg-mint hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition"
        >
          Save video
        </button>
      ) : (
        <button
          onClick={handleExportMp4}
          disabled={isBusy}
          className="w-full bg-mint hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state.kind === "idle" && "Export MP4"}
          {state.kind === "recording" &&
            `Recording… ${Math.round(state.progress * 100)}%`}
          {state.kind === "converting" &&
            `Converting to MP4… ${Math.round(state.progress * 100)}%`}
          {state.kind === "saved" && "Saved ✓"}
          {state.kind === "error" && "Try again — Export MP4"}
        </button>
      )}

      {state.kind === "ready" && (
        <p className="text-[11px] text-neutral-500 leading-snug">
          Tap to save. On phone the share sheet opens — pick &quot;Save Video&quot;
          to add to your Camera Roll.
        </p>
      )}

      {state.kind === "recording" && (
        <p className="text-[11px] text-neutral-500 leading-snug">
          Keep this tab focused until recording finishes (~{Math.ceil(duration)}s).
        </p>
      )}

      {state.kind === "converting" && (
        <p className="text-[11px] text-neutral-500 leading-snug">
          Converting in your browser. First conversion of this session may take
          20–40s while ffmpeg downloads.
        </p>
      )}

      {state.kind === "error" && (
        <div className="text-[11px] text-red-400 leading-snug break-words space-y-1">
          <p>Export failed: {state.message}</p>
          <p className="text-neutral-500">
            <button
              onClick={reset}
              className="underline hover:text-neutral-300"
            >
              Reset and try again
            </button>
            .
          </p>
        </div>
      )}
    </div>
  );
}
