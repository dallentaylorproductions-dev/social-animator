"use client";

import { useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  type FlyerDraft,
  type FlyerPhoto,
  addressSlug,
  validateForExport,
} from "@/tools/listing-flyer/engine/types";
import { clearDraft } from "@/tools/listing-flyer/engine/draft-storage";
import { waitForPhoto } from "@/tools/listing-flyer/engine/photos";
import { mapFlyerToShowcase } from "@/tools/listing-flyer/engine/template-mapping";
import { renderTimelineToWebm } from "@/tools/listing-flyer/engine/render-mp4";
import { FlyerDocument } from "@/tools/listing-flyer/output/FlyerDocument";
import { listingShowcaseTemplate } from "@/templates/listing-showcase";
import { downloadBlob, getFFmpeg, webmToMp4 } from "@/engine/export";
import { type BrandSettings } from "@/lib/brand";

interface ExportButtonsProps {
  draft: FlyerDraft;
  photos: FlyerPhoto[];
  brand: BrandSettings;
}

type PdfState =
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

type Mp4State =
  | { kind: "idle" }
  | { kind: "running"; phase: Mp4Phase; progress: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

const SHOWCASE_DURATION = listingShowcaseTemplate.duration;

export function ExportButtons({ draft, photos, brand }: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<PdfState>({ kind: "idle" });
  const [mp4State, setMp4State] = useState<Mp4State>({ kind: "idle" });
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  const validationError = validateForExport(draft, photos.length);
  const isBusy =
    pdfState.kind === "generating" || mp4State.kind === "running";
  const canExport = !validationError && !isBusy;

  const handlePdfExport = async () => {
    if (!canExport) return;
    setPdfState({ kind: "generating" });
    try {
      // Downsample + re-encode every photo to a small JPEG data URL before
      // invoking pdf(). Original phone photos (4-10MB each, base64 = 5-13MB
      // strings) overload @react-pdf/renderer's image processor — symptom is
      // that only one Image renders and the rest fall through to their
      // backgroundColor placeholder. At 1600px max edge / JPEG q=0.85 each
      // photo is ~150-300KB, and a 5×3.5" hero at print size is still ~150dpi.
      const photoDataUrls = await Promise.all(
        photos.map((p) => fileToCompressedDataUrl(p.file))
      );
      const blob = await pdf(
        <FlyerDocument draft={draft} photoUrls={photoDataUrls} brand={brand} />
      ).toBlob();
      downloadBlob(blob, `${addressSlug(draft.addressLine1)}-flyer.pdf`);
      clearDraft();
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

  const handleMp4Export = async () => {
    if (!canExport) return;
    const canvas = hiddenCanvasRef.current;
    if (!canvas) {
      setMp4State({
        kind: "error",
        message: "Hidden render canvas missing — try refresh.",
      });
      return;
    }

    setMp4State({ kind: "running", phase: "preparing", progress: 0 });

    try {
      // Pre-load ffmpeg in parallel with photo readiness
      const ffmpegPromise = getFFmpeg();

      // Wait for all photos to have materialized HTMLImageElements
      await Promise.all(photos.map((p) => waitForPhoto(p)));

      const { state, assets } = mapFlyerToShowcase(draft, photos, brand);
      const slug = addressSlug(draft.addressLine1);

      // Sequential renders — never concurrent (memory)
      const sizes = [
        {
          label: "reel" as const,
          width: 1080,
          height: 1920,
          renderingPhase: "rendering-reel" as const,
          convertingPhase: "converting-reel" as const,
        },
        {
          label: "square" as const,
          width: 1080,
          height: 1080,
          renderingPhase: "rendering-square" as const,
          convertingPhase: "converting-square" as const,
        },
      ];

      for (const sz of sizes) {
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

        const webm = await renderTimelineToWebm(
          canvas,
          timeline,
          { width: sz.width, height: sz.height },
          SHOWCASE_DURATION,
          state.background ?? "#0a0a0a",
          (p) =>
            setMp4State({ kind: "running", phase: sz.renderingPhase, progress: p })
        );

        setMp4State({
          kind: "running",
          phase: sz.convertingPhase,
          progress: 0,
        });
        await ffmpegPromise;

        const mp4 = await webmToMp4(
          webm,
          { width: sz.width, height: sz.height },
          SHOWCASE_DURATION,
          (p) =>
            setMp4State({ kind: "running", phase: sz.convertingPhase, progress: p })
        );

        downloadBlob(mp4, `${slug}-${sz.label}.mp4`);
      }

      clearDraft();
      setMp4State({ kind: "done" });
      setTimeout(() => setMp4State({ kind: "idle" }), 5000);
    } catch (err) {
      console.error("[flyer mp4]", err);
      setMp4State({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handlePdfExport}
        disabled={!canExport}
        title={validationError ?? undefined}
        className="w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pdfState.kind === "idle" && "Export PDF"}
        {pdfState.kind === "generating" && "Generating PDF…"}
        {pdfState.kind === "done" && "PDF downloaded ✓"}
        {pdfState.kind === "error" && "Try again — Export PDF"}
      </button>

      <button
        type="button"
        onClick={handleMp4Export}
        disabled={!canExport}
        title={validationError ?? undefined}
        className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {mp4State.kind === "idle" && "Export Animated Version (MP4)"}
        {mp4State.kind === "running" && mp4StatusText(mp4State)}
        {mp4State.kind === "done" && "Both MP4s downloaded ✓"}
        {mp4State.kind === "error" && "Try again — Export Animated Version"}
      </button>

      {validationError && (
        <p className="text-[11px] text-neutral-500">{validationError}</p>
      )}

      {mp4State.kind === "running" && (
        <p className="text-[11px] text-neutral-500 leading-snug">
          Renders Reel (9:16) and Square (1:1) — about 30–60 seconds total.
          Keep this tab focused.
        </p>
      )}

      {pdfState.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {pdfState.message}
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

/**
 * Decode an image File, downsample to maxEdge on the longest side, and
 * re-encode as a compressed JPEG data URL.
 *
 * Used by PDF export. Phone photos at 4000×3000 = 4-10MB; base64 inflates by
 * ~33%; 4 photos = 20-50MB of string going into pdf().toBlob(). Empirically
 * this overwhelms @react-pdf/renderer — only the last image renders, the
 * rest fall through to their View backgroundColor.
 *
 * 1600px max edge at JPEG q=0.85 produces ~150-300KB per photo. A 5×3.5"
 * hero at print size is still ~150dpi (well above print-quality threshold).
 */
function fileToCompressedDataUrl(
  file: File,
  maxEdge: number = 1600,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(blobUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`Could not load ${file.name}`));
    };
    img.src = blobUrl;
  });
}

function mp4StatusText(state: { phase: Mp4Phase; progress: number }): string {
  const pct = Math.round(state.progress * 100);
  switch (state.phase) {
    case "preparing":
      return "Preparing…";
    case "rendering-reel":
      return `Recording Reel… ${pct}% (1 of 2)`;
    case "converting-reel":
      return `Converting Reel… ${pct}%`;
    case "rendering-square":
      return `Recording Square… ${pct}% (2 of 2)`;
    case "converting-square":
      return `Converting Square… ${pct}%`;
  }
}
