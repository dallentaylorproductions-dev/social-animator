import { Timeline, type Track } from "@/engine/timeline";
import { linear } from "@/engine/easing";
import { drawImageContain } from "@/engine/draw";

/**
 * Open House Promo MP4 — single-canvas animate-the-flyer composition
 * (FINAL architecture, locked in H-7s and refined in H-7t). Layout
 * mirrors the static PDF flyer; motion comes from a staggered
 * rising-translate + fade entrance, hero Ken Burns on the foreground
 * layer only, and a final QR pulse.
 *
 * H-7t fixes (round 5 smoke test):
 *   - Hero blur backdrop is now drawn as a separate static layer
 *     (background canvas), with Ken Burns applied only to the
 *     foreground photo layer. Keeping the blurred high-frequency
 *     pixels stable across frames stops h.264 from amplifying
 *     compression banding stripes. Blur strength bumped 28→56,
 *     darken 0.18→0.5 (only for MP4) to make residual artifacts
 *     less visible against a more dramatic backdrop.
 *   - Thumb strip now renders on reel — H-7r had disabled thumb
 *     materialization in render-mp4, leaving the timeline's
 *     drawThumbStrip permanently dormant.
 *   - Entrance animation upgraded from opacity-only fade to
 *     translate-up + fade ("rises into place"). Each block starts
 *     60px below its final y position, eases up via cubic ease-out
 *     while opacity rises 0 → 1.
 *   - Features render route fixed to a single source of truth
 *     iterating up to 5 highlights across 2 columns in BOTH reel
 *     and square — same drift bug we hit in PDF column-2 (H-7l).
 *   - Reel layout retimed to a consistent 40px gap rhythm between
 *     content blocks, with intentional 160pt slack above the
 *     footer (agent + QR room to breathe).
 *
 * Stagger schedule (ms):
 *      0-600  hero photo    (longer ease, eye anchor)
 *    200-600  header text
 *    400-800  thumb strip   (reel only)
 *    600-1000 property block
 *    800-1200 features block (both aspects)
 *   1000-1400 description    (reel only)
 *   1200-1600 agent + QR row
 *   1400-1800 footer text
 *   1800+     all content static
 *
 * Hero Ken Burns: scale 1.0 → 1.05 over 6s, foreground only.
 * QR pulse: sin-wave 1.0 ± 0.02, 1s period, active 4-6s.
 */

/** Default duration when no explicit value is supplied (e.g. by
 *  callers that haven't migrated to the H-7.1 slider). 6s
 *  preserves the pre-slider behavior — Ken Burns at 1.05 end-zoom,
 *  QR pulse 4-6s — exactly. */
export const PROMO_DEFAULT_DURATION_SEC = 6;

/** Entrance ends at this absolute time regardless of total duration
 *  — the intro should feel snappy whether the user picks 5s or
 *  15s. Static dwell + Ken Burns + QR pulse fill whatever time
 *  remains after the entrance. */
export const ENTRANCE_END_MS = 1550;

/** QR pulse occupies the last QR_PULSE_DURATION_MS of the loop.
 *  At 6s default: pulse 4-6s. At 15s: pulse 13-15s. */
export const QR_PULSE_DURATION_MS = 2000;

/**
 * Ken Burns end-zoom scales linearly with duration so the
 * per-second zoom rate stays comparable across user-picked
 * durations: at 6s the hero zooms 1.0 → 1.05 (~0.83%/s);
 * at 15s it zooms 1.0 → 1.086 (~0.57%/s — a bit slower per-second
 * but covers more total distance over a longer window).
 */
function kenBurnsEndScale(durationSec: number): number {
  return 1.05 + (durationSec - PROMO_DEFAULT_DURATION_SEC) * 0.004;
}

/** Animation parameters derived from a chosen duration. Keeps
 *  the math in one place so timeline tracks, render-mp4, and the
 *  ExportButtons progress UI all reference identical numbers. */
