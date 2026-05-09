"use client";

import { pdf } from "@react-pdf/renderer";
import { type PromoDraft, type PhotoEntry } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { PromoDocument } from "./PromoDocument";
import { generateQrDataUrl } from "./qr";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";
import { containInBox, cropToCanvas, srcToImage } from "../engine/crop";

/**
 * Generate the open-house-promo PDF blob from the current draft.
 * Shared by both PDF export (pipes the blob to shareOrDownload) and
 * JPEG export (rasterizes the same blob via pdfjs-dist).
 *
 * Photo prep: each PhotoEntry is materialized to an HTMLImageElement
 * and pre-cropped to the target region's actual aspect using the
 * user's focal-point pick. Pre-cropping at the region's real aspect
 * (rather than 16:9 or 4:3 generically) means react-pdf's
 * objectFit:"cover" never has to crop a second time, so the focal
 * point survives exactly as the user picked it.
 *
 * H-7j bumped output dimensions and JPEG quality (1836×720 q=0.85 →
 * 2000-wide q=0.92) so the printed/screen-displayed PDF reads as
 * sharp rather than soft. Also added a non-blocking page-count
 * assertion that warns to console when content overflows to a
 * second page — telemetry for future overflow regressions.
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

  // Hero box is now fixed 3:2 (540pt × 360pt) regardless of how
  // many photos the draft has — the H-7m redesign moved the hero
  // from COVER fit (which over-cropped roofs / foundations on tall
  // source photos) to CONTAIN fit (full image always visible,
  // brand-primary fill for any letterbox/pillarbox bars). 3:2 is
  // the natural real-estate photo aspect, so most user uploads
  // will fit edge-to-edge.
  const hasThumbs = draft.photos.length >= 2;
  const HERO_TARGET_W = 2000;
  const HERO_TARGET_H = Math.round(HERO_TARGET_W * (2 / 3)); // 3:2

  const heroPhoto = draft.photos[0] ?? null;
  const heroFillColor = brand.primaryColor || "#4ef2d9";
  const heroSrc = heroPhoto
    ? await preContainToDataUrl(
        heroPhoto,
        HERO_TARGET_W,
        HERO_TARGET_H,
        heroFillColor,
        0.92
      )
    : null;

  // Thumb strip cells are now 3:2 too — the natural real-estate
  // photo aspect. Each cell ~132pt × 88pt at print, pre-cropped at
  // 600px wide / 400px tall so the focal point is preserved at
  // high resolution.
  const THUMB_TARGET_W = 600;
  const THUMB_TARGET_H = Math.round(THUMB_TARGET_W * (2 / 3)); // 3:2

  const thumbPhotos = draft.photos.slice(1, 5);
  const thumbSrcs = await Promise.all(
    thumbPhotos.map((p) =>
      preCropToDataUrl(p, THUMB_TARGET_W, THUMB_TARGET_H, 0.92)
    )
  );

  const blob = await pdf(
    <PromoDocument
      draft={draft}
      brand={brand}
      qrDataUrl={qrDataUrl}
      heroSrc={heroSrc}
      thumbSrcs={thumbSrcs}
      hasThumbs={hasThumbs}
    />
  ).toBlob();

  // Non-blocking page-count check. The user gets their PDF either
  // way; this just logs a warning to console if the document
  // overflowed. Helpful telemetry for catching layout-height
  // regressions early.
  void assertSinglePage(blob, draft);

  return blob;
}

/** Decode a PhotoEntry, pre-crop on its focal point to exact target
 *  dimensions, and re-encode as JPEG at the requested quality.
 *  COVER mode — used for thumbnails where the focal point matters
 *  and minor cropping is acceptable. */
async function preCropToDataUrl(
  photo: PhotoEntry,
  targetW: number,
  targetH: number,
  quality: number
): Promise<string> {
  const img = await srcToImage(photo.src);
  const canvas = cropToCanvas(
    img,
    targetW,
    targetH,
    photo.focalX,
    photo.focalY
  );
  return canvas.toDataURL("image/jpeg", quality);
}

/** Decode a PhotoEntry, CONTAIN-fit into a fixed-size box with
 *  brand-color fill for any letterbox/pillarbox bars, and re-encode
 *  as JPEG. CONTAIN mode — used for the hero photo so the entire
 *  image is always visible regardless of source aspect. Focal point
 *  isn't applicable since nothing is cropped out. */
async function preContainToDataUrl(
  photo: PhotoEntry,
  targetW: number,
  targetH: number,
  fillColor: string,
  quality: number
): Promise<string> {
  const img = await srcToImage(photo.src);
  const canvas = containInBox(img, targetW, targetH, fillColor);
  return canvas.toDataURL("image/jpeg", quality);
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

async function assertSinglePage(blob: Blob, draft: PromoDraft): Promise<void> {
  try {
    const pdfjsLib = await loadPdfjs();
    const data = await blob.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const numPages = pdfDoc.numPages;
    await pdfDoc.destroy();
    if (numPages !== 1) {
      console.warn(
        `[promo pdf] generated ${numPages} pages — expected 1. Draft snapshot:`,
        {
          photos: draft.photos.length,
          highlights: draft.propertyHighlights.filter((h) =>
            h.trim()
          ).length,
          descriptionLen: draft.description.length,
          notesLen: draft.eventNotes.length,
          addressLen: draft.propertyAddress.length,
        }
      );
    }
  } catch {
    // Best-effort telemetry — don't fail the export path if
    // pdfjs-dist hiccups during the assertion.
  }
}
