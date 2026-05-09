"use client";

import {
  type PromoDraft,
  type PhotoEntry,
  formatTimeRange,
  formatEventDate,
} from "./types";
import { type BrandSettings } from "@/lib/brand";
import { renderTimelineToWebm } from "@/tools/listing-flyer/engine/render-mp4";
import { webmToMp4, WARMUP_MS } from "@/engine/export";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";
import {
  buildPromoTimeline,
  PROMO_TOTAL_SEC,
  type PromoMp4State,
  type PromoMp4Assets,
} from "./timeline";
import { generateQrDataUrl } from "../output/qr";
import { cropToCanvas, srcToImage } from "./crop";

/** Promo MP4 loop length in seconds. Matches the timeline budget in
 *  buildPromoTimeline. Re-exported for ExportButtons. */
export const PROMO_DURATION_SEC = PROMO_TOTAL_SEC;

export type RenderSize = { width: number; height: number };

export interface RenderProgressUpdate {
  phase: "rendering" | "converting";
  progress: number;
}

/**
 * Render the promo to MP4 at the given size. Materializes hero +
 * QR images on demand, pre-crops each scene's photo to the output
 * dimensions on its focal point, and feeds the resulting canvases
 * to buildPromoTimeline. Reuses the listing-flyer's
 * renderTimelineToWebm + ffmpeg.wasm webmToMp4 pipeline — the
 * rendering engine is fully generic across Timeline-based templates.
 *
 * Photo cycling: scenes 2/3/4 each take one photo. With < 3 photos,
 * we cycle from photos[0]/[1]/[2] with focal-point variants of the
 * same source photo so each scene visually differs even when the
 * realtor only uploaded one image (selectScenePhotos below).
 */
export async function renderPromoMp4(
  draft: PromoDraft,
  brand: BrandSettings,
  size: RenderSize,
  canvas: HTMLCanvasElement,
  brandLogoImg: HTMLImageElement | null,
  onProgress?: (update: RenderProgressUpdate) => void
): Promise<Blob> {
  // brandLogoImg currently unused in the MP4 — the H-7g redesign
  // dropped the logo overlay for a photo-first composition. Kept
  // in the signature for source-compat with ExportButtons; suppress
  // unused warning.
  void brandLogoImg;

  const primary = brand.primaryColor || "#4ef2d9";
  const accent = brand.accentColor || "#9fbd0a";
  const background = brand.backgroundColor || "#0a0a0a";

  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);
  const onAccent = pickContrastText(accent);

  // Pick which photo + focal point each scene uses, with fallbacks
  // for sparse photo arrays.
  const sceneSelections = selectScenePhotos(draft.photos);

  // Materialize source images once and cache by index — multiple
  // scenes may reference the same source photo when there are <3
  // uploaded.
  const sourceCache = new Map<number, HTMLImageElement>();
  async function getSource(originalIdx: number): Promise<HTMLImageElement> {
    const cached = sourceCache.get(originalIdx);
    if (cached) return cached;
    const photo = draft.photos[originalIdx];
    const img = await srcToImage(photo.src);
    sourceCache.set(originalIdx, img);
    return img;
  }

  // Pre-crop each scene's photo to (size.width, size.height) on
  // its (possibly variant) focal point. Null when no photos exist.
  const [scene2, scene3, scene4] = await Promise.all(
    sceneSelections.map(async (sel) => {
      if (!sel) return null;
      const img = await getSource(sel.originalIdx);
      return cropToCanvas(img, size.width, size.height, sel.focalX, sel.focalY);
    })
  );

  // QR — high-res for scene 5 (sized ~600px on 1080-wide canvas).
  // Always black-on-white for scanner reliability — independent of
  // brand bg, since the QR scene's bg is brand primary.
  const qrDataUrl = await generateQrDataUrl(
    draft.qrTargetUrl,
    600,
    "#000000",
    "#ffffff"
  );
  const qrImg = qrDataUrl ? await srcToImage(qrDataUrl) : null;

  const state: PromoMp4State = {
    primary,
    accent,
    background,
    textPrimary,
    textMuted,
    onPrimary,
    onAccent,
    address: draft.propertyAddress,
    city: draft.propertyCity,
    price: draft.listingPrice,
    dateLabel: draft.eventDate ? formatEventDate(draft.eventDate) : "",
    timeLabel: formatTimeRange(draft.eventStartTime, draft.eventEndTime),
    highlights: draft.propertyHighlights
      .map((h) => h.trim())
      .filter(Boolean),
  };

  const assets: PromoMp4Assets = {
    scene2,
    scene3,
    scene4,
    qrImage: qrImg,
  };

  const timeline = buildPromoTimeline(state, size, assets);

  const webm = await renderTimelineToWebm(
    canvas,
    timeline,
    size,
    PROMO_DURATION_SEC,
    background,
    (p) => onProgress?.({ phase: "rendering", progress: p })
  );

  const mp4 = await webmToMp4(
    webm,
    size,
    PROMO_DURATION_SEC,
    (p) => onProgress?.({ phase: "converting", progress: p }),
    WARMUP_MS
  );

  return mp4;
}

interface SceneSelection {
  /** Index into draft.photos for the source image. */
  originalIdx: number;
  focalX: number;
  focalY: number;
}

/**
 * Decide which photo + focal point each of the three photo scenes
 * (2/3/4) uses, with sensible fallbacks for sparse photo arrays:
 *
 *   0 photos: every scene null. Timeline renders brand-bg fallback
 *             with text-only content.
 *   1 photo:  all three scenes reuse photos[0] with focal-point
 *             nudges (±10% horizontal) so each scene reads as
 *             visually distinct rather than three identical frames.
 *   2 photos: scene 2 = photos[0], scenes 3 & 4 = photos[1].
 *   3+ photos: scenes 2/3/4 = photos[0/1/2]. photos[3] and photos[4]
 *              still appear in the PDF thumb strip — they're not
 *              ignored, just unused in the MP4 (which is already
 *              dense at 7.5s).
 */
function selectScenePhotos(
  photos: PhotoEntry[]
): [SceneSelection | null, SceneSelection | null, SceneSelection | null] {
  if (photos.length === 0) return [null, null, null];
  if (photos.length === 1) {
    const p = photos[0];
    return [
      { originalIdx: 0, focalX: p.focalX, focalY: p.focalY },
      {
        originalIdx: 0,
        focalX: clampPercent(p.focalX - 10),
        focalY: p.focalY,
      },
      {
        originalIdx: 0,
        focalX: clampPercent(p.focalX + 10),
        focalY: p.focalY,
      },
    ];
  }
  if (photos.length === 2) {
    return [
      { originalIdx: 0, focalX: photos[0].focalX, focalY: photos[0].focalY },
      { originalIdx: 1, focalX: photos[1].focalX, focalY: photos[1].focalY },
      { originalIdx: 1, focalX: photos[1].focalX, focalY: photos[1].focalY },
    ];
  }
  // 3+ photos
  return [
    { originalIdx: 0, focalX: photos[0].focalX, focalY: photos[0].focalY },
    { originalIdx: 1, focalX: photos[1].focalX, focalY: photos[1].focalY },
    { originalIdx: 2, focalX: photos[2].focalX, focalY: photos[2].focalY },
  ];
}

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, v));
}