export function computeAnimationParams(durationSec: number) {
  const totalMs = durationSec * 1000;
  return {
    totalMs,
    totalSec: durationSec,
    entranceEndMs: ENTRANCE_END_MS,
    qrPulseStartMs: Math.max(ENTRANCE_END_MS, totalMs - QR_PULSE_DURATION_MS),
    qrPulseEndMs: totalMs,
    kenBurnsEnd: kenBurnsEndScale(durationSec),
  };
}

const SAFE_X = 80;
const SAFE_Y = 60;
const DEBUG_SAFE_AREA = false;

export interface PromoMp4State {
  primary: string;
  accent: string;
  background: string;
  textPrimary: string;
  textMuted: string;
  onPrimary: string;
  onAccent: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  address: string;
  city: string;
  price: string;
  highlights: string[];
  description: string;
  agentName: string;
  brokerage: string;
  phone: string;
  email: string;
  licenseNumber: string;
  footerCenter: string;
}

export interface PromoMp4Assets {
  /** Static blur backdrop for the hero region — drawn unscaled
   *  every frame so h.264 doesn't band the high-frequency blur
   *  pixels across a per-frame Ken Burns scale. */
  heroBackground: HTMLCanvasElement | null;
  /** Original photo contain-fit on a transparent canvas at the
   *  hero region's exact size. Ken Burns scale applies to this
   *  layer only. */
  heroForeground: HTMLCanvasElement | null;
  thumbs: HTMLCanvasElement[];
  qrImage: HTMLImageElement | null;
  brandLogo: HTMLImageElement | null;
}

export function buildPromoTimeline(
  state: PromoMp4State,
  size: { width: number; height: number },
  assets: PromoMp4Assets,
  durationSec: number = PROMO_DEFAULT_DURATION_SEC
): Timeline {
  const tracks: Track[] = [];
  const params = computeAnimationParams(durationSec);

  tracks.push({
    id: "flyer",
    start: 0,
    duration: params.totalSec,
    easing: linear,
    onUpdate: (p, ctx) => {
      const t = p * params.totalSec;
      renderFrame(ctx, t, size, state, assets, params);
    },
  });

  return new Timeline(tracks);
}

interface AnimationParams {
  totalMs: number;
  totalSec: number;
  entranceEndMs: number;
  qrPulseStartMs: number;
  qrPulseEndMs: number;
  kenBurnsEnd: number;
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  params: AnimationParams
): void {
  const isSquare = Math.abs(size.width - size.height) < 50;

  // H-7.2.3b: page background tracks brand. Previously hardcoded
  // BG_BLACK, which silently overrode the user's brand profile bg
  // (and per-promo override) — the live preview displayed the
  // correct color but the exported MP4 was always black underneath.
  // state.background is computed upstream in render-mp4.ts from the
  // effective brand color with the standard fall-throughs.
  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, size.width, size.height);

  // Header bar — always present at full opacity from t=0; only
  // the text inside it animates.
  drawHeaderBar(ctx, size, state, isSquare);

  drawHeroPhoto(ctx, t, size, state, assets, isSquare, params);
  drawHeaderText(ctx, t, size, state, isSquare);

  if (!isSquare && assets.thumbs.length > 0) {
    drawThumbStrip(ctx, t, size, assets);
  }

  drawPropertyBlock(ctx, t, size, state, isSquare);
  drawFeaturesBlock(ctx, t, size, state, isSquare);

  if (!isSquare && state.description) {
    drawDescriptionBlock(ctx, t, state);
  }

  drawAgentQrRow(ctx, t, size, state, assets, isSquare, params);
  drawFooterBar(ctx, t, size, state, isSquare);

  if (DEBUG_SAFE_AREA) drawSafeAreaDebug(ctx, size);
}

/* ──────────────────────────────────────────────────────────────── */
/* Entrance animation                                               */
/* ──────────────────────────────────────────────────────────────── */

