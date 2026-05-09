import { Timeline, type Track } from "@/engine/timeline";
import { linear } from "@/engine/easing";

/**
 * Open House Promo MP4 — full-bleed photo composition with text
 * overlays and gradient scrims, modeled on high-end real-estate
 * reels (Sotheby's / Compass / Zillow). Replaces H-7d's split-frame
 * "photo top, color block bottom" composition that read as cheap-
 * template.
 *
 * Total runtime: 7.5s, 30fps. Five sequential scenes with 300ms
 * crossfades implemented as fade-ins on the next scene over the
 * previous scene's tail. Same composition for 9:16 and 1:1 — only
 * vertical text positioning + edge-padding adapt to the aspect.
 *
 * Scene structure:
 *   0.0–1.5  Title card     primary-bg, "OPEN HOUSE" + date + time
 *   1.5–3.5  Hero + price   photos[0], bottom scrim, address + price
 *   3.5–5.0  Highlights     photos[1], top scrim, accent-bg badges
 *   5.0–6.5  Event recap    photos[2], center scrim, date+time + JOIN US
 *   6.5–7.5  QR card        primary-bg, QR + SCAN FOR DETAILS
 *
 * Photo cycling falls back automatically when fewer than 3 photos
 * are present (see selectScenePhotos in render-mp4.ts) — scenes
 * always render, but with focal-point variants of the same source
 * photo when the realtor only uploaded one image.
 *
 * Pre-cropping happens upstream in render-mp4.ts using cropToCanvas
 * — each scene's photo arrives as an HTMLCanvasElement already
 * sized to the output dimensions and centered on the user's focal
 * point. Ken Burns then scales/translates that pre-cropped canvas,
 * which keeps the focal point fixed throughout the scene (rather
 * than the focal point drifting as the crop window changes).
 */

export const PROMO_TOTAL_SEC = 7.5;
const CROSSFADE_SEC = 0.3;

/** Scene boundaries — `start` and `end` are absolute seconds in
 *  the timeline. The crossfade lives in the next scene's first
 *  CROSSFADE_SEC; during that overlap both scenes draw, with the
 *  later scene fading 0 → 1 over the previous (which has long
 *  since drawn its full opacity by then). */
const SCENES = [
  { id: "title", start: 0, end: 1.5 },
  { id: "hero", start: 1.5, end: 3.5 },
  { id: "highlights", start: 3.5, end: 5.0 },
  { id: "event", start: 5.0, end: 6.5 },
  { id: "qr", start: 6.5, end: 7.5 },
] as const;

export interface PromoMp4State {
  primary: string;
  accent: string;
  background: string;
  /** Auto-flipped against the brand background. */
  textPrimary: string;
  textMuted: string;
  /** Auto-flipped against the brand primary. */
  onPrimary: string;
  onAccent: string;
  // Content
  address: string;
  city: string;
  price: string;
  dateLabel: string;
  timeLabel: string;
  /** Up to 3 highlights for the highlights scene. */
  highlights: string[];
}

export interface PromoMp4Assets {
  /** Pre-cropped photo for scene 2 — HTMLCanvasElement at output
   *  dimensions, focal point honored. Null when there are no photos. */
  scene2: HTMLCanvasElement | null;
  scene3: HTMLCanvasElement | null;
  scene4: HTMLCanvasElement | null;
  /** QR PNG, sized for scene 5 rendering (~600px). */
  qrImage: HTMLImageElement | null;
}

export function buildPromoTimeline(
  state: PromoMp4State,
  size: { width: number; height: number },
  assets: PromoMp4Assets
): Timeline {
  const tracks: Track[] = [];

  // Single global track — draws all five scenes with crossfade
  // overlap based on the timeline's current time. Doing this in a
  // single track (rather than five Timeline tracks) lets the
  // crossfade compose alpha-blending naturally without having to
  // synchronize five separate fade-in/fade-out pairs.
  tracks.push({
    id: "all-scenes",
    start: 0,
    duration: PROMO_TOTAL_SEC,
    easing: linear,
    onUpdate: (p, ctx) => {
      const t = p * PROMO_TOTAL_SEC;
      // Always start by clearing to the brand background — gives
      // the crossfade a clean canvas behind partially-transparent
      // scene draws.
      ctx.fillStyle = state.background;
      ctx.fillRect(0, 0, size.width, size.height);

      // For each scene, compute opacity at time t and draw if > 0.
      // Iterate in order so later scenes draw on top of earlier
      // ones during their crossfade window.
      SCENES.forEach((scene, idx) => {
        const opacity = sceneOpacity(scene, idx, t);
        if (opacity <= 0) return;
        const sceneT = t - scene.start;
        ctx.save();
        ctx.globalAlpha = opacity;
        drawScene(scene.id, ctx, size, state, assets, sceneT);
        ctx.restore();
      });
    },
  });

  return new Timeline(tracks);
}

