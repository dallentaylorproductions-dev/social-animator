"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  type FlyerDraft,
  type FlyerPhoto,
  addressSlug,
  validateForExport,
} from "@/tools/listing-flyer/engine/types";
import { clearDraft } from "@/tools/listing-flyer/engine/draft-storage";
import { FlyerDocument } from "@/tools/listing-flyer/output/FlyerDocument";
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

export function ExportButtons({ draft, photos, brand }: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<PdfState>({ kind: "idle" });

  const validationError = validateForExport(draft, photos.length);
  const canExport = !validationError && pdfState.kind !== "generating";

  const handlePdfExport = async () => {
    if (!canExport) return;
    setPdfState({ kind: "generating" });
    try {
      const photoUrls = photos.map((p) => p.url);
      const blob = await pdf(
        <FlyerDocument draft={draft} photoUrls={photoUrls} brand={brand} />
      ).toBlob();

      const filename = `${addressSlug(draft.addressLine1)}-flyer.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

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

  return (
    <div className="space-y-2">
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

      {validationError && (
        <p className="text-[11px] text-neutral-500">{validationError}</p>
      )}

      {pdfState.kind === "error" && (
        <p className="text-[11px] text-red-400 break-words">
          {pdfState.message}
        </p>
      )}
    </div>
  );
}
