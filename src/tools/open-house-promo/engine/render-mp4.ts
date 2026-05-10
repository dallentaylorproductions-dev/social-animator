"use client";

import {
  type PromoDraft,
  type PhotoEntry,
  formatTimeRange,
  formatEventDate,
} from "./types";
import { type BrandSettings, formatPhone, effectiveBrandAccent } from "@/lib/brand";
import { renderTimelineToWebm } from "@/tools/listing-flyer/engine/render-mp4";
import { webmToMp4, getWarmupMs } from "@/engine/export";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";
import {
  buildPromoTimeline,
  PROMO_DEFAULT_DURATION_SEC,
  type PromoMp4State,
  type PromoMp4Assets,
} from "./timeline";
import { generateQrDataUrl } from "../output/qr";
import {
  blurFillCompose,
  blurFillComposeLayered,
  cropToCanvas,
  srcToImage,
} from "./crop";

/** Default loop length when caller doesn't pass an override. */
export const PROMO_DURATION_SEC = PROMO_DEFAULT_DURATION_SEC;

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
  // H-7.1 reads the user-picked duration from the draft. clampDraft
  // already coerces the field to an int in [5, 15], but defensive
  // floor here in case a stale caller hands us an unclamped value.
  const durationSec = Math.max(
    5,
    Math.min(15, Math.round(draft.mp4DurationSeconds ?? PROMO_DURATION_SEC))
  );
  const primary = brand.primaryColor || "#4ef2d9";
  const accent = effectiveBrandAccent(brand);
  const background = brand.backgroundColor || "#ffffff";

  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);
  // H-7r highlight pills paint accent-bg with auto-contrast text.
  const onAccent = pickContrastText(accent);

  const isSquare = Math.abs(size.width - size.height) < 50;

  // Hero region (H-7t): reel 1080×720 (3:2 cap), square 1080×540
  // (2:1 cap). H-7t splits the blur-fill into two layers
  // (background + foreground) so Ken Burns can zoom only the
  // foreground photo while the blur backdrop stays static — the
  // blur backdrop's horizontal-frequency-rich pixels were
  // amplifying h.264 compression banding when scaled per frame.
  // Heavier blur (56px) + heavier darken (50%) further mask any
  // residual artifacts and let the foreground photo pop against
  // a more dramatic backdrop. Keep these heights in sync with the
  // hero region in timeline.ts.
  const HERO_REGION_W = size.width;
  const HERO_REGION_H = isSquare ? 540 : 720;

  const heroPhoto = draft.photos[0] ?? null;
  const heroLayered = heroPhoto
    ? await preBlurFillLayered(heroPhoto, HERO_REGION_W, HERO_REGION_H)
    : null;

  // Thumb strip cells (reel only) — H-7x bumped 240×90 (8:3) →
  // 240×160 (3:2 native real-estate photo aspect, no top/bottom
  // truncation on typical phone sources). Keep dims in sync with
  // the timeline's thumb strip layout.
  let thumbs: HTMLCanvasElement[] = [];
  if (!isSquare && draft.photos.length > 1) {
    thumbs = await Promise.all(
      draft.photos.slice(1, 5).map((p) => preCropToCanvas(p, 240, 160))
    );
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
    onAccent,
    title: "Open House",
    dateLabel: draft.eventDate ? formatEventDate(draft.eventDate) : "",
    timeLabel: formatTimeRange(draft.eventStartTime, draft.eventEndTime),
    address: draft.propertyAddress,
    city: draft.propertyCity,
    price: draft.listingPrice,
    highlights: draft.propertyHighlights
      .map((h) => h.trim())
      .filter(Boolean),
    // Pre-truncate to 140 chars matching PromoDocument's truncate
    // behavior so the MP4 description block is single-line clean.
    description:
      draft.description.length > 140
        ? draft.description.slice(0, 140).trimEnd() + "…"
        : draft.description,
    agentName: brand.agentName || "Your name",
    brokerage: brand.brokerage || "",
    phone: formatPhone(brand.contactPhone) || "",
    email: brand.contactEmail || "",
    licenseNumber: brand.licenseNumber || "",
    footerCenter,
  };

  const assets: PromoMp4Assets = {
    heroBackground: heroLayered?.background ?? null,
    heroForeground: heroLayered?.foreground ?? null,
    thumbs,
    qrImage,
    brandLogo: brandLogoImg,
  };

  const timeline = buildPromoTimeline(state, size, assets, durationSec);

  const webm = await renderTimelineToWebm(
    canvas,
    timeline,
    size,
    durationSec,
    background,
    (p) => onProgress?.({ phase: "rendering", progress: p })
  );

  const mp4 = await webmToMp4(
    webm,
    size,
    durationSec,
    (p) => onProgress?.({ phase: "converting", progress: p }),
    getWarmupMs()
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

/** Compose a layered blur-fill for the hero photo. Background
 *  canvas holds the blurred + darkened backdrop; foreground holds
 *  the contain-fit original photo with transparent margins. The
 *  timeline draws background statically, then applies Ken Burns
 *  scale/translate to foreground only — keeping the
 *  horizontal-frequency-rich blur layer stable across frames so
 *  h.264 doesn't band it. Heavier blur (56px) + heavier darken
 *  (50%) for the MP4 path so any residual compression artifacts
 *  are masked. */
async function preBlurFillLayered(
  photo: PhotoEntry,
  boxW: number,
  boxH: number
): Promise<{ background: HTMLCanvasElement; foreground: HTMLCanvasElement }> {
  const img = await srcToImage(photo.src);
  return blurFillComposeLayered(img, boxW, boxH, {
    blur: 56,
    darken: 0.5,
  });
}

// Re-export the static blurFillCompose name as unused — keep the
// import so it doesn't break if some other code path references
// it (currently none in render-mp4 do).
void blurFillCompose;
