"use client";

import { useEffect, useRef, useState } from "react";
import {
  type FlyerDraft,
  type FlyerPhoto,
  type ExportFormatSelection,
  addressSlug,
  validateForExport,
} from "@/tools/listing-flyer/engine/types";
import { clearDraft, saveDraft } from "@/tools/listing-flyer/engine/draft-storage";
import { waitForPhoto } from "@/tools/listing-flyer/engine/photos";
import { mapFlyerToShowcase } from "@/tools/listing-flyer/engine/template-mapping";
import { exportJpegFromDraft } from "@/tools/listing-flyer/engine/jpeg-export";
import { generatePdfBlob } from "@/tools/listing-flyer/output/pdf-export";
import { listingShowcaseTemplate } from "@/templates/listing-showcase";
import {
  downloadBlob,
  getFFmpeg,
  isMobileDevice,
  shareOrDownload,
} from "@/engine/export";
import { renderTimelineToMp4 } from "@/engine/frame-render";
import { type BrandSettings } from "@/lib/brand";
import { ExportLoader } from "@/components/export-loader/ExportLoader";
import type { ExportProgress, ExportStage } from "@/components/export-loader/types";
import { overallProgress } from "@/components/export-loader/stages";

interface ExportButtonsProps {
  draft: FlyerDraft;
  photos: FlyerPhoto[];
  /**
   * Effective brand — per-flyer color overrides already merged in by caller.
   * Used as-is for PDF generation and MP4 mapping.
   */
  brand: BrandSettings;
  /** Materialized brand logo from useBrandSettings — passed into MP4 export
   * so the listing-showcase template can render it in the agent card. */
  brandLogoImg: HTMLImageElement | null;
  /**
   * Apply a new format selection back to the page-level draft.
   * Wired up by the parent page (listing-flyer/page.tsx).
   * H-7.2.2a moved format selection into the export bar so it sits
   * next to the action it controls.
   */
  onUpdateFormats: (next: ExportFormatSelection) => void;
}

type PdfState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type JpegState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type Mp4Phase =
  | "preparing"
  | "rendering-reel"
  | "converting-reel"
  | "rendering-square"
  | "converting-square";

