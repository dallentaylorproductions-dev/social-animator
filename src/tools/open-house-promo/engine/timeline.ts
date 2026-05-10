import { Timeline, type Track } from "@/engine/timeline";
import { linear } from "@/engine/easing";
import { drawImageContain } from "@/engine/draw";

/**
 * Open House Promo MP4 — single canvas composition mirroring the
 * static PDF flyer, animated for 6 seconds (FINAL architecture
 * after the H-7g/H-7q/H-7r rounds). All elements visible from
 * t=0 to t=6 with staggered fade-ins; no scenes, no crossfades,
 * no scene cycling. The composition itself stays put — motion
 * comes from the staggered intro, hero Ken Burns, and a final
 * QR pulse.
 *
 * Layout mirrors PromoDocument exactly so the MP4 reads as the
 * animated version of the PDF:
 *
 *   Header bar   (primary fill)    "OPEN HOUSE" + date + time
 *   Hero photo   (blur-fill, KB)   photos[0] full-bleed below header
 *   Thumb strip  (reel only)       photos[1..4] in 4-column row
 *   Property     (left + right)    PRESENTING + address + price
 *   Features     (reel only)       FEATURES + 3 bullets, 2-column
 *   Description  (reel only)       1-2 lines, ellipsis on overflow
 *   Agent + QR   (split row)       logo+name+contact / QR + SCAN
 *   Footer bar   (primary fill)    eventNotes + license
 *
 * Background: pure black (#000000) outside the primary-color bars
 * (header + footer). Property/features/description body text reads
 * as white-on-black; hero photo block fills its own region;
 * white-card behind QR keeps it scannable on dark bg.
 *
 * Staggered fade-in schedule (ms, all 0 → 1):
 *   0-400    hero photo
 *   200-600  header text (bar itself never animates — always present)
 *   400-800  thumb strip (reel)
 *   600-1000 property block
 *   800-1200 features (reel)
 *  1000-1400 description (reel)
 *  1200-1600 agent + QR row
 *  1400-1800 footer text
 *  1800+    all content static at full opacity
 *
 * Hero Ken Burns: scale 1.0 → 1.05 over the full 6s, applied to
 * the blur-fill composite canvas (so the blurred background scales
 * with the foreground photo as one unit).
 *
 * QR pulse: sin-wave 1.0 ± 0.02 with 1s period, active 4-6s.
 */

export const PROMO_TOTAL_SEC = 6;

const SAFE_X = 80;
const SAFE_Y = 60;
const DEBUG_SAFE_AREA = false;

/** Page background — pure black outside the primary-color bars. */
const BG_BLACK = "#000000";

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
  /** Pre-truncated description (≤140 chars, ellipsis on overflow). */
  description: string;
  agentName: string;
  brokerage: string;
  phone: string;
  email: string;
  licenseNumber: string;
  footerCenter: string;
}

export interface PromoMp4Assets {
  hero: HTMLCanvasElement | null;
  thumbs: HTMLCanvasElement[];
  qrImage: HTMLImageElement | null;
  brandLogo: HTMLImageElement | null;
}

