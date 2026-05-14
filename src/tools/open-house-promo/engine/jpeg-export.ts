"use client";

import { type PromoDraft } from "./types";
import { type BrandSettings } from "@/lib/brand";
import { generatePdfBlob } from "../output/pdf-export";
import { PHASE_NAMES, measurePhase } from "@/lib/perf";

/**
 * Rasterize the open-house-promo PDF to a JPEG Blob suitable for
 * saving to the iOS Camera Roll. Mirrors the listing-flyer +
 * listing-presentation pattern: build the PDF once, decode with
 * pdfjs-dist, render page 1 to a 3x-scale canvas (~1836px wide,
 * ~230 dpi at 8.5in), encode JPEG q=0.92.
 *
 * pdfjs-dist is dynamic-imported so it doesn't land in the page's
 * initial bundle. CDN-pinned worker URL avoids Turbopack's
 * worker-bundling quirks on Next 16.
 */
export async function exportJpegFromDraft(
  draft: PromoDraft,
  brand: BrandSettings
): Promise<Blob> {
  const pdfBlob = await generatePdfBlob(draft, brand);
  return pdfBlobToJpeg(pdfBlob);
}

async function pdfBlobToJpeg(
  pdfBlob: Blob,
  scale = 3.0,
  quality = 0.92
): Promise<Blob> {
  const pdfjsLib = await measurePhase(PHASE_NAMES.PDFJS_LOAD, () => loadPdfjs());
  const data = await pdfBlob.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  try {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    await measurePhase(PHASE_NAMES.PDFJS_RASTERIZE, () =>
      page.render({ canvasContext: ctx, viewport }).promise
    );
    return await measurePhase(PHASE_NAMES.CANVAS_TO_JPEG_BLOB, () =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("Canvas toBlob returned null")),
          "image/jpeg",
          quality
        );
      })
    );
  } finally {
    await pdfDoc.destroy();
  }
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (!lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/legacy/build/pdf.worker.min.mjs`;
    }
    return lib as unknown as typeof import("pdfjs-dist");
  })();
  return pdfjsPromise;
}