/**
 * Mobile two-step state. H-7.2.2a allows the user to opt out of
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
  photos,
  brand,
  brandLogoImg,
  onUpdateFormats,
}: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<PdfState>({ kind: "idle" });
  const [jpegState, setJpegState] = useState<JpegState>({ kind: "idle" });
  const [mp4State, setMp4State] = useState<Mp4State>({ kind: "idle" });
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  const validationError = validateForExport(draft, photos.length);
  const hasAnyFormat = draft.exportFormats.reel || draft.exportFormats.square;
  const isBusy =
    pdfState.kind === "generating" ||
    jpegState.kind === "generating" ||
    mp4State.kind === "running" ||
    mp4State.kind === "ready";
  const canExport = !validationError && !isBusy;

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

  const handlePdfExport = async () => {
    if (!canExport) return;
    // Force-flush draft to localStorage BEFORE export. Bypasses the
    // page-level debounced save so a navigation/share-sheet glitch leaves
    // the editor session recoverable on reload.
    saveDraft(draft);
    setPdfState({ kind: "generating" });
    try {
      const blob = await generatePdfBlob(draft, photos, brand);
      const filename = `${addressSlug(draft.addressLine1)}-flyer.pdf`;
      const result = await shareOrDownload(blob, filename);
      // Only clear the draft when the file actually shipped. If the user
      // dismissed the share sheet (cancelled), keep the draft so they can
      // retry without re-typing the form.
      if (result === "shared" || result === "downloaded") {
        clearDraft();
      }
      setPdfState({ kind: "done" });
      setTimeout(() => setPdfState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[flyer pdf]", err);
      setPdfState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleJpegExport = async () => {
    if (!canExport) return;
    // Same pre-export flush as PDF — JPEG generation goes through the same
    // PDF render path before rasterizing, so the same mid-export failure
    // window applies.
    saveDraft(draft);
    setJpegState({ kind: "generating" });
    try {
      const blob = await exportJpegFromDraft(draft, photos, brand);
      const filename = `${addressSlug(draft.addressLine1)}-flyer.jpg`;
      const result = await shareOrDownload(blob, filename);
      if (result === "shared" || result === "downloaded") {
        clearDraft();
      }
      setJpegState({ kind: "done" });
      setTimeout(() => setJpegState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[flyer jpeg]", err);
      setJpegState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleMp4Export = async () => {
    if (!canExport) return;
    // Same pre-export flush as PDF: a long render + new-tab nav is the
    // exact window where iOS Safari can drop the editor session.
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
    // shared across reel + square so the user sees one continuous
    // timer rather than two separate per-size timers.
    const startedAt = Date.now();
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
        ...extra,
      });

    try {
      emit("preparing", 0);
      // Pre-load ffmpeg in parallel with photo readiness
      const ffmpegPromise = getFFmpeg();

      // Wait for all photos to have materialized HTMLImageElements
      await Promise.all(photos.map((p) => waitForPhoto(p)));

      const { state, assets } = mapFlyerToShowcase(
        draft,
        photos,
        brand,
        brandLogoImg
      );
      const slug = addressSlug(draft.addressLine1);

      emit("preparing", 100);

      // H-7.2.2a: filter the size list by the user's format
      // selection. Default is reel-only; common-case wait time
      // halves vs always rendering both. Sequential renders stay
      // — concurrent is still ruled out by mobile memory pressure.
      const allSizes = [
        {
          label: "reel" as const,
          width: 1080,
          height: 1920,
          renderingPhase: "rendering-reel" as const,
          convertingPhase: "converting-reel" as const,
          aspect: "reel" as const,
          enabled: draft.exportFormats.reel,
        },
        {
          label: "square" as const,
          width: 1080,
          height: 1080,
          renderingPhase: "rendering-square" as const,
          convertingPhase: "converting-square" as const,
          aspect: "square" as const,
          enabled: draft.exportFormats.square,
        },
      ];
      const sizes = allSizes.filter((s) => s.enabled);
      const formatLabel = (sz: (typeof sizes)[number], i: number) =>
        sizes.length === 1
          ? sz.aspect === "reel"
            ? "Reel"
            : "Square"
          : `${sz.aspect === "reel" ? "Reel" : "Square"} (${i + 1} of ${sizes.length})`;

      // Render selected MP4s first, then surface share sheets
      // sequentially. H-1.8b's interleaved variant
      // (render-share-render-share) caused square iOS regressions
      // and desktop black-frame intros — the share-sheet
      // interruption between renders changed canvas /
      // captureStream state in ways the warmup buffer couldn't
      // absorb. Back-to-back rendering doesn't have that problem.
      const renderedMp4s: Array<{ label: string; blob: Blob }> = [];
      for (let i = 0; i < sizes.length; i++) {
        const sz = sizes[i];
        const loaderLabel = formatLabel(sz, i);
        // Section header for any [MP4-DEBUG] devtools session.
        console.log(
          `[MP4-DEBUG] === ${sz.label} (${sz.width}x${sz.height}) ===`
        );
        // Build a fresh timeline for each size (layout adapts per dimensions)
        const timeline = listingShowcaseTemplate.build(
          state,
          { width: sz.width, height: sz.height },
          assets
        );

        setMp4State({
          kind: "running",
          phase: sz.renderingPhase,
          progress: 0,
        });
        emit("rendering", 0, loaderLabel, { aspect: sz.aspect });
        await ffmpegPromise;

        // Unified entry point: iOS Safari → MediaRecorder + webmToMp4
        // (existing path, preserves iOS reliability); everything else
        // → frame-by-frame + ffmpeg PNG-sequence (new H-7.2.1a path,
        // eliminates real-time canvas paint constraint that was
        // capping vertical 1080×1920 quality).
        const mp4 = await renderTimelineToMp4(
          canvas,
          timeline,
          { width: sz.width, height: sz.height },
          draft.duration,
          state.background ?? "#0a0a0a",
          (p) => {
            if (p.phase === "rendering") {
              setMp4State({ kind: "running", phase: sz.renderingPhase, progress: p.progress });
              emit("rendering", p.progress * 100, loaderLabel, {
                frameIndex: p.frameIndex,
                totalFrames: p.totalFrames,
                livePreviewUrl: p.livePreviewUrl,
                aspect: sz.aspect,
              });
            } else if (p.phase === "encoding") {
              setMp4State({ kind: "running", phase: sz.convertingPhase, progress: p.progress });
              emit("encoding", p.progress * 100, loaderLabel, { aspect: sz.aspect });
            }
            // "finalizing" sub-phase is engine-internal; the export
            // handler emits its own finalizing stage after the loop.
          }
        );

        renderedMp4s.push({ label: sz.label, blob: mp4 });
      }

      // Platform fork. iOS Safari's user-gesture token expires across the
      // ~30s render window — calling navigator.share() automatically after
      // rendering fails silently and falls through to downloadBlob (which
      // lands the file in Files, not Photos). On mobile we stash the
      // blobs in state and wait for the user to tap explicit "Save Reel"
      // / "Save Square" buttons; each tap is a fresh gesture that
      // navigator.share will honor. Desktop has no gesture issue, so we
      // skip the extra clicks and trigger downloads inline.
      const reelEntry = renderedMp4s.find((r) => r.label === "reel") ?? null;
      const squareEntry = renderedMp4s.find((r) => r.label === "square") ?? null;
      const reelBlob = reelEntry?.blob ?? null;
      const squareBlob = squareEntry?.blob ?? null;
      const reelFilename = reelBlob ? `${slug}-reel.mp4` : null;
      const squareFilename = squareBlob ? `${slug}-square.mp4` : null;

      emit("finalizing", 50);

      if (isMobileDevice()) {
        setMp4State({
          kind: "ready",
          reelBlob,
          reelFilename,
          reelSaved: false,
          squareBlob,
          squareFilename,
          squareSaved: false,
        });
        // Draft clears via the useEffect once every selected format
        // has been saved.
      } else {
        if (reelBlob && reelFilename) downloadBlob(reelBlob, reelFilename);
        if (squareBlob && squareFilename) downloadBlob(squareBlob, squareFilename);
        clearDraft();
        setMp4State({ kind: "done" });
        setTimeout(() => setMp4State({ kind: "idle" }), 5000);
      }
      emit("finalizing", 100);
    } catch (err) {
      console.error("[flyer mp4]", err);
      setMp4State({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Loader closes after the pipeline completes. On mobile, the
      // share-sheet handoff happens via separate Save Reel / Save
      // Square buttons after this returns.
      setExportProgress(null);
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
    // Leave the draft alone — user dismissed without saving everything,
    // so they may want to retry.
    setMp4State({ kind: "idle" });
  };

  return (
    <div className="space-y-3">
      {exportProgress && (
        <ExportLoader progress={exportProgress} brand={brand} />
      )}
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
              {mp4State.reelSaved ? "Reel saved ✓" : "Save Reel to Photos"}
            </button>
          )}
          {mp4State.squareBlob && (
            <button
              type="button"
              onClick={handleSaveSquare}
              disabled={mp4State.squareSaved}
              className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:bg-neutral-800 disabled:text-neutral-400 disabled:cursor-default"
            >
              {mp4State.squareSaved ? "Square saved ✓" : "Save Square to Photos"}
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
            {mp4State.kind === "error" && "Try again — Export Animated Version"}
          </button>
          <p className="text-[11px] text-neutral-500 leading-snug">
            Rendering one format is faster than both. Pick what you&apos;ll
            actually post.
          </p>
        </>
      )}

      {validationError && (
        <p className="text-[11px] text-neutral-500">{validationError}</p>
      )}

      {mp4State.kind === "running" && (
        <p className="text-[11px] text-neutral-500 leading-snug">
          Renders Reel (9:16) and Square (1:1) back-to-back. When both are
          ready, you&apos;ll get save buttons for each. Keep this tab focused.
        </p>
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
      {mp4State.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {mp4State.message}
        </p>
      )}

      {/* Hidden canvas — used by the MP4 export pipeline. Position off-screen
          but kept in the DOM so MediaRecorder.captureStream() works. */}
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
    case "converting-reel":
      return `Converting Reel… ${pct}%`;
    case "rendering-square":
      return `Rendering Square… ${pct}%`;
    case "converting-square":
      return `Converting Square… ${pct}%`;
  }
}

function renderButtonLabel(formats: ExportFormatSelection): string {
  if (formats.reel && formats.square) return "Export Animated Version (MP4)";
  if (formats.reel) return "Export Reel (MP4)";
  if (formats.square) return "Export Square (MP4)";
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