export function buildPromoTimeline(
  state: PromoMp4State,
  size: { width: number; height: number },
  assets: PromoMp4Assets
): Timeline {
  const tracks: Track[] = [];

  tracks.push({
    id: "flyer",
    start: 0,
    duration: PROMO_TOTAL_SEC,
    easing: linear,
    onUpdate: (p, ctx) => {
      const t = p * PROMO_TOTAL_SEC;
      renderFrame(ctx, t, size, state, assets);
    },
  });

  return new Timeline(tracks);
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets
): void {
  const isSquare = Math.abs(size.width - size.height) < 50;

  // Page background — solid black behind everything else.
  ctx.fillStyle = BG_BLACK;
  ctx.fillRect(0, 0, size.width, size.height);

  // Header BAR (always opaque from t=0; only the text inside
  // animates in).
  drawHeaderBar(ctx, size, state, isSquare);

  // Hero photo block (with Ken Burns + fade-in).
  drawHeroPhoto(ctx, t, size, state, assets, isSquare);

  // Header TEXT (200-600ms fade).
  drawHeaderText(ctx, t, size, state, isSquare);

  // Thumb strip (reel only, 400-800ms fade).
  if (!isSquare && assets.thumbs.length > 0) {
    drawThumbStrip(ctx, t, size, assets);
  }

  // Property block (600-1000ms fade).
  drawPropertyBlock(ctx, t, size, state, isSquare);

  // Features block (reel only, 800-1200ms fade).
  if (!isSquare) {
    drawFeaturesBlock(ctx, t, state);
  }

  // Description (reel only, 1000-1400ms fade).
  if (!isSquare && state.description) {
    drawDescriptionBlock(ctx, t, state);
  }

  // Agent + QR row (1200-1600ms fade, with QR pulse 4-6s).
  drawAgentQrRow(ctx, t, size, state, assets, isSquare);

  // Footer bar (bar always opaque; text fades 1400-1800ms).
  drawFooterBar(ctx, t, size, state, isSquare);

  if (DEBUG_SAFE_AREA) drawSafeAreaDebug(ctx, size);
}

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
  const opacity = fadeAt(t, 0.2, 0.4);
  if (opacity <= 0) return;

  const titleSize = isSquare ? 44 : 56;
  const dateSize = isSquare ? 22 : 24;
  const timeSize = isSquare ? 16 : 18;
  // Baselines per the H-7s spec — title baseline at 60 (reel) /
  // 50 (square) gives the glyph top a 60+ px top safe-area
  // (alphabetic-baseline ascent of bold 56pt is ~42px; 60-42=18px
  // top inset on reel, well clear of canvas edge).
  const titleBaselineY = isSquare ? 50 : 60;
  const dateBaselineY = isSquare ? 78 : 92;
  const timeBaselineY = isSquare ? 96 : 116;

  const cx = size.width / 2;

  ctx.save();
  ctx.globalAlpha *= opacity;
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
/* Hero photo                                                       */
/* ──────────────────────────────────────────────────────────────── */

