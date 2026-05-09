"use client";

import {
  type PromoDraft,
  type PhotoEntry,
  formatTimeRange,
  formatEventDate,
} from "./types";
import { type BrandSettings, formatPhone, effectiveBrandAccent } from "@/lib/brand";
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
import { containInBox, cropToCanvas, srcToImage } from "./crop";

/** Promo MP4 loop length in seconds. Re-exported for ExportButtons. */
export const PROMO_DURATION_SEC = PROMO_TOTAL_SEC;

export type RenderSize = { width: number; height: number };

export interface RenderProgressUpdate {
  phase: "rendering" | "converting";
  progress: number;
}

/**
 * Render the open-house-promo MP4 at the given size.
 *
 * H-7k redesign: animates the static flyer composition (one
 * vertical stack with subtle motion) instead of cycling through
 * multiple scenes. Mirrors the PromoDocument layout so the MP4
 * reads as the same artifact as the PDF, just animated.
 *
 * Photo prep:
 *   hero (photos[0]):  pre-cropped to the hero region's aspect
 *   thumbs (9:16 only): photos[1..4] pre-cropped to the thumb
 *                       cell aspect
 *   1:1 ignores the thumb strip — too narrow for 4 thumbs at
 *   readable size.
 *
 * All photos honor their stored focalX/focalY. Pre-cropping
 * happens here (HTMLCanvasElement) so the timeline can run
 * synchronously through rAF without async image loads in the
 * paint loop.
 */
export async function renderPromoMp4(
  draft: PromoDraft,
  brand: BrandSettings,
  size: RenderSize,
  canvas: HTMLCanvasElement,
  brandLogoImg: HTMLImageElement | null,
  onProgress?: (update: RenderProgressUpdate) => void
): Promise<Blob> {
  const primary = brand.primaryColor || "#4ef2d9";
  const accent = effectiveBrandAccent(brand);
  const background = brand.backgroundColor || "#ffffff";

  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);

  const isSquare = Math.abs(size.width - size.height) < 50;

  // Hero region is now 3:2 for both aspects (matches the
  // timeline's computeLayout) — 1080×720 on either reel or square.
  // CONTAIN-fit means the entire user photo is visible regardless
  // of source aspect; brand-primary fills any letterbox/pillarbox
  // bars. Keep this in sync with computeLayout in timeline.ts.
  const HERO_REGION_W = size.width;
  const HERO_REGION_H = 720;

  const heroPhoto = draft.photos[0] ?? null;
  const hero = heroPhoto
    ? await preContainToCanvas(heroPhoto, HERO_REGION_W, HERO_REGION_H, primary)
    : null;

  // Thumb cells now 3:2 aspect, matching the natural real-estate
  // photo orientation. Square skips the strip entirely (per the
  // H-7m layout — square is too tight to fit a usable strip).
  let thumbs: HTMLCanvasElement[] = [];
  if (!isSquare) {
    const margin = 50; // matches computeLayout's portrait margin
    const stripW = size.width - margin * 2;
    const gap = 12;
    const count = Math.min(4, Math.max(0, draft.photos.length - 1));
    if (count > 0) {
      const cellW = (stripW - gap * (count - 1)) / count;
      // 3:2 aspect — height = cellW * 2/3.
      const cellH = Math.round(cellW * (2 / 3));
      thumbs = await Promise.all(
        draft.photos
          .slice(1, 1 + count)
          .map((p) => preCropToCanvas(p, Math.round(cellW), cellH))
      );
    }
  }

  // QR — high res. Always black-on-white for scanner reliability;
  // the timeline draws a white card behind it for contrast against
  // any primary bg.
  const qrDataUrl = await generateQrDataUrl(
    draft.qrTargetUrl,
    600,
    "#000000",
    "#ffffff"
  );
  const qrImage = qrDataUrl ? await srcToImage(qrDataUrl) : null;

  // Footer center text mirrors the PDF logic: eventNotes wins,
  // address+city falls back, never propertyHighlights.
  const footerCenter = (() => {
    const notes = draft.eventNotes.trim();
    if (notes) return notes;
    const addressPart = draft.propertyAddress.trim();
    const cityPart = draft.propertyCity.trim();
    if (addressPart && cityPart) return `${addressPart}, ${cityPart}`;
    return addressPart || "Open House";
  })();

  const state: PromoMp4State = {
    primary,
    accent,
    background,
    textPrimary,
    textMuted,
    onPrimary,
    title: "Open House",
    dateLabel: draft.eventDate ? formatEventDate(draft.eventDate) : "",
    timeLabel: formatTimeRange(draft.eventStartTime, draft.eventEndTime),
    address: draft.propertyAddress,
    city: draft.propertyCity,
    price: draft.listingPrice,
    highlights: draft.propertyHighlights
      .map((h) => h.trim())
      .filter(Boolean),
    agentName: brand.agentName || "Your name",
    brokerage: brand.brokerage || "",
    phone: formatPhone(brand.contactPhone) || "",
    email: brand.contactEmail || "",
    licenseNumber: brand.licenseNumber || "",
    footerCenter,
  };

  const assets: PromoMp4Assets = {
    hero,
    thumbs,
    qrImage,
    brandLogo: brandLogoImg,
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

async function preCropToCanvas(
  photo: PhotoEntry,
  targetW: number,
  targetH: number
): Promise<HTMLCanvasElement> {
  const img = await srcToImage(photo.src);
  return cropToCanvas(img, targetW, targetH, photo.focalX, photo.focalY);
}

/** CONTAIN-fit a PhotoEntry into a fixed box with brand-color fill
 *  on letterbox/pillarbox bars. Used for the hero photo so the
 *  entire image is always visible regardless of source aspect. */
async function preContainToCanvas(
  photo: PhotoEntry,
  boxW: number,
  boxH: number,
  fillColor: string
): Promise<HTMLCanvasElement> {
  const img = await srcToImage(photo.src);
  return containInBox(img, boxW, boxH, fillColor);
}
