"use client";

import { pdf } from "@react-pdf/renderer";
import { type FlyerDraft } from "../engine/types";
import { type FlyerPhoto } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { FlyerDocument } from "./FlyerDocument";

/**
 * Generate the listing-flyer PDF blob from the current form state.
 *
 * Shared by both:
 *  - PDF export (pipes the blob straight to shareOrDownload)
 *  - JPEG export (rasterizes this same blob via pdfjs-dist)
 *
 * Photo prep (downsample to ≤1600px JPEG q=0.85) lives here because
 * @react-pdf/renderer's image processor falls over on raw 4-10MB phone
 * photos — only the last image renders, the rest fall through to a
 * placeholder background. Keeping prep + render in one place ensures
 * both export paths get the same compressed input.
 */
export async function generatePdfBlob(
  draft: FlyerDraft,
  photos: FlyerPhoto[],
  brand: BrandSettings
): Promise<Blob> {
  const photoDataUrls = await Promise.all(
    photos.map((p) => fileToCompressedDataUrl(p.file))
  );
  return pdf(
    <FlyerDocument draft={draft} photoUrls={photoDataUrls} brand={brand} />
  ).toBlob();
}

/**
 * Decode an image File, downsample to maxEdge on the longest side, and
 * re-encode as a compressed JPEG data URL.
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