interface Entrance {
  opacity: number;
  translateY: number;
}

/** Quintic ease-out — smoother arrival than cubic on short rises.
 *  H-7u upgraded from cubic because the previous motion read as
 *  too abrupt at the end of each block's entrance. */
function quintEaseOut(progress: number): number {
  return 1 - Math.pow(1 - progress, 5);
}

/** Uniform entrance constants — every block uses the SAME duration
 *  and rise distance so the composition's motion reads as one
 *  rhythm rather than several conflicting ones. Distance bumped
 *  60→90 so the rise feels intentional (the smaller value read
 *  as "twitchy" in round-5 smoke tests). */
const ENTRANCE_DURATION_MS = 500;
const ENTRANCE_TRANSLATE_PX = 90;

/** Rising-translate + fade entrance. Block starts ENTRANCE_TRANSLATE_PX
 *  below its final y position with opacity 0; eases up to
 *  (translateY 0, opacity 1) over ENTRANCE_DURATION_MS starting
 *  at `startMs`. */
function blockEntrance(t: number, startMs: number): Entrance {
  const elapsedMs = t * 1000 - startMs;
  if (elapsedMs <= 0)
    return { opacity: 0, translateY: ENTRANCE_TRANSLATE_PX };
  if (elapsedMs >= ENTRANCE_DURATION_MS)
    return { opacity: 1, translateY: 0 };
  const progress = elapsedMs / ENTRANCE_DURATION_MS;
  const eased = quintEaseOut(progress);
  return {
    opacity: eased,
    translateY: ENTRANCE_TRANSLATE_PX * (1 - eased),
  };
}

/** Stagger schedule — uniform 150ms between block starts. All
 *  entrances complete by 1.55s so the composition settles
 *  together rather than at varying times. Identical for both
 *  reel and square; the square just doesn't render the entries
 *  for blocks it skips (thumbStrip, description). */
const ENTRANCE_SCHEDULE = {
  heroPhoto: 0,
  headerText: 150,
  thumbStrip: 300,
  propertyBlock: 450,
  featuresBlock: 600,
  description: 750,
  agentQrRow: 900,
  footerText: 1050,
} as const;

/* ──────────────────────────────────────────────────────────────── */
/* Header                                                           */
/* ──────────────────────────────────────────────────────────────── */

function drawHeaderBar(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  isSquare: boolean
): void {
  const h = isSquare ? 100 : 130;
  ctx.fillStyle = state.primary;
  ctx.fillRect(0, 0, size.width, h);
}

