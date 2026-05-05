"use client";

import { type FlyerDraft, type FlyerPhoto } from "./types";
import { type BrandSettings } from "@/lib/brand";
import { generatePdfBlob } from "../output/pdf-export";

/**
 * Rasterize the listing-flyer PDF to a JPEG Blob suitable for saving to the
 * iOS Camera Roll. The PDF is built once via the same FlyerDocument render
 * path the PDF export uses; pdfjs-dist then renders page 1 to a 2x-scale
 * canvas, and we encode JPEG at q=0.92.
 *
 * pdfjs-dist is dynamic-imported the first time this function runs so it
 * doesn't land in the listing-flyer page's initial JS bundle (pdfjs-dist is
 * ~1MB minified; users who never tap Export JPEG never download it).
 *
 * Worker URL: pinned to the same version that's installed (via the runtime
 * `version` export). CDN-hosted to avoid Turbopack's worker-bundling quirks
 * on Next 16 — we need a real .mjs URL, and pdfjs ships its worker as a
 * sibling file we can address by version.
 */
export async function exportJpegFromDraft(
  draft: FlyerDraft,
  photos: FlyerPhoto[],
  brand: BrandSettings
): Promise<Blob> {
  const pdfBlob = await generatePdfBlob(draft, photos, brand);
  return pdfBlobToJpeg(pdfBlob);
}

/** 3x scale = ~1836px wide on US Letter, ~230 dpi at 8.5in. Higher than
 *  the H-1.8 initial 2x (1224px) — Instagram's display range tops out
 *  around 2048px and 1836 reads noticeably crisper on phone screens.
 *  q=0.92 keeps file size manageable (~1.2MB typical for a 5-photo flyer).
 *  Trade-off: ~1s additional CPU on rasterization, 2.25× canvas memory. */
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
