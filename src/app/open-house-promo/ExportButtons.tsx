"use client";

import { useEffect, useRef, useState } from "react";
import {
  type PromoDraft,
  exportFilenamePrefix,
  validateForExport,
} from "@/tools/open-house-promo/engine/types";
import {
  clearDraft,
  saveDraft,
} from "@/tools/open-house-promo/engine/draft-storage";
import { generatePdfBlob } from "@/tools/open-house-promo/output/pdf-export";
import { exportJpegFromDraft } from "@/tools/open-house-promo/engine/jpeg-export";
import { generateQrDataUrl } from "@/tools/open-house-promo/output/qr";
import {
  renderPromoMp4,
  type RenderProgressUpdate,
} from "@/tools/open-house-promo/engine/render-mp4";
import {
  downloadBlob,
  isMobileDevice,
  shareOrDownload,
} from "@/engine/export";
import { type BrandSettings } from "@/lib/brand";
import { ExportLoader } from "@/components/export-loader/ExportLoader";
import type { ExportProgress, ExportStage } from "@/components/export-loader/types";
import { overallProgress } from "@/components/export-loader/stages";

interface ExportButtonsProps {
  draft: PromoDraft;
  brand: BrandSettings;
  brandLogoImg: HTMLImageElement | null;
}

type SimpleState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type Mp4Phase = "preparing" | "rendering-reel" | "rendering-square";