function drawHeaderText(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  isSquare: boolean
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.headerText);
  if (e.opacity <= 0) return;

  const titleSize = isSquare ? 44 : 56;
  const dateSize = isSquare ? 22 : 24;
  const timeSize = isSquare ? 16 : 18;
  const titleBaselineY = isSquare ? 50 : 60;
  const dateBaselineY = isSquare ? 78 : 92;
  const timeBaselineY = isSquare ? 96 : 116;

  const cx = size.width / 2;

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  ctx.fillStyle = state.onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font = `bold ${titleSize}px Helvetica, Arial, sans-serif`;
  drawSpaced(ctx, state.title.toUpperCase(), cx, titleBaselineY, isSquare ? 4 : 6);

  if (state.dateLabel) {
    ctx.font = `bold ${dateSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.dateLabel, cx, dateBaselineY);
  }
  if (state.timeLabel) {
    ctx.font = `${timeSize}px Helvetica, Arial, sans-serif`;
    ctx.globalAlpha *= 0.85;
    ctx.fillText(state.timeLabel, cx, timeBaselineY);
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Hero photo (layered: static blur + Ken-Burns'd foreground)       */
/* ──────────────────────────────────────────────────────────────── */

function drawHeroPhoto(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  isSquare: boolean,
  params: AnimationParams
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.heroPhoto);
  if (e.opacity <= 0) return;

  // Layout: header 130 reel / 100 square. Hero starts 40px below
  // the header on reel (gap rhythm), 20px below on square. H-7u
  // shrank square hero 540→500 to make room for a 130pt features
  // section that fits 3 bullets in column 1.
  const heroY = isSquare ? 120 : 170;
  const heroH = isSquare ? 500 : 720;
  const heroW = size.width;

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  ctx.beginPath();
  ctx.rect(0, heroY, heroW, heroH);
  ctx.clip();

  if (!assets.heroBackground || !assets.heroForeground) {
    // No photo — render a stenciled placeholder so the region
    // still has a deliberate look.
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, heroY, heroW, heroH);
    ctx.fillStyle = state.primary;
    ctx.globalAlpha *= 0.6;
    ctx.font = `bold ${Math.floor(heroH * 0.14)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OPEN HOUSE", size.width / 2, heroY + heroH / 2);
    ctx.restore();
    return;
  }

  // Background blur layer — drawn at full size, no Ken Burns.
  // Static across frames so h.264 doesn't compression-band the
  // blur's horizontal-frequency-rich pixels.
  ctx.drawImage(assets.heroBackground, 0, heroY, heroW, heroH);

  // Foreground photo — Ken Burns scale 1.0 → 1.05 over 6s.
  // Centered zoom. Foreground canvas has transparent margins
  // around the contain-fit photo, so the blur backdrop shows
  // through wherever the photo doesn't reach.
  // Ken Burns runs across the full duration. End-zoom scales with
  // duration (params.kenBurnsEnd) so per-second zoom rate stays
  // comparable across user-picked lengths — at 6s default the
  // hero zooms to 1.05; at 15s it zooms to 1.086.
  const burnP = clamp01(t / params.totalSec);
  const zoom = 1.0 + burnP * (params.kenBurnsEnd - 1.0);
  const dw = heroW * zoom;
  const dh = heroH * zoom;
  const dx = (heroW - dw) / 2;
  const dy = heroY + (heroH - dh) / 2;
  ctx.drawImage(assets.heroForeground, dx, dy, dw, dh);
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Thumb strip (reel only)                                          */
/* ──────────────────────────────────────────────────────────────── */

function drawThumbStrip(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  assets: PromoMp4Assets
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.thumbStrip);
  if (e.opacity <= 0) return;

  // y=930-1090 per H-7x. Cells 240×160 (3:2 — natural real-estate
  // photo aspect, no top/bottom truncation on typical phone-camera
  // sources). 20px gap between thumbs. Total strip width 1020px,
  // centered: x_start = (1080-1020)/2 = 30. Content below shifted
  // down 70px to absorb the strip's increased height.
  const stripY = 930;
  const cellW = 240;
  const cellH = 160;
  const gap = 20;
  const count = Math.min(4, assets.thumbs.length);
  const totalW = count * cellW + (count - 1) * gap;
  const startX = (size.width - totalW) / 2;

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  for (let i = 0; i < count; i++) {
    const cx = startX + i * (cellW + gap);
    ctx.save();
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(cx + r, stripY);
    ctx.lineTo(cx + cellW - r, stripY);
    ctx.quadraticCurveTo(cx + cellW, stripY, cx + cellW, stripY + r);
    ctx.lineTo(cx + cellW, stripY + cellH - r);
    ctx.quadraticCurveTo(cx + cellW, stripY + cellH, cx + cellW - r, stripY + cellH);
    ctx.lineTo(cx + r, stripY + cellH);
    ctx.quadraticCurveTo(cx, stripY + cellH, cx, stripY + cellH - r);
    ctx.lineTo(cx, stripY + r);
    ctx.quadraticCurveTo(cx, stripY, cx + r, stripY);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(assets.thumbs[i], cx, stripY, cellW, cellH);
    ctx.restore();
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Property block                                                   */
/* ──────────────────────────────────────────────────────────────── */

function drawPropertyBlock(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  isSquare: boolean
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.propertyBlock);
  if (e.opacity <= 0) return;

  const padX = isSquare ? 80 : 100;
  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (isSquare) {
    // Square section: y=640-750 (110 tall) per H-7u layout.
    ctx.fillStyle = state.accent;
    ctx.font = `bold 18px Helvetica, Arial, sans-serif`;
    drawSpaced(ctx, "PRESENTING", padX, 660, 2);

    ctx.fillStyle = state.textPrimary;
    ctx.font = `bold 36px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address || "Property address", padX, 705);

    if (state.city) {
      ctx.fillStyle = state.textMuted;
      ctx.font = `20px Helvetica, Arial, sans-serif`;
      ctx.fillText(state.city, padX, 735);
    }

    if (state.price) {
      ctx.fillStyle = state.primary;
      ctx.font = `bold 40px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(state.price, size.width - 80, 705);
    }
  } else {
    // Reel section: y=1130-1250 (120 tall) — H-7x shifted +70
    // from 1060 to absorb the bigger thumb strip above.
    ctx.fillStyle = state.accent;
    ctx.font = `bold 22px Helvetica, Arial, sans-serif`;
    drawSpaced(ctx, "PRESENTING", padX, 1155, 3);

    ctx.fillStyle = state.textPrimary;
    ctx.font = `bold 56px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address || "Property address", padX, 1210);

    if (state.city) {
      ctx.fillStyle = state.textMuted;
      ctx.font = `28px Helvetica, Arial, sans-serif`;
      ctx.fillText(state.city, padX, 1245);
    }

    if (state.price) {
      ctx.fillStyle = state.primary;
      ctx.font = `bold 60px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(state.price, size.width - padX, 1210);
    }
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Features block (both aspects, 2-column up to 5)                  */
/* ──────────────────────────────────────────────────────────────── */

function drawFeaturesBlock(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  isSquare: boolean
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.featuresBlock);
  if (e.opacity <= 0) return;

  // Single source of truth: filter once, slice once, then split
  // into two columns. Both columns iterate through the SAME
  // helper with the SAME color tokens — eliminates the column-2
  // drift bug (H-7l in PDF, now matching that fix in MP4).
  const highlights = state.highlights
    .filter((h) => h && h.trim() !== "")
    .slice(0, 5);
  if (highlights.length === 0) return;

  const col1 = highlights.slice(0, 3);
  const col2 = highlights.slice(3, 5);

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (isSquare) {
    // Square section: y=770-900 (130 tall) per H-7u — bumped from
    // 90 so 3 bullets fit in column 1 at 28px row spacing without
    // the 3rd item dropping off (round-6 fix).
    ctx.fillStyle = state.primary;
    ctx.font = `bold 16px Helvetica, Arial, sans-serif`;
    drawSpaced(ctx, "FEATURES", 80, 790, 2);

    drawFeatureColumn(
      ctx,
      col1,
      80,
      [820, 848, 876],
      18,
      state.primary,
      state.textPrimary
    );
    drawFeatureColumn(
      ctx,
      col2,
      580,
      [820, 848, 876],
      18,
      state.primary,
      state.textPrimary
    );
  } else {
    // Reel section: y=1290-1410 (120 tall) — H-7x shifted +70.
    // 3-row col1, 2-row col2 at 30px row spacing fits comfortably.
    ctx.fillStyle = state.primary;
    ctx.font = `bold 22px Helvetica, Arial, sans-serif`;
    drawSpaced(ctx, "FEATURES", 130, 1315, 3);

    drawFeatureColumn(
      ctx,
      col1,
      130,
      [1348, 1378, 1408],
      28,
      state.primary,
      state.textPrimary
    );
    drawFeatureColumn(
      ctx,
      col2,
      580,
      [1348, 1378, 1408],
      28,
      state.primary,
      state.textPrimary
    );
  }
  void size;
  ctx.restore();
}

