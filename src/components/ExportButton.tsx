"use client";

import { useState, type RefObject } from "react";
import { recordCanvas, webmToMp4, downloadBlob, getFFmpeg } from "@/engine/export";

interface ExportButtonProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  duration: number;
  size: { width: number; height: number };
  filename: string;
  onStartRecording?: () => void;
}

type ExportState =
  | { kind: "idle" }
  | { kind: "recording"; progress: number }
  | { kind: "converting"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function ExportButton({
  canvasRef,
  duration,
  size,
  filename,
  onStartRecording,
}: ExportButtonProps) {
  const [state, setState] = useState<ExportState>({ kind: "idle" });

  const reset = () => setState({ kind: "idle" });

  const doRecord = async (): Promise<Blob> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas is not ready yet.");

    onStartRecording?.();

    // Give React two frames to commit the playKey bump and let Canvas re-init at t=0.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    return recordCanvas(canvas, duration, 30, (progress) =>
      setState({ kind: "recording", progress })
    );
  };

  const handleExportMp4 = async () => {
    try {
      // Start ffmpeg load in parallel with recording — 30MB WASM download
      // often finishes before the ~6s recording does.
      const ffmpegPromise = getFFmpeg();

      setState({ kind: "recording", progress: 0 });
      const webm = await doRecord();

      setState({ kind: "converting", progress: 0 });
      await ffmpegPromise; // wait for ffmpeg to be loaded if it wasn't already
      const mp4 = await webmToMp4(webm, size, duration, (progress) =>
        setState({ kind: "converting", progress })
      );

      downloadBlob(mp4, `${filename}.mp4`);
      setState({ kind: "ready" });
    } catch (err) {
      console.error("MP4 export failed:", err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleExportWebm = async () => {
    try {
      setState({ kind: "recording", progress: 0 });
      const webm = await doRecord();
      downloadBlob(webm, `${filename}.webm`);
      setState({ kind: "ready" });
    } catch (err) {
      console.error("WebM export failed:", err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const isBusy = state.kind === "recording" || state.kind === "converting";

  return (
    <div className="space-y-2">
      <button
        onClick={handleExportMp4}
        disabled={isBusy}
        className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state.kind === "idle" && "Export MP4"}
        {state.kind === "recording" &&
          `Recording… ${Math.round(state.progress * 100)}%`}
        {state.kind === "converting" &&
          `Converting to MP4… ${Math.round(state.progress * 100)}%`}
        {state.kind === "ready" && "Export MP4  ✓ downloaded"}
        {state.kind === "error" && "Try again — Export MP4"}
      </button>

      <button
        onClick={handleExportWebm}
        disabled={isBusy}
        className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-2 text-xs font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Export WebM (fallback)
      </button>

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
            Try the WebM fallback above, or{" "}
            <button
              onClick={reset}
              className="underline hover:text-neutral-300"
            >
              reset
            </button>
            .
          </p>
        </div>
      )}
    </div>
  );
}