function drawHeroPhoto(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  isSquare: boolean
): void {
  const opacity = fadeAt(t, 0.0, 0.4);
  if (opacity <= 0) return;

  const headerH = isSquare ? 100 : 130;
  const heroY = headerH;
  const heroH = isSquare ? 600 : 720;
  const heroW = size.width;

  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.beginPath();
  ctx.rect(0, heroY, heroW, heroH);
  ctx.clip();

  if (!assets.hero) {
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

  // Ken Burns: scale 1.0 → 1.05 over the full 6s. Applied around
  // the hero box center so the blur-fill composite stays centered
  // as it zooms.
  const burnP = clamp01(t / PROMO_TOTAL_SEC);
  const zoom = 1.0 + burnP * 0.05;
  const dw = heroW * zoom;
  const dh = heroH * zoom;
  const dx = (heroW - dw) / 2;
  const dy = heroY + (heroH - dh) / 2;
  ctx.drawImage(assets.hero, dx, dy, dw, dh);
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
  const opacity = fadeAt(t, 0.4, 0.4);
  if (opacity <= 0) return;

  const stripY = 860;
  const cellH = 90;
  const cellW = 240;
  const gap = 20;
  const count = Math.min(4, assets.thumbs.length);
  const totalW = count * cellW + (count - 1) * gap;
  const startX = (size.width - totalW) / 2;

  ctx.save();
  ctx.globalAlpha *= opacity;
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
  const opacity = fadeAt(t, 0.6, 0.4);
  if (opacity <= 0) return;

  const padX = isSquare ? 80 : 100;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (isSquare) {
    // PRESENTING (accent) — y=740
    ctx.fillStyle = state.accent;
    ctx.font = `bold 18px Helvetica, Arial, sans-serif`;
    drawSpaced(ctx, "PRESENTING", padX, 740, 2);

    // Address (white) — y=790
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 36px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address || "Property address", padX, 790);

    // City (muted) — y=820
    if (state.city) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.font = `20px Helvetica, Arial, sans-serif`;
      ctx.fillText(state.city, padX, 820);
    }

    // Price (primary, right-aligned) — y=790 same baseline as address
    if (state.price) {
      ctx.fillStyle = state.primary;
      ctx.font = `bold 40px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(state.price, size.width - 80, 790);
    }
  } else {
    // Reel layout
    // PRESENTING (accent) — y=1010
    ctx.fillStyle = state.accent;
    ctx.font = `bold 22px Helvetica, Arial, sans-serif`;
    drawSpaced(ctx, "PRESENTING", padX, 1010, 3);

    // Address (white) — y=1075
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 56px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address || "Property address", padX, 1075);

    // City (muted) — y=1115
    if (state.city) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.font = `28px Helvetica, Arial, sans-serif`;
      ctx.fillText(state.city, padX, 1115);
    }

    // Price (primary, right-aligned) — y=1075 same as address
    if (state.price) {
      ctx.fillStyle = state.primary;
      ctx.font = `bold 60px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(state.price, size.width - padX, 1075);
    }
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Features block (reel only)                                       */
/* ──────────────────────────────────────────────────────────────── */

function drawFeaturesBlock(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: PromoMp4State
): void {
  const opacity = fadeAt(t, 0.8, 0.4);
  if (opacity <= 0) return;

  const highlights = state.highlights.slice(0, 3);
  if (highlights.length === 0) return;

  const padX = 100;
  const labelY = 1240;
  const dotR = 7;
  const colCount = highlights.length >= 4 ? 2 : 1;
  void colCount; // 3-bullet layout uses single column at this width
  const bulletYs = [1295, 1345, 1395];

  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // FEATURES label (primary)
  ctx.fillStyle = state.primary;
  ctx.font = `bold 22px Helvetica, Arial, sans-serif`;
  drawSpaced(ctx, "FEATURES", padX, labelY, 3);

  // Bullets — primary dot + white text. Single column at 100pt
  // padding fits 3 bullets cleanly; if highlights.length > 3 the
  // extra bullets just don't render in MP4 (PDF still has them
  // in its 2-column layout).
  ctx.font = `28px Helvetica, Arial, sans-serif`;
  for (let i = 0; i < highlights.length; i++) {
    const y = bulletYs[i];
    ctx.fillStyle = state.primary;
    ctx.beginPath();
    ctx.arc(padX + dotR, y - 8, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(highlights[i], padX + dotR * 2 + 12, y);
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Description block (reel only)                                    */
/* ──────────────────────────────────────────────────────────────── */

function drawDescriptionBlock(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: PromoMp4State
): void {
  const opacity = fadeAt(t, 1.0, 0.4);
  if (opacity <= 0) return;

  const padX = 100;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = `22px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // Single-line render — description is pre-truncated upstream.
  ctx.fillText(state.description, padX, 1450);
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
  isSquare: boolean
): void {
  const opacity = fadeAt(t, 1.2, 0.4);
  if (opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha *= opacity;

  if (isSquare) {
    drawAgentQrSquare(ctx, t, size, state, assets);
  } else {
    drawAgentQrReel(ctx, t, size, state, assets);
  }
  ctx.restore();
}

function drawAgentQrReel(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets
): void {
  const padX = 100;
  // Agent block (left) — logo + name + brokerage on top row,
  // phone + email below.
  if (assets.brandLogo) {
    drawImageContain(ctx, assets.brandLogo, padX, 1530, 64, 64);
  } else {
    ctx.fillStyle = state.primary;
    ctx.fillRect(padX, 1530, 64, 64);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold 14px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOGO", padX + 32, 1562);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 32px Helvetica, Arial, sans-serif`;
  ctx.fillText(state.agentName || "Your name", padX + 80, 1565);

  if (state.brokerage) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = `22px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.brokerage, padX + 80, 1600);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `24px Helvetica, Arial, sans-serif`;
  if (state.phone) {
    ctx.fillText(state.phone, padX, 1665);
  }
  if (state.email) {
    ctx.fillText(state.email, padX, 1705);
  }

  // QR block (right) — 200×200 white card at x=740, y=1535.
  drawQrCard(ctx, t, state, assets, {
    cardX: 740,
    cardY: 1535,
    cardSize: 200,
    cardPad: 12,
    labelCx: 860,
    labelY: 1770,
    labelSize: 18,
    labelSpacing: 2.5,
  });
}

function drawAgentQrSquare(
  ctx: CanvasRenderingContext2D,
  t: number,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets
): void {
  const padX = 80;
  // Agent block compressed — logo + name + brokerage only.
  if (assets.brandLogo) {
    drawImageContain(ctx, assets.brandLogo, padX, 890, 48, 48);
  } else {
    ctx.fillStyle = state.primary;
    ctx.fillRect(padX, 890, 48, 48);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold 11px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOGO", padX + 24, 914);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 22px Helvetica, Arial, sans-serif`;
  ctx.fillText(state.agentName || "Your name", padX + 60, 918);

  if (state.brokerage) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = `16px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.brokerage, padX + 60, 945);
  }

  // QR block (right) — 160×160 white card at x=720, y=890.
  drawQrCard(ctx, t, state, assets, {
    cardX: 720,
    cardY: 890,
    cardSize: 160,
    cardPad: 10,
    labelCx: 800,
    labelY: 1075,
    labelSize: 14,
    labelSpacing: 1.5,
  });
}

interface QrCardSpec {
  cardX: number;
  cardY: number;
  cardSize: number;
  cardPad: number;
  labelCx: number;
  labelY: number;
  labelSize: number;
  labelSpacing: number;
}

function drawQrCard(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: PromoMp4State,
  assets: PromoMp4Assets,
  spec: QrCardSpec
): void {
  if (!assets.qrImage) return;

  // QR pulse: sin-wave 1.0 ± 0.02, 1s period, active 4-6s.
  // Subtle eye-draw at end of loop without distracting earlier.
  const pulseT = Math.max(0, t - 4.0);
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
  // White card background
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, cardX, cardY, cardSize, cardSize, 8);
  ctx.fill();
  ctx.drawImage(assets.qrImage, innerX, innerY, innerSize, innerSize);
  ctx.restore();

  // SCAN FOR DETAILS label (accent)
  ctx.save();
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${spec.labelSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, "SCAN FOR DETAILS", spec.labelCx, spec.labelY, spec.labelSpacing);
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
  // Bar always opaque (no fade — anchors the bottom from t=0).
  ctx.fillStyle = state.primary;
  ctx.fillRect(0, y, size.width, h);

  // Footer text fades in 1400-1800ms.
  const textOpacity = fadeAt(t, 1.4, 0.4);
  if (textOpacity <= 0) return;

  const centerSize = isSquare ? 14 : 18;
  const licSize = isSquare ? 12 : 14;
  const baselineY = isSquare ? size.height - 22 : size.height - 35;
  const padX = 80;

  ctx.save();
  ctx.globalAlpha *= textOpacity;
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

/** Linear opacity that rises from 0 → 1 over `dur` seconds
 *  starting at `start`. Holds at 1 after start+dur. The staggered
 *  fade-in schedule is just a sequence of (start, dur) pairs. */
function fadeAt(t: number, start: number, dur: number): number {
  if (t < start) return 0;
  if (t >= start + dur) return 1;
  return (t - start) / dur;
}

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
