"use client";

import { pdf } from "@react-pdf/renderer";
import { type PromoDraft, type PhotoEntry } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { PromoDocument } from "./PromoDocument";
import { generateQrDataUrl } from "./qr";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";
import { cropToCanvas, srcToImage } from "../engine/crop";

/**
 * Generate the open-house-promo PDF blob from the current draft.
 * Shared by both PDF export (pipes the blob to shareOrDownload) and
 * JPEG export (rasterizes the same blob via pdfjs-dist).
 *
 * Photo prep: each PhotoEntry is materialized to an HTMLImageElement
 * and pre-cropped to the target region's aspect using the user's
 * focal-point pick. react-pdf doesn't support object-position, so
 * the crop has to happen on a canvas before the data URL is handed
 * to the document.
 *
 * QR code is generated outside the document component so its async
 * API doesn't have to participate in react-pdf's render lifecycle.
 */
export async function generatePdfBlob(
  draft: PromoDraft,
  brand: BrandSettings
): Promise<Blob> {
  const qrFg = pickContrastText(brand.backgroundColor || "#ffffff");
  const qrBg = brand.backgroundColor || "#ffffff";
  const qrDataUrl = await generateQrDataUrl(draft.qrTargetUrl, 400, qrFg, qrBg);

  // Hero region in PromoDocument is full-width × 240pt, aspect ~2.55.
  // Pre-crop at ~3x output dimensions so the embedded JPEG prints
  // crisply (1836×720 ≈ 220dpi at 8.5"×3.33"). Quality 0.85 keeps
  // file size manageable.
  const heroPhoto = draft.photos[0] ?? null;
  const heroSrc = heroPhoto
    ? await preCropToDataUrl(heroPhoto, 1836, 720)
    : null;

  // Thumb strip: photos[1..5], up to 4 entries. Each thumb is ~50pt
  // tall in the document, ~140pt wide → 3x = 420×150. Aspect ~2.8 is
  // close to a 16:9 / cinematic feel and matches the strip's visual
  // grouping with the hero.
  const thumbPhotos = draft.photos.slice(1, 5);
  const thumbSrcs = await Promise.all(
    thumbPhotos.map((p) => preCropToDataUrl(p, 420, 150))
  );

  return pdf(
    <PromoDocument
      draft={draft}
      brand={brand}
      qrDataUrl={qrDataUrl}
      heroSrc={heroSrc}
      thumbSrcs={thumbSrcs}
    />
  ).toBlob();
}

/** Decode a PhotoEntry, pre-crop on its focal point to exact target
 *  dimensions, and re-encode as JPEG q=0.85. */
async function preCropToDataUrl(
  photo: PhotoEntry,
  targetW: number,
  targetH: number
): Promise<string> {
  const img = await srcToImage(photo.src);
  const canvas = cropToCanvas(
    img,
    targetW,
    targetH,
    photo.focalX,
    photo.focalY
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}
