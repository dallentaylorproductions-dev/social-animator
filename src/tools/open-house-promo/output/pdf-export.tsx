"use client";

import { pdf } from "@react-pdf/renderer";
import { type PromoDraft, type PhotoEntry } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { PromoDocument } from "./PromoDocument";
import { generateQrDataUrl } from "./qr";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";
import { blurFillCompose, cropToCanvas, srcToImage } from "../engine/crop";
import {
  PHASE_NAMES,
  measurePhase,
  measurePhaseSync,
} from "@/lib/perf";

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
  const qrDataUrl = await measurePhase(PHASE_NAMES.QR_GENERATE, () =>
    generateQrDataUrl(draft.qrTargetUrl, 400, qrFg, qrBg)
  );

  // Hero box is now hard-capped at 540pt × 270pt (2:1) per H-7p
  // and uses blur-fill composition (H-7o) — a blurred + zoomed
  // copy of the same photo behind the original photo at
  // contain-fit. Looks intentional regardless of source aspect
  // and gives the box a fixed height so the rest of the layout
  // doesn't have to flex around variable-height heroes.
  // Pre-compose at 2x the print resolution (1080×540) for retina
  // sharpness.
  const hasThumbs = draft.photos.length >= 2;
  const HERO_TARGET_W = 1080;
  const HERO_TARGET_H = 540;

  const heroPhoto = draft.photos[0] ?? null;
  const THUMB_TARGET_W = 600;
  const THUMB_TARGET_H = Math.round(THUMB_TARGET_W * (2 / 3)); // 3:2
  const thumbPhotos = draft.photos.slice(1, 5);

  // photo-decode-all covers all photo materialization for this export
  // (hero blur-fill compose + thumb crop) since both come from the same
  // PhotoEntry.src data URLs and the cost is dominated by the srcToImage
  // decode round-trip.
  const { heroSrc, thumbSrcs } = await measurePhase(
    PHASE_NAMES.PHOTO_DECODE_ALL,
    async () => {
      const hero = heroPhoto
        ? await preBlurFillToDataUrl(
            heroPhoto,
            HERO_TARGET_W,
            HERO_TARGET_H,
            0.92
          )
        : null;
      const thumbs = await Promise.all(
        thumbPhotos.map((p) =>
          preCropToDataUrl(p, THUMB_TARGET_W, THUMB_TARGET_H, 0.92)
        )
      );
      return { heroSrc: hero, thumbSrcs: thumbs };
    }
  );

  const doc = measurePhaseSync(PHASE_NAMES.PDF_DOC_BUILD, () => (
    <PromoDocument
      draft={draft}
      brand={brand}
      qrDataUrl={qrDataUrl}
      heroSrc={heroSrc}
      thumbSrcs={thumbSrcs}
      hasThumbs={hasThumbs}
    />
  ));
  const blob = await measurePhase(PHASE_NAMES.PDF_RENDER_TO_BLOB, () =>
    pdf(doc).toBlob()
  );

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

/** Decode a PhotoEntry, compose blur-fill (blurred zoomed
 *  background + contain-fit foreground) at the target box
 *  dimensions, and re-encode as JPEG. Replaces the H-7m
 *  containInBox path: solid-color bars on aspect mismatches
 *  read as cheap-template; a blurred copy of the same photo
 *  reads as intentional design. */
async function preBlurFillToDataUrl(
  photo: PhotoEntry,
  targetW: number,
  targetH: number,
  quality: number
): Promise<string> {
  const img = await srcToImage(photo.src);
  const canvas = blurFillCompose(img, targetW, targetH);
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
