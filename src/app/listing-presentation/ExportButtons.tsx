"use client";

import { useState } from "react";
import {
  type PresentationDraft,
  addressSlug,
  validateForExport,
} from "@/tools/listing-presentation/engine/types";
import {
  clearDraft,
  saveDraft,
} from "@/tools/listing-presentation/engine/draft-storage";
import { generatePdfBlob } from "@/tools/listing-presentation/output/pdf-export";
import { exportJpegFromDraft } from "@/tools/listing-presentation/engine/jpeg-export";
import { shareOrDownload } from "@/engine/export";
import { type BrandSettings } from "@/lib/brand";

interface ExportButtonsProps {
  draft: PresentationDraft;
  /** Effective brand — per-presentation color overrides already merged
   *  in by caller. Used as-is for PDF + JPEG generation. */
  brand: BrandSettings;
}

type ExportState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function ExportButtons({ draft, brand }: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<ExportState>({ kind: "idle" });
  const [jpegState, setJpegState] = useState<ExportState>({ kind: "idle" });

  const validationError = validateForExport(draft);
  const isBusy =
    pdfState.kind === "generating" || jpegState.kind === "generating";
  const canExport = !validationError && !isBusy;

  const handlePdfExport = async () => {
    if (!canExport) return;
    // Force-flush draft to localStorage BEFORE export. Bypasses the
    // page-level debounced save so a navigation/share-sheet glitch
    // leaves the editor session recoverable on reload.
    saveDraft(draft);
    setPdfState({ kind: "generating" });
    try {
      const blob = await generatePdfBlob(draft, brand);
      const filename = `${addressSlug(draft.propertyAddress)}-presentation.pdf`;
      const result = await shareOrDownload(blob, filename);
      // Only clear the draft when the file actually shipped. If the
      // user dismissed the share sheet (cancelled), keep the draft so
      // they can retry without re-typing the form.
      if (result === "shared" || result === "downloaded") {
        clearDraft();
      }
      setPdfState({ kind: "done" });
      setTimeout(() => setPdfState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[presentation pdf]", err);
      setPdfState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleJpegExport = async () => {
    if (!canExport) return;
    saveDraft(draft);
    setJpegState({ kind: "generating" });
    try {
      const blob = await exportJpegFromDraft(draft, brand);
      const filename = `${addressSlug(draft.propertyAddress)}-presentation.jpg`;
      const result = await shareOrDownload(blob, filename);
      if (result === "shared" || result === "downloaded") {
        clearDraft();
      }
      setJpegState({ kind: "done" });
      setTimeout(() => setJpegState({ kind: "idle" }), 3000);
    } catch (err) {
      console.error("[presentation jpeg]", err);
      setJpegState({
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
    </div>
  );
}
