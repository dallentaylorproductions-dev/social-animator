"use client";

import { useState, type RefObject } from "react";
import {
  recordCanvas,
  webmToMp4,
  downloadBlob,
  getFFmpeg,
} from "@/engine/export";
import { SIZE_PRESETS, type TemplateSize } from "@/templates/types";

interface BatchExportButtonProps {
  templateId: string;
  duration: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onSizeChange: (size: TemplateSize) => void;
  onPlayKeyChange: () => void;
}

type BatchPhase = "preparing" | "recording" | "converting";

type BatchState =
  | { kind: "idle" }
  | {
      kind: "running";
      currentIndex: number;
      total: number;
      phase: BatchPhase;
      sizeLabel: string;
    }
  | { kind: "done" }
  | { kind: "error"; message: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function BatchExportButton({
  templateId,
  duration,
  canvasRef,
  onSizeChange,
  onPlayKeyChange,
}: BatchExportButtonProps) {
  const [state, setState] = useState<BatchState>({ kind: "idle" });

  const handleBatch = async () => {
    try {
      // Pre-load ffmpeg once before the loop so the first conversion isn't slow
      const ffmpegPromise = getFFmpeg();

      for (let i = 0; i < SIZE_PRESETS.length; i++) {
        const preset = SIZE_PRESETS[i];

        setState({
          kind: "running",
          currentIndex: i,
          total: SIZE_PRESETS.length,
          phase: "preparing",
          sizeLabel: preset.shortLabel,
        });

        // Switch the editor's size, wait for Canvas to re-mount + settle
        onSizeChange(preset.key);
        await delay(400);

        // Reset the animation explicitly so recording starts at t=0
        onPlayKeyChange();
        await nextFrame();
        await nextFrame();

        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error(
            `Canvas was not ready when starting ${preset.shortLabel}`
          );
        }

        setState({
          kind: "running",
          currentIndex: i,
          total: SIZE_PRESETS.length,
          phase: "recording",
          sizeLabel: preset.shortLabel,
        });

        const webm = await recordCanvas(canvas, duration, 30);

        setState({
          kind: "running",
          currentIndex: i,
          total: SIZE_PRESETS.length,
          phase: "converting",
          sizeLabel: preset.shortLabel,
        });

        await ffmpegPromise;
        const mp4 = await webmToMp4(
          webm,
          { width: preset.width, height: preset.height },
          duration
        );

        downloadBlob(
          mp4,
          `${templateId}-${preset.shortLabel.toLowerCase()}.mp4`
        );
      }

      setState({ kind: "done" });
    } catch (err) {
      console.error("Batch export failed:", err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const isBusy = state.kind === "running";

  const phaseLabel = (phase: BatchPhase): string => {
    if (phase === "preparing") return "Preparing";
    if (phase === "recording") return "Recording";
    return "Converting";
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleBatch}
        disabled={isBusy}
        className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state.kind === "idle" && "Export all sizes"}
        {state.kind === "running" &&
          `${phaseLabel(state.phase)} ${state.sizeLabel}… (${state.currentIndex + 1} of ${state.total})`}
        {state.kind === "done" && "All sizes ✓ downloaded"}
        {state.kind === "error" && "Try again — Export all sizes"}
      </button>

      {state.kind === "running" && (
        <p className="text-[11px] text-neutral-500 leading-snug">
          Takes ~30–60 seconds total. Keep this tab focused throughout.
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {state.message}
        </p>
      )}
    </div>
  );
}
