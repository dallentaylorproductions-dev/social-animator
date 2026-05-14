"use client";

import { useEffect, useRef, useState } from "react";
import {
  type PromoDraft,
  type ExportFormatSelection,
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
import {
  PHASE_NAMES,
  endRun,
  measurePhase,
  startRun,
} from "@/lib/perf";

interface ExportButtonsProps {
  draft: PromoDraft;
  brand: BrandSettings;
  brandLogoImg: HTMLImageElement | null;
  /**
   * Apply a new format selection back to the page-level draft.
   * Wired up by the parent page (open-house-promo/page.tsx).
   * H-7.2.2a moved format selection into the export bar so it sits
   * next to the action it controls.
   */
  onUpdateFormats: (next: ExportFormatSelection) => void;
}

type SimpleState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type Mp4Phase = "preparing" | "rendering-reel" | "rendering-square";

/**
 * Mobile two-step UI state. H-7.2.2a allows the user to opt out of
 * either format, so reel/square blobs are nullable — only the
 * selected formats produce a blob. The "ready" transition still
 * fires once all selected formats have rendered.
 */
type Mp4State =
  | { kind: "idle" }
  | { kind: "running"; phase: Mp4Phase; progress: number }
  | {
      kind: "ready";
      reelBlob: Blob | null;
      reelFilename: string | null;
      reelSaved: boolean;
      squareBlob: Blob | null;
      squareFilename: string | null;
      squareSaved: boolean;
    }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function ExportButtons({
  draft,
  brand,
  brandLogoImg,
  onUpdateFormats,
}: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<SimpleState>({ kind: "idle" });
  const [jpegState, setJpegState] = useState<SimpleState>({ kind: "idle" });
  const [qrState, setQrState] = useState<SimpleState>({ kind: "idle" });
  const [mp4State, setMp4State] = useState<Mp4State>({ kind: "idle" });
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  // Transition to "done" once every selected format has been
  // saved. A format counts as "done" if it wasn't selected (blob
  // is null) OR was selected and saved. useEffect avoids races
  // between the two save handlers.
  useEffect(() => {
    if (mp4State.kind !== "ready") return;
    const reelDone = !mp4State.reelBlob || mp4State.reelSaved;
    const squareDone = !mp4State.squareBlob || mp4State.squareSaved;
    if (reelDone && squareDone) {
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
  const hasAnyFormat = draft.exportFormats.reel || draft.exportFormats.square;
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
    const perfRun = startRun({
      toolId: "open-house-promo",
      output: "pdf",
      photoCount: draft.photos.length,
    });
    try {
      const blob = await generatePdfBlob(draft, brand);
      const filename = `${filenamePrefix}-open-house.pdf`;
      const result = await measurePhase(PHASE_NAMES.FINAL_BLOB_DELIVER, () =>
        shareOrDownload(blob, filename)
      );
      if (result === "shared" || result === "downloaded") clearDraft();
      setPdfState({ kind: "done" });
      setTimeout(() => setPdfState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[promo pdf]", err);
      setPdfState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      endRun(perfRun);
    }
  };

  // ── JPEG ───────────────────────────────────────────────
  const handleJpegExport = async () => {
    if (!canExport) return;
    saveDraft(draft);
    setJpegState({ kind: "generating" });
    const perfRun = startRun({
      toolId: "open-house-promo",
      output: "jpeg",
      photoCount: draft.photos.length,
    });
    try {
      const blob = await exportJpegFromDraft(draft, brand);
      const filename = `${filenamePrefix}-open-house.jpg`;
      const result = await measurePhase(PHASE_NAMES.FINAL_BLOB_DELIVER, () =>
        shareOrDownload(blob, filename)
      );
      if (result === "shared" || result === "downloaded") clearDraft();
      setJpegState({ kind: "done" });
      setTimeout(() => setJpegState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[promo jpeg]", err);
      setJpegState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      endRun(perfRun);
    }
  };

  // ── QR PNG ─────────────────────────────────────────────
  const handleQrExport = async () => {
    if (!canExportQr) return;
    saveDraft(draft);
    setQrState({ kind: "generating" });
    const perfRun = startRun({
      toolId: "open-house-promo",
      output: "qr-png",
      photoCount: 0,
    });
    try {
      // Standalone QR is rendered at 800px on a white background
      // with high-contrast dark foreground — independent of the
      // brand palette so it scans reliably from any printed
      // surface, regardless of where the realtor pastes it.
      const qrFg = "#000000";
      const qrBg = "#ffffff";
      const dataUrl = await measurePhase(PHASE_NAMES.QR_GENERATE, () =>
        generateQrDataUrl(draft.qrTargetUrl, 800, qrFg, qrBg)
      );
      if (!dataUrl) throw new Error("Could not generate QR code");
      const blob = await dataUrlToBlob(dataUrl);
      const slug = filenamePrefix.split("-").slice(3).join("-") || "open-house";
      const filename = `${slug}-qr-code.png`;
      const result = await measurePhase(PHASE_NAMES.FINAL_BLOB_DELIVER, () =>
        shareOrDownload(blob, filename)
      );
      if (result === "shared" || result === "downloaded") clearDraft();
      setQrState({ kind: "done" });
      setTimeout(() => setQrState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[promo qr]", err);
      setQrState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      endRun(perfRun);
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
    // H-7.14: single run per export click, same as Listing Flyer. Output
    // tag picks the leading selected format for the enum.
    const perfRun = startRun({
      toolId: "open-house-promo",
      output: draft.exportFormats.reel ? "mp4-reel" : "mp4-sq",
      photoCount: draft.photos.length,
    });
    setMp4State({ kind: "running", phase: "preparing", progress: 0 });

    // Single wall-clock origin for the loader's elapsed counter,
    // covering both sizes so the user sees a continuous timer
    // across the reel→square transition.
    const startedAt = Date.now();
    const addressLabel = draft.propertyAddress.trim() || undefined;
    const emit = (
      stage: ExportStage,
      stagePercent: number,
      label?: string,
      extra?: {
        frameIndex?: number;
        totalFrames?: number;
        livePreviewUrl?: string;
        aspect?: "reel" | "square";
      }
    ) =>
      setExportProgress({
        stage,
        stagePercent,
        overallPercent: overallProgress(stage, stagePercent),
        elapsedMs: Date.now() - startedAt,
        label,
        addressLabel,
        ...extra,
      });

    try {
      emit("preparing", 50);
      // H-7.2.2a: filter the size list by the user's format
      // selection. Default is reel-only; common-case wait time
      // halves vs always rendering both. Sequential renders stay
      // — concurrent is still ruled out by mobile memory pressure.
      const allSizes = [
        {
          label: "reel" as const,
          width: 1080,
          height: 1920,
          phase: "rendering-reel" as const,
          aspect: "reel" as const,
          enabled: draft.exportFormats.reel,
        },
        {
          label: "square" as const,
          width: 1080,
          height: 1080,
          phase: "rendering-square" as const,
          aspect: "square" as const,
          enabled: draft.exportFormats.square,
        },
      ];
      const sizes = allSizes.filter((s) => s.enabled);
      // Loader sub-label only counts when both formats are
      // selected — a single-format export reads cleaner as just
      // "Reel" or "Square" with no count.
      const formatLabel = (sz: (typeof sizes)[number], i: number) =>
        sizes.length === 1
          ? sz.aspect === "reel"
            ? "Reel"
            : "Square"
          : `${sz.aspect === "reel" ? "Reel" : "Square"} (${i + 1} of ${sizes.length})`;

      const rendered: Array<{ label: string; blob: Blob }> = [];
      for (let i = 0; i < sizes.length; i++) {
        const sz = sizes[i];
        const loaderLabel = formatLabel(sz, i);
        setMp4State({ kind: "running", phase: sz.phase, progress: 0 });
        emit("rendering", 0, loaderLabel, { aspect: sz.aspect });
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
          //   "rendering"  → "rendering" stage  (frame iteration
          //                  on desktop, MediaRecorder on iOS)
          //   "converting" → "encoding"  stage  (ffmpeg)
          // Frame counter + live preview only flow through on the
          // desktop frame-by-frame path; iOS leaves them undefined
          // and the loader degrades gracefully.
          if (update.phase === "rendering") {
            emit("rendering", update.progress * 100, loaderLabel, {
              frameIndex: update.frameIndex,
              totalFrames: update.totalFrames,
              livePreviewUrl: update.livePreviewUrl,
              aspect: sz.aspect,
            });
          } else {
            emit("encoding", update.progress * 100, loaderLabel, {
              aspect: sz.aspect,
            });
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

      const reelEntry = rendered.find((r) => r.label === "reel") ?? null;
      const squareEntry = rendered.find((r) => r.label === "square") ?? null;
      const reelBlob = reelEntry?.blob ?? null;
      const squareBlob = squareEntry?.blob ?? null;
      const reelFilename = reelBlob ? `${filenamePrefix}-reel.mp4` : null;
      const squareFilename = squareBlob ? `${filenamePrefix}-square.mp4` : null;

      emit("finalizing", 50);

      if (isMobileDevice()) {
        // iOS Safari user-gesture-token expires across the ~30s
        // render — defer the share-sheet to a fresh user tap. Save
        // buttons render only for the formats actually rendered.
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
        if (reelBlob && reelFilename) downloadBlob(reelBlob, reelFilename);
        if (squareBlob && squareFilename) downloadBlob(squareBlob, squareFilename);
        clearDraft();
        setMp4State({ kind: "done" });
        setTimeout(() => setMp4State({ kind: "idle" }), 5000);
      }
      emit("finalizing", 100);
      // Celebration moment — held by the loader for ~800ms before
      // we clear progress. Gives the user a satisfying beat that
      // signals "done" before the share sheet appears.
      setExportProgress((prev) =>
        prev ? { ...prev, celebrate: true } : prev
      );
      await new Promise((r) => setTimeout(r, 800));
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
      endRun(perfRun);
    }
  };

  const handleSaveReel = async () => {
    if (mp4State.kind !== "ready") return;
    const { reelBlob, reelFilename } = mp4State;
    if (!reelBlob || !reelFilename) return;
    const result = await shareOrDownload(reelBlob, reelFilename);
    if (result !== "shared" && result !== "downloaded") return;
    setMp4State((prev) =>
      prev.kind === "ready" ? { ...prev, reelSaved: true } : prev
    );
  };
  const handleSaveSquare = async () => {
    if (mp4State.kind !== "ready") return;
    const { squareBlob, squareFilename } = mp4State;
    if (!squareBlob || !squareFilename) return;
    const result = await shareOrDownload(squareBlob, squareFilename);
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
                {mp4State.reelBlob && mp4State.squareBlob
                  ? "Videos rendered. Tap each one to save to Photos."
                  : "Video rendered. Tap to save to Photos."}
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
            {mp4State.reelBlob && (
              <button
                type="button"
                onClick={handleSaveReel}
                disabled={mp4State.reelSaved}
                className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:bg-neutral-800 disabled:text-neutral-400 disabled:cursor-default"
              >
                {mp4State.reelSaved ? "Reel saved ✓" : "Save Reel (9:16)"}
              </button>
            )}
            {mp4State.squareBlob && (
              <button
                type="button"
                onClick={handleSaveSquare}
                disabled={mp4State.squareSaved}
                className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:bg-neutral-800 disabled:text-neutral-400 disabled:cursor-default"
              >
                {mp4State.squareSaved ? "Square saved ✓" : "Save Square (1:1)"}
              </button>
            )}
          </div>
        ) : (
          <>
            <FormatCheckboxes
              formats={draft.exportFormats}
              onChange={onUpdateFormats}
              disabled={isBusy}
            />
            <button
              type="button"
              onClick={handleMp4Export}
              disabled={!canExport || !hasAnyFormat}
              title={validationError ?? undefined}
              className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {mp4State.kind === "idle" && renderButtonLabel(draft.exportFormats)}
              {mp4State.kind === "running" && mp4StatusText(mp4State)}
              {mp4State.kind === "done" && "Saved ✓"}
              {mp4State.kind === "error" && "Try again — Render"}
            </button>
            <p className="text-[11px] text-neutral-500 leading-snug">
              Rendering one format is faster than both. Pick what you&apos;ll
              actually post.
            </p>
          </>
        )}
        {mp4State.kind === "running" && (
          <p className="text-[11px] text-neutral-500 leading-snug">
            Sequential renders. Keep this tab focused — backgrounded tabs
            throttle the canvas paint loop.
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
      return `Rendering Reel… ${pct}%`;
    case "rendering-square":
      return `Rendering Square… ${pct}%`;
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function renderButtonLabel(formats: ExportFormatSelection): string {
  if (formats.reel && formats.square) return "Render Reel + Square (MP4)";
  if (formats.reel) return "Render Reel (MP4)";
  if (formats.square) return "Render Square (MP4)";
  return "Pick a format above";
}

/**
 * Format-selection checkboxes shown above the render button.
 * Default selection is reel-only (H-7.2.2a) since vertical reels
 * dominate realtor social distribution. Square is opt-in. The
 * onChange callback writes back through to the page-level draft
 * so the selection persists in localStorage across reloads.
 */
function FormatCheckboxes({
  formats,
  onChange,
  disabled,
}: {
  formats: ExportFormatSelection;
  onChange: (next: ExportFormatSelection) => void;
  disabled: boolean;
}) {
  const toggle = (key: "reel" | "square", value: boolean) => {
    onChange({ ...formats, [key]: value });
  };
  return (
    <div className="space-y-2 bg-neutral-900/40 border border-neutral-800/60 rounded-md p-3">
      <label className="flex items-center gap-3 text-[12px] cursor-pointer">
        <input
          type="checkbox"
          checked={formats.reel}
          onChange={(e) => toggle("reel", e.target.checked)}
          disabled={disabled}
          className="accent-[#4ef2d9] h-4 w-4"
        />
        <span className="flex-1 text-neutral-200">Reel (9:16)</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#4ef2d9]">
          Recommended
        </span>
      </label>
      <label className="flex items-center gap-3 text-[12px] cursor-pointer">
        <input
          type="checkbox"
          checked={formats.square}
          onChange={(e) => toggle("square", e.target.checked)}
          disabled={disabled}
          className="accent-[#4ef2d9] h-4 w-4"
        />
        <span className="flex-1 text-neutral-200">Square (1:1)</span>
      </label>
    </div>
  );
}