/**
 * Compute a scene's draw opacity at time `t`. The first scene
 * starts at full opacity (no fade-in); subsequent scenes fade in
 * over CROSSFADE_SEC starting CROSSFADE_SEC before their nominal
 * start (so they overlap the previous scene's tail). No scene
 * fades out — the next scene drawing on top covers it.
 */
function sceneOpacity(
  scene: { start: number; end: number },
  idx: number,
  t: number
): number {
  if (t >= scene.end) return 0;
  // First scene has no fade-in.
  if (idx === 0) {
    return t >= scene.start ? 1 : 0;
  }
  const fadeInStart = scene.start - CROSSFADE_SEC;
  if (t < fadeInStart) return 0;
  if (t < scene.start) return (t - fadeInStart) / CROSSFADE_SEC;
  return 1;
}

function drawScene(
  id: (typeof SCENES)[number]["id"],
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  assets: PromoMp4Assets,
  sceneT: number
): void {
  switch (id) {
    case "title":
      drawTitleCard(ctx, size, state, sceneT);
      return;
    case "hero":
      drawHeroScene(ctx, size, state, assets.scene2, sceneT);
      return;
    case "highlights":
      drawHighlightsScene(ctx, size, state, assets.scene3, sceneT);
      return;
    case "event":
      drawEventScene(ctx, size, state, assets.scene4, sceneT);
      return;
    case "qr":
      drawQrScene(ctx, size, state, assets.qrImage, sceneT);
      return;
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* Scene draws — each takes the full canvas at sceneT seconds into  */
/* its own window. The caller has set globalAlpha for the scene-    */
/* level crossfade.                                                 */
/* ──────────────────────────────────────────────────────────────── */

function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  t: number
): void {
  const isSquare = isSquareCanvas(size);
  // Full-bleed brand-primary background.
  ctx.fillStyle = state.primary;
  ctx.fillRect(0, 0, size.width, size.height);

  const cx = size.width / 2;
  const cy = size.height / 2;

  // Headline scales 0.95 → 1.0 + opacity 0 → 1 over 600ms; holds
  // until the next scene's fade-in covers it.
  const headlineP = clamp01(t / 0.6);
  const headlineScale = 0.95 + headlineP * 0.05;
  const headlineSize = isSquare ? 110 : 140;
  const dateSize = isSquare ? 30 : 36;
  const timeSize = isSquare ? 24 : 28;

  ctx.save();
  ctx.translate(cx, cy - headlineSize * 0.4);
  ctx.scale(headlineScale, headlineScale);
  ctx.globalAlpha *= headlineP;
  ctx.fillStyle = state.onPrimary;
  ctx.font = `bold ${headlineSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawSpaced(ctx, "OPEN HOUSE", 0, 0, 6);
  ctx.restore();

  // Date + time fade in 200ms after the headline.
  const dtP = clamp01((t - 0.4) / 0.5);
  if (dtP <= 0) return;
  ctx.save();
  ctx.globalAlpha *= dtP;
  ctx.fillStyle = state.onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (state.dateLabel) {
    ctx.font = `bold ${dateSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.dateLabel, cx, cy + headlineSize * 0.5 + dateSize);
  }
  if (state.timeLabel) {
    ctx.font = `${timeSize}px Helvetica, Arial, sans-serif`;
    ctx.globalAlpha *= 0.85;
    ctx.fillText(
      state.timeLabel,
      cx,
      cy + headlineSize * 0.5 + dateSize + timeSize * 1.4
    );
  }
  ctx.restore();
}