/** Draw one column of bullet+text rows. Same helper for both
 *  columns and both aspects so color/font/spacing tokens stay
 *  identical across renders. H-7.2.3b added textColor — was
 *  hardcoded "#ffffff", which broke when the brand profile used
 *  a light page background. */
function drawFeatureColumn(
  ctx: CanvasRenderingContext2D,
  items: string[],
  x: number,
  baselineYs: number[],
  fontSize: number,
  bulletColor: string,
  textColor: string
): void {
  const dotR = Math.max(5, Math.round(fontSize / 4));
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < items.length && i < baselineYs.length; i++) {
    const y = baselineYs[i];
    ctx.fillStyle = bulletColor;
    ctx.beginPath();
    ctx.arc(x + dotR, y - fontSize * 0.32, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.fillText(items[i], x + dotR * 2 + 12, y);
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* Description block (reel only)                                    */
/* ──────────────────────────────────────────────────────────────── */

function drawDescriptionBlock(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: PromoMp4State
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.description);
  if (e.opacity <= 0) return;

  const padX = 100;
  const fontSize = 22;
  const lineHeight = Math.round(fontSize * 1.35);
  // Reel canvas 1080 wide; description column padded 100px each
  // side → 880px usable. wrapText measures against the live
  // ctx.font, so set it before calling.
  const maxWidth = 1080 - padX * 2;

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  ctx.fillStyle = state.textMuted;
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  // Reel description y=1450 (H-7x shifted down 70px from 1380 to
  // make room for the 240×160 thumb strip above).
  const yTop = 1450;
  const lines = wrapText(ctx, state.description, maxWidth, 2);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padX, yTop + i * lineHeight);
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Agent + QR row                                                   */
/* ──────────────────────────────────────────────────────────────── */

function drawAgentQrRow(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  isSquare: boolean,
  params: AnimationParams
): void {
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.agentQrRow);
  if (e.opacity <= 0) return;

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;

  if (isSquare) {
    drawAgentQrSquare(ctx, t, size, state, assets, params);
  } else {
    drawAgentQrReel(ctx, t, size, state, assets, params);
  }
  ctx.restore();
}

