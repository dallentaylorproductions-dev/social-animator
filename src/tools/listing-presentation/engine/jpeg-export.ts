"use client";

import { type PresentationDraft } from "./types";
import { type BrandSettings } from "@/lib/brand";
import { generatePdfBlob } from "../output/pdf-export";

/**
 * Rasterize the listing-presentation PDF to a JPEG Blob suitable for
 * saving to the iOS Camera Roll. The PDF is built once via the same
 * PresentationDocument render path the PDF export uses; pdfjs-dist
 * then renders page 1 to a 3x-scale canvas, and we encode JPEG at
 * q=0.92.
 *
 * pdfjs-dist is dynamic-imported the first time this function runs
 * so it doesn't land in the listing-presentation page's initial JS
 * bundle. Worker URL is pinned to the installed version via the
 * runtime `version` export, CDN-hosted to avoid Turbopack's
 * worker-bundling quirks on Next 16 — same approach the listing-
 * flyer uses (see listing-flyer/engine/jpeg-export.ts).
 */
export async function exportJpegFromDraft(
  draft: PresentationDraft,
  brand: BrandSettings
): Promise<Blob> {
  const pdfBlob = await generatePdfBlob(draft, brand);
  return pdfBlobToJpeg(pdfBlob);
}

/** 3x scale on US Letter portrait = ~1836px wide, ~230 dpi at 8.5in.
 *  q=0.92 keeps file size manageable (~700KB-1MB typical for the
 *  one-pager). */
async function pdfBlobToJpeg(
  pdfBlob: Blob,
  scale = 3.0,
  quality = 0.92
): Promise<Blob> {
  const pdfjsLib = await loadPdfjs();
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
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Canvas toBlob returned null")),
        "image/jpeg",
        quality
      );
    });
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