function drawHeroScene(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  photoCanvas: HTMLCanvasElement | null,
  t: number
): void {
  const isSquare = isSquareCanvas(size);
  drawPhotoBackground(ctx, size, state, photoCanvas, t);

  // Bottom gradient scrim — transparent to ~80% bg color over the
  // bottom 35% of the canvas. Keeps text legible against any photo.
  drawBottomScrim(ctx, size, state.background, 0.35, 0.85);

  // Text fade-in starts at sceneT 0.2s, completes at sceneT 0.6s.
  const textP = clamp01((t - 0.2) / 0.4);
  if (textP <= 0) return;

  const padX = isSquare ? 60 : 80;
  const padBottom = isSquare ? 70 : 100;
  const addressSize = isSquare ? 44 : 56;
  const citySize = isSquare ? 24 : 32;
  const priceSize = isSquare ? 64 : 80;

  // Address bottom-left, price bottom-right. They stack on the
  // same bottom baseline with the address lifting above its city
  // line.
  ctx.save();
  ctx.globalAlpha *= textP;
  ctx.fillStyle = state.textPrimary;

  // Address
  if (state.address) {
    ctx.font = `bold ${addressSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const addressY = size.height - padBottom - (state.city ? citySize + 8 : 0);
    ctx.fillText(state.address, padX, addressY);
    if (state.city) {
      ctx.font = `${citySize}px Helvetica, Arial, sans-serif`;
      ctx.globalAlpha *= 0.85;
      ctx.fillText(state.city, padX, size.height - padBottom);
    }
  }

  // Price
  if (state.price) {
    ctx.globalAlpha = ctx.globalAlpha; // reset opacity multiplier
    ctx.fillStyle = state.primary;
    ctx.font = `bold ${priceSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(state.price, size.width - padX, size.height - padBottom);
  }
  ctx.restore();
}

function drawHighlightsScene(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  photoCanvas: HTMLCanvasElement | null,
  t: number
): void {
  const isSquare = isSquareCanvas(size);
  drawPhotoBackground(ctx, size, state, photoCanvas, t);

  // Top scrim covers ~35% of canvas height; highlights stack inside.
  drawTopScrim(ctx, size, state.background, 0.4, 0.85);

  const padX = isSquare ? 60 : 80;
  const padTop = isSquare ? 80 : 130;
  const badgeFont = isSquare ? 30 : 36;
  const badgeH = isSquare ? 56 : 70;
  const badgePadX = isSquare ? 26 : 32;
  const badgeGap = 14;

  // Limit to 3 highlights — more than that gets crowded.
  const highlights = state.highlights.slice(0, 3);

  ctx.save();
  ctx.font = `bold ${badgeFont}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let y = padTop + badgeH / 2;
  highlights.forEach((label, i) => {
    const enterAt = i * 0.2; // staggered fade-in
    const localP = clamp01((t - enterAt) / 0.4);
    if (localP <= 0) {
      y += badgeH + badgeGap;
      return;
    }
    const text = label;
    const textW = ctx.measureText(text).width;
    const w = Math.min(size.width - padX * 2, textW + badgePadX * 2);
    const x = (size.width - w) / 2;

    ctx.save();
    ctx.globalAlpha *= localP;
    // Slight slide-down on entry: 0 → 0 (10px above final)
    const slideOffset = (1 - localP) * -10;
    ctx.translate(0, slideOffset);

    // Pill background — accent color is the brand's secondary.
    // This is where accent earns its job in the MP4.
    ctx.fillStyle = state.accent;
    drawRoundedRect(ctx, x, y - badgeH / 2, w, badgeH, badgeH / 2);
    ctx.fill();

    // Pill text
    ctx.fillStyle = state.onAccent;
    ctx.fillText(text, x + w / 2, y);
    ctx.restore();

    y += badgeH + badgeGap;
  });
  ctx.restore();
}

function drawEventScene(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  photoCanvas: HTMLCanvasElement | null,
  t: number
): void {
  const isSquare = isSquareCanvas(size);
  drawPhotoBackground(ctx, size, state, photoCanvas, t);

  // Center band scrim — full-width strip across the vertical
  // middle of the canvas at ~70% bg opacity. Lets event-recap
  // text read clearly without darkening the entire photo.
  const stripH = isSquare ? size.height * 0.35 : size.height * 0.3;
  const stripY = (size.height - stripH) / 2;
  ctx.save();
  ctx.fillStyle = state.background;
  ctx.globalAlpha *= 0.7;
  ctx.fillRect(0, stripY, size.width, stripH);
  ctx.restore();

  const textP = clamp01((t - 0.2) / 0.4);
  if (textP <= 0) return;

  const cx = size.width / 2;
  const cy = size.height / 2;
  const dateTimeSize = isSquare ? 44 : 56;
  const labelSize = isSquare ? 22 : 26;

  ctx.save();
  ctx.globalAlpha *= textP;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // "JOIN US" label above
  ctx.fillStyle = state.primary;
  ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
  drawSpaced(ctx, "JOIN US", cx, cy - dateTimeSize, 4);

  // Date + time stacked
  ctx.fillStyle = state.textPrimary;
  ctx.font = `bold ${dateTimeSize}px Helvetica, Arial, sans-serif`;
  if (state.dateLabel) {
    ctx.fillText(state.dateLabel, cx, cy);
  }
  if (state.timeLabel) {
    ctx.font = `${dateTimeSize * 0.7}px Helvetica, Arial, sans-serif`;
    ctx.globalAlpha *= 0.9;
    ctx.fillText(state.timeLabel, cx, cy + dateTimeSize * 0.95);
  }
  ctx.restore();
}

function drawQrScene(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  qrImage: HTMLImageElement | null,
  t: number
): void {
  const isSquare = isSquareCanvas(size);
  // Brand-primary background.
  ctx.fillStyle = state.primary;
  ctx.fillRect(0, 0, size.width, size.height);

  const cx = size.width / 2;
  const cy = size.height / 2;

  if (!qrImage) {
    // No QR — show a fallback "Scan for details" text-only state.
    const labelSize = isSquare ? 28 : 36;
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawSpaced(ctx, "OPEN HOUSE", cx, cy, 6);
    return;
  }

  // QR scale 0.9 → 1.0 over 500ms.
  const qrP = clamp01(t / 0.5);
  const qrSize = Math.floor(Math.min(size.width, size.height) * 0.55);
  const scale = 0.9 + qrP * 0.1;
  const drawW = qrSize * scale;
  const drawH = qrSize * scale;
  const drawX = cx - drawW / 2;
  const drawY = cy - drawH / 2;

  ctx.save();
  ctx.globalAlpha *= qrP;

  // White card behind QR for crisp edges + scanner reliability.
  const pad = drawW * 0.05;
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(
    ctx,
    drawX - pad,
    drawY - pad,
    drawW + pad * 2,
    drawH + pad * 2,
    16
  );
  ctx.fill();
  ctx.drawImage(qrImage, drawX, drawY, drawW, drawH);
  ctx.restore();

  // Address one-liner above the QR
  const aboveSize = isSquare ? 22 : 28;
  if (state.address) {
    ctx.save();
    ctx.globalAlpha *= clamp01(t / 0.7);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `${aboveSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha *= 0.85;
    ctx.fillText(state.address, cx, drawY - pad - 24);
    ctx.restore();
  }

  // "SCAN FOR DETAILS" label below the QR (in accent — accent is
  // now load-bearing in the MP4 design alongside primary).
  const labelSize = isSquare ? 28 : 34;
  ctx.save();
  ctx.globalAlpha *= clamp01((t - 0.3) / 0.4);
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, "SCAN FOR DETAILS", cx, drawY + drawH + pad + labelSize, 3);
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

function isSquareCanvas(size: { width: number; height: number }): boolean {
  return Math.abs(size.width - size.height) < 50;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Draw a pre-cropped photo canvas at full bleed with Ken Burns
 * scale (1.0 → 1.05 over scene duration). The pre-cropped canvas
 * is already sized to (size.width × size.height) and centered on
 * the user's focal point — Ken Burns zooms around the canvas
 * center, which is also the focal point thanks to the upstream
 * crop. If photoCanvas is null, falls back to the brand background.
 */
function drawPhotoBackground(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  state: PromoMp4State,
  photoCanvas: HTMLCanvasElement | null,
  t: number
): void {
  if (!photoCanvas) {
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, size.width, size.height);
    return;
  }
  // Approximate scene duration (longest scene is 2.0s); for Ken
  // Burns we just want a slow, steady zoom regardless of which
  // scene we're in. Cap progress at 1.0 in case sceneT runs slightly
  // long during crossfade overlap.
  const sceneDur = 2.0;
  const burnP = clamp01(t / sceneDur);
  const zoom = 1.0 + burnP * 0.05;
  const dw = size.width * zoom;
  const dh = size.height * zoom;
  const dx = (size.width - dw) / 2;
  const dy = (size.height - dh) / 2;
  ctx.drawImage(photoCanvas, dx, dy, dw, dh);
}

/**
 * Draw a transparent-to-color gradient on the bottom portion of
 * the canvas to keep overlaid text legible. heightFraction is the
 * fraction of canvas height the scrim covers; opacityAtBottom is
 * the alpha multiplier on the scrim color at the canvas bottom.
 */
function drawBottomScrim(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  color: string,
  heightFraction: number,
  opacityAtBottom: number
): void {
  const h = size.height * heightFraction;
  const startY = size.height - h;
  const grad = ctx.createLinearGradient(0, startY, 0, size.height);
  grad.addColorStop(0, withAlpha(color, 0));
  grad.addColorStop(1, withAlpha(color, opacityAtBottom));
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, startY, size.width, h);
  ctx.restore();
}

function drawTopScrim(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  color: string,
  heightFraction: number,
  opacityAtTop: number
): void {
  const h = size.height * heightFraction;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, withAlpha(color, opacityAtTop));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size.width, h);
  ctx.restore();
}

/** "#rrggbb" → "rgba(r,g,b,a)" with the requested alpha multiplier. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

/**
 * Draw text with letter-spacing. Canvas 2D doesn't support
 * letter-spacing natively, so we walk the string character by
 * character and offset each by the measured width plus the
 * requested spacing. Used for headlines where the wide spacing is
 * load-bearing for the design.
 */
function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
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
  let x = centerX - total / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = widths[i];
    ctx.textAlign = "left";
    ctx.fillText(ch, x, y);
    x += w + spacing;
  }
}
