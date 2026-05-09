"use client";

import {
  type PromoDraft,
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
  type PromoTimelineState,
  type PromoTimelineAssets,
} from "./timeline";
import { generateQrDataUrl } from "../output/qr";

/** Promo MP4 loop length in seconds. Matches the timeline budget in
 *  buildPromoTimeline. */
export const PROMO_DURATION_SEC = 6;

export type RenderSize = { width: number; height: number };

export interface RenderProgressUpdate {
  /** "rendering" or "converting". */
  phase: "rendering" | "converting";
  /** 0..1 within the current phase. */
  progress: number;
}

/**
 * Render the promo to MP4 at the given size. Materializes hero +
 * QR + brand-logo images on demand (the draft stores them as data
 * URLs; canvas drawing requires HTMLImageElement). Reuses the
 * listing-flyer's renderTimelineToWebm + ffmpeg.wasm webmToMp4
 * pipeline — the rendering engine is fully generic across
 * Timeline-based templates.
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
  const accent = brand.accentColor || "#0a0a0a";
  const background = brand.backgroundColor || "#0a0a0a";

  // Auto-flip text colors against the lower-region brand-bg so the
  // text stack stays readable on any palette.
  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);

  // Materialize hero photo (first PhotoEntry) and QR code. Both
  // are nullable — the timeline handles missing images by rendering
  // placeholders or skipping tracks. H-7f introduced PhotoEntry's
  // focal-point pair; for H-7f the MP4 still uses only the first
  // photo (cycling across all photos lands in H-7g).
  const heroPhoto = draft.photos[0] ?? null;
  const heroImg = heroPhoto ? await dataUrlToImage(heroPhoto.src) : null;

  // QR code at high res (400px) so it scans cleanly when scaled
  // down inside the timeline's qrSize box (130-180pt).
  const qrFg = pickContrastText("#ffffff"); // Always-dark on white card
  const qrDataUrl = await generateQrDataUrl(
    draft.qrTargetUrl,
    400,
    qrFg,
    "#ffffff"
  );
  const qrImg = qrDataUrl ? await dataUrlToImage(qrDataUrl) : null;

  const state: PromoTimelineState = {
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
      .filter(Boolean)
      .join("\n"),
    qrLabel: qrImg ? "Scan for details" : "",
  };

  const assets: PromoTimelineAssets = {
    hero: heroImg,
    qrCode: qrImg,
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

/** Decode a data URL into a fully-loaded HTMLImageElement. Resolves
 *  once the image is paint-ready so canvas drawing operations don't
 *  silently render placeholders. */
function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image data URL"));
    img.src = dataUrl;
  });
}