function drawAgentQrReel(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  params: AnimationParams
): void {
  // Section: y=1540-1750 (210 tall) — H-7x shifted +70 to fit
  // the 240×160 thumb strip + content above.
  const padX = 100;

  if (assets.brandLogo) {
    drawImageContain(ctx, assets.brandLogo, padX, 1555, 64, 64);
  } else {
    ctx.fillStyle = state.primary;
    ctx.fillRect(padX, 1555, 64, 64);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold 14px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOGO", padX + 32, 1587);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = state.textPrimary;
  ctx.font = `bold 32px Helvetica, Arial, sans-serif`;
  ctx.fillText(state.agentName || "Your name", padX + 80, 1590);

  if (state.brokerage) {
    ctx.fillStyle = state.textMuted;
    ctx.font = `22px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.brokerage, padX + 80, 1625);
  }

  ctx.fillStyle = state.textPrimary;
  ctx.font = `24px Helvetica, Arial, sans-serif`;
  if (state.phone) {
    ctx.fillText(state.phone, padX, 1690);
  }
  if (state.email) {
    ctx.fillText(state.email, padX, 1730);
  }

  // Reel QR — 200×200 card at x=760, y=1550. labelCx = 860,
  // labelY = 1550 + 200 + 16 = 1766 (glyph top with textBaseline
  // "top"). 90px breathing room before the y=1840 footer.
  drawQrCard(ctx, t, state, assets, params, {
    cardX: 760,
    cardY: 1550,
    cardSize: 200,
    cardPad: 12,
    labelGap: 16,
    labelSize: 18,
    labelSpacing: 2.5,
  });
  void size;
}

function drawAgentQrSquare(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  params: AnimationParams
): void {
  // Section: y=905-1010 (105 tall) per H-7v. QR shrunk 100→85,
  // shifted up 920→905 so the SCAN label clears the footer
  // (footer starts y=1020).
  const padX = 80;

  // Logo 40×40 at top-left of the section.
  if (assets.brandLogo) {
    drawImageContain(ctx, assets.brandLogo, padX, 905, 40, 40);
  } else {
    ctx.fillStyle = state.primary;
    ctx.fillRect(padX, 905, 40, 40);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold 10px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOGO", padX + 20, 925);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = state.textPrimary;
  ctx.font = `bold 18px Helvetica, Arial, sans-serif`;
  ctx.fillText(state.agentName || "Your name", padX + 50, 930);

  if (state.brokerage) {
    ctx.fillStyle = state.textMuted;
    ctx.font = `13px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.brokerage, padX + 50, 950);
  }

  // Phone + email below the logo row — 14pt fits if both present.
  ctx.fillStyle = state.textPrimary;
  ctx.font = `14px Helvetica, Arial, sans-serif`;
  if (state.phone) {
    ctx.fillText(state.phone, padX, 975);
  }
  if (state.email) {
    ctx.fillText(state.email, padX, 995);
  }

  // Square QR — 85×85 card at x=880, y=905. labelGap 10 + labelSize
  // 12 give a clearer perceived gap between QR bottom and the
  // SCAN label top (round-7 smoke test read 8/10 as visually
  // overlapping even though the math was correct). label glyph
  // bottom ≈ y=1014; footer top y=1020 → 6px clearance.
  drawQrCard(ctx, t, state, assets, params, {
    cardX: 880,
    cardY: 905,
    cardSize: 85,
    cardPad: 6,
    labelGap: 10,
    labelSize: 12,
    labelSpacing: 1.2,
  });
  void size;
}