type Mp4State =
  | { kind: "idle" }
  | { kind: "running"; phase: Mp4Phase; progress: number }
  // Mobile two-step: render finished, blobs held in state, waiting on
  // a fresh user gesture (tap on Save Reel / Save Square) to call
  // navigator.share. iOS Safari's user-gesture token expires across
  // long renders, so calling share() automatically after render
  // fails. Mirrors the listing-flyer's H-1.8h two-step pattern.
  | {
      kind: "ready";
      reelBlob: Blob;
      reelFilename: string;
      reelSaved: boolean;
      squareBlob: Blob;
      squareFilename: string;
      squareSaved: boolean;
    }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function ExportButtons({
  draft,
  brand,
  brandLogoImg,
}: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<SimpleState>({ kind: "idle" });
  const [jpegState, setJpegState] = useState<SimpleState>({ kind: "idle" });
  const [qrState, setQrState] = useState<SimpleState>({ kind: "idle" });
  const [mp4State, setMp4State] = useState<Mp4State>({ kind: "idle" });
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  // Transition to "done" once both reel + square have been saved.
  // useEffect avoids a race between the two save handlers.
  useEffect(() => {
    if (
      mp4State.kind === "ready" &&
      mp4State.reelSaved &&
      mp4State.squareSaved
    ) {
      clearDraft();
      setMp4State({ kind: "done" });
      const t = setTimeout(() => setMp4State({ kind: "idle" }), 3000);
      return () => clearTimeout(t);
    }
  }, [mp4State]);

  const validationError = validateForExport(draft);
  const qrValidationError = validationError ?? (
    draft.qrTargetUrl.trim() ? null : "Add a target URL above"
  );
  const isBusy =
    pdfState.kind === "generating" ||
    jpegState.kind === "generating" ||
    qrState.kind === "generating" ||
    mp4State.kind === "running" ||
    mp4State.kind === "ready";
  const canExport = !validationError && !isBusy;
  const canExportQr = !qrValidationError && !isBusy;

  const filenamePrefix = exportFilenamePrefix(draft);

  // ── PDF ────────────────────────────────────────────────
  const handlePdfExport = async () => {
    if (!canExport) return;
    saveDraft(draft);
    setPdfState({ kind: "generating" });
    try {
      const blob = await generatePdfBlob(draft, brand);
      const filename = `${filenamePrefix}-open-house.pdf`;
      const result = await shareOrDownload(blob, filename);
      if (result === "shared" || result === "downloaded") clearDraft();
      setPdfState({ kind: "done" });
      setTimeout(() => setPdfState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[promo pdf]", err);
      setPdfState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // ── JPEG ───────────────────────────────────────────────
  const handleJpegExport = async () => {
    if (!canExport) return;
    saveDraft(draft);
    setJpegState({ kind: "generating" });
    try {
      const blob = await exportJpegFromDraft(draft, brand);
      const filename = `${filenamePrefix}-open-house.jpg`;
      const result = await shareOrDownload(blob, filename);
      if (result === "shared" || result === "downloaded") clearDraft();
      setJpegState({ kind: "done" });
      setTimeout(() => setJpegState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[promo jpeg]", err);
      setJpegState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // ── QR PNG ─────────────────────────────────────────────
  const handleQrExport = async () => {
    if (!canExportQr) return;
    saveDraft(draft);
    setQrState({ kind: "generating" });
    try {
      // Standalone QR is rendered at 800px on a white background
      // with high-contrast dark foreground — independent of the
      // brand palette so it scans reliably from any printed
      // surface, regardless of where the realtor pastes it.
      const qrFg = "#000000";
      const qrBg = "#ffffff";
      const dataUrl = await generateQrDataUrl(
        draft.qrTargetUrl,
        800,
        qrFg,
        qrBg
      );
      if (!dataUrl) throw new Error("Could not generate QR code");
      const blob = await dataUrlToBlob(dataUrl);
      const slug = filenamePrefix.split("-").slice(3).join("-") || "open-house";
      const filename = `${slug}-qr-code.png`;
      const result = await shareOrDownload(blob, filename);
      if (result === "shared" || result === "downloaded") clearDraft();
      setQrState({ kind: "done" });
      setTimeout(() => setQrState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[promo qr]", err);
      setQrState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // ── MP4 reel + square ─────────────────────────────────
  const handleMp4Export = async () => {
    if (!canExport) return;
    saveDraft(draft);
    const canvas = hiddenCanvasRef.current;
    if (!canvas) {
      setMp4State({
        kind: "error",
        message: "Hidden render canvas missing — try refresh.",
      });
      return;
    }
    setMp4State({ kind: "running", phase: "preparing", progress: 0 });

    // Single wall-clock origin for the loader's elapsed counter,
    // covering both sizes so the user sees a continuous timer
    // across the reel→square transition.
    const startedAt = Date.now();
    const emit = (
      stage: ExportStage,
      stagePercent: number,
      label?: string
    ) =>
      setExportProgress({
        stage,
        stagePercent,
        overallPercent: overallProgress(stage, stagePercent),
        elapsedMs: Date.now() - startedAt,
        label,
      });

    try {
      emit("preparing", 50);
      // Sequential renders, never concurrent (memory pressure on
      // mobile). Render BOTH first, then surface share sheets only
      // after both blobs are in hand — same pattern v1.19+ uses for
      // the flyer's reel/square pair.
      const sizes = [
        { label: "reel" as const, width: 1080, height: 1920, phase: "rendering-reel" as const, loaderLabel: "Reel (1 of 2)" },
        { label: "square" as const, width: 1080, height: 1080, phase: "rendering-square" as const, loaderLabel: "Square (2 of 2)" },
      ];
      const rendered: Array<{ label: string; blob: Blob }> = [];
      for (const sz of sizes) {
        setMp4State({ kind: "running", phase: sz.phase, progress: 0 });
        emit("rendering", 0, sz.loaderLabel);
        const onProgress = (update: RenderProgressUpdate) => {
          // Combine render+convert progress into a single 0..1
          // bar — render takes ~2/3 of wall time on a typical
          // device, convert ~1/3, so weight accordingly.
          const combined =
            update.phase === "rendering"
              ? update.progress * 0.66
              : 0.66 + update.progress * 0.34;
          setMp4State({
            kind: "running",
            phase: sz.phase,
            progress: combined,
          });
          // Map engine phases onto the 4-stage loader model:
          //   "rendering"  → "rendering" stage  (recording floor)
          //   "converting" → "encoding"  stage  (ffmpeg)
          if (update.phase === "rendering") {
            emit("rendering", update.progress * 100, sz.loaderLabel);
          } else {
            emit("encoding", update.progress * 100, sz.loaderLabel);
          }
        };
        const blob = await renderPromoMp4(
          draft,
          brand,
          { width: sz.width, height: sz.height },
          canvas,
          brandLogoImg,
          onProgress
        );
        rendered.push({ label: sz.label, blob });
      }

      const reelBlob = rendered[0].blob;
      const squareBlob = rendered[1].blob;
      const reelFilename = `${filenamePrefix}-reel.mp4`;
      const squareFilename = `${filenamePrefix}-square.mp4`;

      emit("finalizing", 50);

      if (isMobileDevice()) {
        // iOS Safari user-gesture-token expires across the ~30s
        // render — defer the share-sheet to a fresh user tap.
        setMp4State({
          kind: "ready",
          reelBlob,
          reelFilename,
          reelSaved: false,
          squareBlob,
          squareFilename,
          squareSaved: false,
        });
      } else {
        downloadBlob(reelBlob, reelFilename);
        downloadBlob(squareBlob, squareFilename);
        clearDraft();
        setMp4State({ kind: "done" });
        setTimeout(() => setMp4State({ kind: "idle" }), 5000);
      }
      emit("finalizing", 100);
    } catch (err) {
      console.error("[promo mp4]", err);
      setMp4State({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Loader closes once the pipeline finishes (success OR error).
      // On mobile success, the share-sheet handoff happens via the
      // separate Save Reel / Save Square buttons after this returns.
      setExportProgress(null);
    }
  };

  const handleSaveReel = async () => {
    if (mp4State.kind !== "ready") return;
    const ready = mp4State;
    const result = await shareOrDownload(ready.reelBlob, ready.reelFilename);
    if (result !== "shared" && result !== "downloaded") return;
    setMp4State((prev) =>
      prev.kind === "ready" ? { ...prev, reelSaved: true } : prev
    );
  };
  const handleSaveSquare = async () => {
    if (mp4State.kind !== "ready") return;
    const ready = mp4State;
    const result = await shareOrDownload(
      ready.squareBlob,
      ready.squareFilename
    );
    if (result !== "shared" && result !== "downloaded") return;
    setMp4State((prev) =>
      prev.kind === "ready" ? { ...prev, squareSaved: true } : prev
    );
  };
  const handleDismissMp4Ready = () => {
    if (mp4State.kind !== "ready") return;
    setMp4State({ kind: "idle" });
  };

  return (
    <div className="space-y-5">
      {exportProgress && (
        <ExportLoader progress={exportProgress} brand={brand} />
      )}
      {/* PRINT & SHARE group */}
      <div className="space-y-3">
        <p className="text-[9px] uppercase tracking-[0.18em] text-neutral-500">
          Print &amp; share
        </p>
        <button
          type="button"
          onClick={handlePdfExport}
          disabled={!canExport}
          title={validationError ?? undefined}
          className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pdfState.kind === "idle" && "Export PDF"}
          {pdfState.kind === "generating" && "Generating PDF…"}
          {pdfState.kind === "done" && "PDF saved ✓"}
          {pdfState.kind === "error" && "Try again — Export PDF"}
        </button>
        <button
          type="button"
          onClick={handleJpegExport}
          disabled={!canExport}
          title={validationError ?? undefined}
          className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {jpegState.kind === "idle" && "Export JPEG (Camera Roll)"}
          {jpegState.kind === "generating" && "Generating JPEG…"}
          {jpegState.kind === "done" && "JPEG saved ✓"}
          {jpegState.kind === "error" && "Try again — Export JPEG"}
        </button>
        <button
          type="button"
          onClick={handleQrExport}
          disabled={!canExportQr}
          title={qrValidationError ?? undefined}
          className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {qrState.kind === "idle" && "Export QR Code (PNG)"}
          {qrState.kind === "generating" && "Generating QR…"}
          {qrState.kind === "done" && "QR saved ✓"}
          {qrState.kind === "error" && "Try again — Export QR"}
        </button>
      </div>

      {/* SOCIAL VIDEO group */}
      <div className="space-y-3 pt-3 border-t border-neutral-800/60">
        <p className="text-[9px] uppercase tracking-[0.18em] text-neutral-500">
          Social video
        </p>
        {mp4State.kind === "ready" ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-md p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-neutral-300 leading-snug">
                Videos rendered. Tap each one to save to Photos.
              </p>
              <button
                type="button"
                onClick={handleDismissMp4Ready}
                aria-label="Dismiss without saving"
                className="text-neutral-500 hover:text-neutral-300 text-sm leading-none flex-shrink-0"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveReel}
              disabled={mp4State.reelSaved}
              className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:bg-neutral-800 disabled:text-neutral-400 disabled:cursor-default"
            >
              {mp4State.reelSaved ? "Reel saved ✓" : "Save Reel (9:16)"}
            </button>
            <button
              type="button"
              onClick={handleSaveSquare}
              disabled={mp4State.squareSaved}
              className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:bg-neutral-800 disabled:text-neutral-400 disabled:cursor-default"
            >
              {mp4State.squareSaved ? "Square saved ✓" : "Save Square (1:1)"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleMp4Export}
            disabled={!canExport}
            title={validationError ?? undefined}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {mp4State.kind === "idle" && "Render Reel + Square (MP4)"}
            {mp4State.kind === "running" && mp4StatusText(mp4State)}
            {mp4State.kind === "done" && "Both videos saved ✓"}
            {mp4State.kind === "error" && "Try again — Render videos"}
          </button>
        )}
        {mp4State.kind === "running" && (
          <p className="text-[11px] text-neutral-500 leading-snug">
            Renders Reel (9:16) and Square (1:1) back-to-back. When both
            are ready, you&apos;ll get save buttons for each. Keep this
            tab focused.
          </p>
        )}
      </div>

      {validationError && (
        <p className="text-[11px] text-neutral-500">{validationError}</p>
      )}
      {pdfState.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {pdfState.message}
        </p>
      )}
      {jpegState.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {jpegState.message}
        </p>
      )}
      {qrState.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {qrState.message}
        </p>
      )}
      {mp4State.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {mp4State.message}
        </p>
      )}

      {/* Hidden render canvas — kept in DOM so MediaRecorder
          captureStream works. Off-screen + 1×1 visible footprint. */}
      <canvas
        ref={hiddenCanvasRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function mp4StatusText(state: { phase: Mp4Phase; progress: number }): string {
  const pct = Math.round(state.progress * 100);
  switch (state.phase) {
    case "preparing":
      return "Preparing…";
    case "rendering-reel":
      return `Rendering Reel… ${pct}% (1 of 2)`;
    case "rendering-square":
      return `Rendering Square… ${pct}% (2 of 2)`;
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