interface QrCardSpec {
  cardX: number;
  cardY: number;
  cardSize: number;
  cardPad: number;
  /** Vertical gap between QR card bottom and label baseline. */
  labelGap: number;
  labelSize: number;
  labelSpacing: number;
}

function drawQrCard(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: PromoMp4State,
  assets: PromoMp4Assets,
  params: AnimationParams,
  spec: QrCardSpec
): void {
  if (!assets.qrImage) return;

  // Pulse: sin-wave 1.0 ± 0.02, 1s period. Active in the last
  // QR_PULSE_DURATION_MS of the loop — at 6s default that's 4-6s,
  // at 15s it's 13-15s. Subtle "tap me" cue right before loop wrap.
  const pulseStartSec = params.qrPulseStartMs / 1000;
  const pulseT = Math.max(0, t - pulseStartSec);
  const pulse = pulseT > 0
    ? 1.0 + Math.sin((pulseT / 1.0) * Math.PI * 2) * 0.02
    : 1.0;

  const cardSize = spec.cardSize * pulse;
  const cardX = spec.cardX + (spec.cardSize - cardSize) / 2;
  const cardY = spec.cardY + (spec.cardSize - cardSize) / 2;
  const innerSize = (spec.cardSize - spec.cardPad * 2) * pulse;
  const innerX = cardX + spec.cardPad * pulse;
  const innerY = cardY + spec.cardPad * pulse;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, cardX, cardY, cardSize, cardSize, 8);
  ctx.fill();
  ctx.drawImage(assets.qrImage, innerX, innerY, innerSize, innerSize);
  ctx.restore();

  // Label position is derived from the QR card's nominal (un-pulsed)
  // rectangle so the label stays centered to the card and doesn't
  // wobble with the pulse animation. Single source of truth: card
  // x + width/2 for horizontal center, card bottom + labelGap for
  // top of glyph. textBaseline="top" makes labelY refer to the
  // glyph TOP rather than the alphabetic baseline — without this
  // the round-7 fix above visually appeared overlapping because
  // the alphabetic baseline puts the glyph top ~0.75*fontSize
  // ABOVE labelY, eating most of the spec'd labelGap.
  const labelCx = spec.cardX + spec.cardSize / 2;
  const labelY = spec.cardY + spec.cardSize + spec.labelGap;

  ctx.save();
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${spec.labelSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  drawSpaced(ctx, "SCAN FOR DETAILS", labelCx, labelY, spec.labelSpacing);
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Footer                                                           */
/* ──────────────────────────────────────────────────────────────── */

function drawFooterBar(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  isSquare: boolean
): void {
  const h = isSquare ? 60 : 80;
  const y = size.height - h;
  // Bar: always opaque from t=0 (anchors the bottom).
  ctx.fillStyle = state.primary;
  ctx.fillRect(0, y, size.width, h);

  // Text: rises into place per the uniform schedule.
  const e = blockEntrance(t, ENTRANCE_SCHEDULE.footerText);
  if (e.opacity <= 0) return;

  const centerSize = isSquare ? 14 : 18;
  const licSize = isSquare ? 12 : 14;
  const baselineY = isSquare ? size.height - 22 : size.height - 32;
  const padX = 80;

  ctx.save();
  ctx.translate(0, e.translateY);
  ctx.globalAlpha *= e.opacity;
  ctx.fillStyle = state.onPrimary;
  ctx.font = `bold ${centerSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (state.footerCenter) {
    ctx.fillText(state.footerCenter, size.width / 2, baselineY);
  }
  if (state.licenseNumber) {
    ctx.font = `${licSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.globalAlpha *= 0.85;
    ctx.fillText(
      `License #${state.licenseNumber.replace(/^#/, "")}`,
      size.width - padX,
      baselineY
    );
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

function drawSafeAreaDebug(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number }
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(SAFE_X, 0);
  ctx.lineTo(SAFE_X, size.height);
  ctx.moveTo(size.width - SAFE_X, 0);
  ctx.lineTo(size.width - SAFE_X, size.height);
  ctx.moveTo(0, SAFE_Y);
  ctx.lineTo(size.width, SAFE_Y);
  ctx.moveTo(0, size.height - SAFE_Y);
  ctx.lineTo(size.width, size.height - SAFE_Y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Greedy word-wrap into up to `maxLines` lines of `maxWidth`
 * pixels, with an ellipsis appended to the last line if the
 * input runs longer. Uses `ctx.measureText` against the
 * already-set font, so the caller must set ctx.font BEFORE
 * calling. Returns the lines as an array; the caller iterates
 * and renders each at its own y offset.
 *
 * Why we need this: the description block was rendering as a
 * single fillText call with no width constraint — long
 * descriptions ran off the right edge of the canvas. The
 * upstream render-mp4.ts pre-truncate at 140 chars caps the
 * total length but doesn't enforce visual width per line.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 2
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (
      ctx.measureText(candidate).width > maxWidth &&
      current.length > 0
    ) {
      lines.push(current);
      if (lines.length >= maxLines) {
        current = "";
        // Mark that we still had more words — the last line will
        // get an ellipsis appended below.
        break;
      }
      current = words[i];
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // If there's still input we didn't consume, append "…" to the
  // last line, trimming characters off its tail until the line +
  // ellipsis fits within maxWidth.
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (
      last.length > 0 &&
      ctx.measureText(`${last}…`).width > maxWidth
    ) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }

  return lines;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  y: number,
  spacing: number
): void {
  if (!text) return;
  const widths: number[] = [];
  let total = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    widths.push(w);
    total += w;
  }
  total += spacing * Math.max(0, text.length - 1);
  const align = ctx.textAlign;
  let x: number;
  if (align === "center") x = anchorX - total / 2;
  else if (align === "right" || align === "end") x = anchorX - total;
  else x = anchorX;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i] + spacing;
  }
  ctx.textAlign = align;
}
