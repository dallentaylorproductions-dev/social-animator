import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, linear } from "@/engine/easing";

/**
 * Open House Promo MP4 — multi-scene composition with persistent
 * header bar (H-7r). Reverts the H-7q "animate the flyer" approach
 * back to the H-7g multi-scene direction, but with all the
 * refinements we built in between (blur-fill hero from H-7o,
 * focal-point crops from H-7f, generous safe-area padding from
 * H-7n, hard-capped layout dimensions from H-7p).
 *
 * Key refinement vs the original H-7g attempt: the header BAR
 * (color/shape) never animates. Only the TEXT inside the header
 * animates in once during scene 1, then sits static for the rest
 * of the 6-second loop. This persistent-header continuity is what
 * makes the composition feel intentional rather than "scenes that
 * appear and disappear."
 *
 * Total runtime: 6 seconds. Three scenes:
 *   0.0–1.8s  Title card    full-bleed primary, address + price
 *                            + JOIN US date repeat below header
 *   1.8–4.5s  Hero + overlay hero photo blur-filled, bottom
 *                            gradient scrim with address/price/
 *                            highlight pills
 *   4.5–6.0s  QR card        full-bleed primary, large QR centered
 *                            with SCAN FOR DETAILS label
 *
 * Z-order on every frame:
 *   1. Page background fallback
 *   2. Header bar (always primary color, no animation)
 *   3. Active scene body (clipped to body region, crossfading
 *      300ms at scene boundaries)
 *   4. Header text (animates in during scene 1 only, then static)
 *
 * Aspect-aware: same scene structure for 1080×1920 reel and
 * 1080×1080 square; only sizes and positions adapt.
 */

export const PROMO_TOTAL_SEC = 6;

const SAFE_X = 80;
const SAFE_Y = 60;
const TRANSITION_SEC = 0.3;
const DEBUG_SAFE_AREA = false;

export interface PromoMp4State {
  primary: string;
  accent: string;
  background: string;
  textPrimary: string;
  textMuted: string;
  onPrimary: string;
  /** Auto-flipped against accent — used for highlight pill text. */
  onAccent: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  address: string;
  city: string;
  price: string;
  highlights: string[];
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  canvas: { w: number; h: number };
  isSquare: boolean;
  header: Rect;
  body: Rect;
}

function computeLayout(size: { width: number; height: number }): Layout {
  const isSquare = Math.abs(size.width - size.height) < 50;
  const headerH = isSquare ? 120 : 160;
  return {
    canvas: { w: size.width, h: size.height },
    isSquare,
    header: { x: 0, y: 0, w: size.width, h: headerH },
    body: {
      x: 0,
      y: headerH,
      w: size.width,
      h: size.height - headerH,
    },
  };
}

interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  /** Global timeline time in seconds (0..6). */
  t: number;
  /** Time relative to this scene's start (0..sceneDuration). */
  sceneT: number;
  layout: Layout;
  state: PromoMp4State;
  assets: PromoMp4Assets;
}

type SceneRenderer = (sc: SceneCtx) => void;

interface Scene {
  start: number;
  end: number;
  render: SceneRenderer;
}

const SCENES: Scene[] = [
  { start: 0, end: 1.8, render: renderTitleScene },
  { start: 1.8, end: 4.5, render: renderHeroScene },
  { start: 4.5, end: 6.0, render: renderQrScene },
];

export function buildPromoTimeline(
  state: PromoMp4State,
  size: { width: number; height: number },
  assets: PromoMp4Assets
): Timeline {
  const layout = computeLayout(size);
  const tracks: Track[] = [];

  tracks.push({
    id: "flyer",
    start: 0,
    duration: PROMO_TOTAL_SEC,
    easing: linear,
    onUpdate: (p, ctx) => {
      const t = p * PROMO_TOTAL_SEC;
      renderFrame(ctx, t, layout, state, assets);
    },
  });

  return new Timeline(tracks);
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  layout: Layout,
  state: PromoMp4State,
  assets: PromoMp4Assets
): void {
  const { canvas } = layout;

  // 1. Page background fallback. Scenes paint over this; it's
  // visible only if a scene leaves transparent gaps (none should).
  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, canvas.w, canvas.h);

  // 2. Header bar — always present, no animation. Primary color
  // band the full width of the canvas. Drawn before scenes so
  // the body-region clip below prevents scene content from
  // bleeding into the header area.
  drawHeaderBar(ctx, layout, state);

  // 3. Active scene with optional crossfade. Body-region clip
  // ensures scene content stays below the header — the header
  // bar persists visually across scene boundaries.
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.body.x, layout.body.y, layout.body.w, layout.body.h);
  ctx.clip();

  const sceneInfo = findScene(t);
  const active = sceneInfo.active;
  const prev = sceneInfo.prev;
  const fadeIn = sceneInfo.fadeIn;

  const sceneT = (s: Scene) => t - s.start;

  if (prev && fadeIn < 1) {
    // Crossfade: previous scene fading out, active scene fading in.
    ctx.save();
    ctx.globalAlpha = 1 - fadeIn;
    prev.render({
      ctx,
      t,
      sceneT: sceneT(prev),
      layout,
      state,
      assets,
    });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fadeIn;
    active.render({
      ctx,
      t,
      sceneT: sceneT(active),
      layout,
      state,
      assets,
    });
    ctx.restore();
  } else {
    active.render({
      ctx,
      t,
      sceneT: sceneT(active),
      layout,
      state,
      assets,
    });
  }
  ctx.restore();

  // 4. Header text — animates in during scene 1 (0-1.3s), then
  // static for the rest of the loop. Drawn last so it's on top
  // of everything else (defensive — scene clip already prevents
  // overlap, but z-order matters when scenes are full-bleed-primary
  // and the header-bar's bottom edge would otherwise be the only
  // visual boundary).
  drawHeaderText(ctx, t, layout, state);

  if (DEBUG_SAFE_AREA) drawSafeAreaDebug(ctx, canvas);
}

function findScene(t: number): {
  active: Scene;
  prev: Scene | null;
  fadeIn: number;
} {
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    if (t < s.end || i === SCENES.length - 1) {
      const fadeIn =
        i === 0 ? 1 : Math.min(1, (t - s.start) / TRANSITION_SEC);
      return {
        active: s,
        prev: i > 0 && fadeIn < 1 ? SCENES[i - 1] : null,
        fadeIn,
      };
    }
  }
  return { active: SCENES[SCENES.length - 1], prev: null, fadeIn: 1 };
}

/* ──────────────────────────────────────────────────────────────── */
/* Persistent header                                                */
/* ──────────────────────────────────────────────────────────────── */

function drawHeaderBar(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: PromoMp4State
): void {
  ctx.fillStyle = state.primary;
  ctx.fillRect(layout.header.x, layout.header.y, layout.header.w, layout.header.h);
}

function drawHeaderText(
  ctx: CanvasRenderingContext2D,
  t: number,
  layout: Layout,
  state: PromoMp4State
): void {
  const isSquare = layout.isSquare;
  const titleSize = isSquare ? 48 : 64;
  const dateSize = isSquare ? 22 : 28;
  const timeSize = isSquare ? 16 : 22;
  // y values are alphabetic-baseline positions inside the header band.
  const titleBaselineY = isSquare ? 55 : 70;
  const dateBaselineY = isSquare ? 90 : 110;
  const timeBaselineY = isSquare ? 108 : 138;

  // Per-element entrance progress. Each element fades in + slides
  // down a few px to its resting baseline. After 1.3s all three
  // are at full opacity and resting position; the values stay
  // computed-but-static for the rest of the loop (cheap).
  const titleP = clamp01((t - 0.2) / 0.6);
  const dateP = clamp01((t - 0.6) / 0.4);
  const timeP = clamp01((t - 0.9) / 0.4);

  const titleEased = easeOutCubic(titleP);
  const dateEased = easeOutCubic(dateP);
  const timeEased = easeOutCubic(timeP);

  const cx = layout.canvas.w / 2;

  ctx.save();
  ctx.fillStyle = state.onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Title
  if (titleP > 0) {
    const yOffset = (1 - titleEased) * 12;
    ctx.save();
    ctx.globalAlpha *= titleEased;
    ctx.font = `bold ${titleSize}px Helvetica, Arial, sans-serif`;
    drawSpaced(
      ctx,
      state.title.toUpperCase(),
      cx,
      titleBaselineY - yOffset,
      isSquare ? 4 : 6
    );
    ctx.restore();
  }

  // Date
  if (dateP > 0 && state.dateLabel) {
    const yOffset = (1 - dateEased) * 8;
    ctx.save();
    ctx.globalAlpha *= dateEased;
    ctx.font = `bold ${dateSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.dateLabel, cx, dateBaselineY - yOffset);
    ctx.restore();
  }

  // Time (muted)
  if (timeP > 0 && state.timeLabel) {
    const yOffset = (1 - timeEased) * 6;
    ctx.save();
    ctx.globalAlpha *= timeEased * 0.85;
    ctx.font = `${timeSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.timeLabel, cx, timeBaselineY - yOffset);
    ctx.restore();
  }

  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Scene 1 — Title card (full-bleed primary)                        */
/* ──────────────────────────────────────────────────────────────── */

function renderTitleScene(sc: SceneCtx): void {
  const { ctx, t, layout, state } = sc;
  const isSquare = layout.isSquare;
  const body = layout.body;

  // Body fills with primary so the canvas reads as one continuous
  // mint surface from header through bottom.
  ctx.fillStyle = state.primary;
  ctx.fillRect(body.x, body.y, body.w, body.h);

  // Body content fades in starting at 0.4s, holds from 1.0s.
  const bodyP = clamp01((t - 0.4) / 0.6);
  if (bodyP <= 0) return;

  ctx.save();
  ctx.globalAlpha *= bodyP;

  const cx = body.x + body.w / 2;

  if (isSquare) {
    // Square: vertically centered between header bottom (120) and
    // canvas bottom (1080). Center y around 600.
    const centerY = body.y + body.h / 2;
    const presentingY = centerY - 200;
    const addressY = centerY - 140;
    const cityY = centerY - 80;
    const joinUsY = centerY + 20;
    const dateY = centerY + 80;

    drawCenteredSpaced(ctx, "PRESENTING", cx, presentingY, 16, state.onPrimary, 2);
    drawCenteredText(
      ctx,
      state.address || "Property address",
      cx,
      addressY,
      44,
      state.onPrimary,
      true
    );
    if (state.city) {
      drawCenteredText(ctx, state.city, cx, cityY, 24, state.onPrimary, false, 0.85);
    }
    drawCenteredSpaced(ctx, "JOIN US", cx, joinUsY, 16, state.onPrimary, 2);
    if (state.dateLabel) {
      drawCenteredText(ctx, state.dateLabel, cx, dateY, 30, state.onPrimary, true);
    }
  } else {
    // Reel: explicit y positions per the H-7r spec.
    drawCenteredSpaced(ctx, "PRESENTING", cx, 600, 18, state.onPrimary, 3);
    drawCenteredText(
      ctx,
      state.address || "Property address",
      cx,
      660,
      60,
      state.onPrimary,
      true
    );
    if (state.city) {
      drawCenteredText(ctx, state.city, cx, 730, 32, state.onPrimary, false, 0.85);
    }
    drawCenteredSpaced(ctx, "JOIN US", cx, 800, 18, state.onPrimary, 3);
    if (state.dateLabel) {
      drawCenteredText(ctx, state.dateLabel, cx, 850, 40, state.onPrimary, true);
    }
  }

  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Scene 2 — Hero photo with bottom overlay                         */
/* ──────────────────────────────────────────────────────────────── */

function renderHeroScene(sc: SceneCtx): void {
  const { ctx, sceneT, layout, state, assets } = sc;
  const isSquare = layout.isSquare;
  const body = layout.body;

  // Hero photo fills the body region. blurFillCompose was called
  // upstream with body.w × body.h dimensions so the canvas is
  // exact-fit; Ken Burns scales it +5% over the scene duration.
  ctx.save();
  ctx.beginPath();
  ctx.rect(body.x, body.y, body.w, body.h);
  ctx.clip();

  if (assets.hero) {
    const sceneDur = 2.7;
    const burnP = clamp01(sceneT / sceneDur);
    const zoom = 1.0 + burnP * 0.05;
    const dw = body.w * zoom;
    const dh = body.h * zoom;
    const dx = body.x + (body.w - dw) / 2;
    const dy = body.y + (body.h - dh) / 2;
    ctx.drawImage(assets.hero, dx, dy, dw, dh);
  } else {
    // No hero — fall back to primary fill so the scene still has
    // a deliberate look.
    ctx.fillStyle = state.primary;
    ctx.fillRect(body.x, body.y, body.w, body.h);
  }
  ctx.restore();

  // Bottom gradient scrim
  const scrimH = isSquare ? 240 : 320;
  const scrimY = body.y + body.h - scrimH;
  const grad = ctx.createLinearGradient(0, scrimY, 0, body.y + body.h);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.78)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(body.x, scrimY, body.w, scrimH);
  ctx.restore();

  // Overlay content fades in at sceneT 0.2s, stagger 100ms each.
  const padX = isSquare ? 80 : 100;
  const bottomInset = isSquare ? 60 : 80;
  const addressSize = isSquare ? 38 : 56;
  const citySize = isSquare ? 20 : 28;
  const priceSize = isSquare ? 40 : 60;
  const pillTextSize = isSquare ? 18 : 22;
  const pillPadH = isSquare ? 14 : 16;
  const pillPadV = isSquare ? 6 : 8;
  const pillGap = isSquare ? 10 : 12;
  const maxPills = isSquare ? 2 : 3;

  // Anchor address+city baseline near the bottom inset.
  const addressBaselineY = body.y + body.h - bottomInset - citySize - 8;
  const cityBaselineY = body.y + body.h - bottomInset;
  // Price right-aligned on same baseline as address.
  const priceBaselineY = addressBaselineY;

  const aP = clamp01((sceneT - 0.2) / 0.4);
  const cP = clamp01((sceneT - 0.3) / 0.4);
  const pP = clamp01((sceneT - 0.4) / 0.4);
  const pillP = clamp01((sceneT - 0.5) / 0.4);

  // Address
  if (aP > 0 && state.address) {
    ctx.save();
    ctx.globalAlpha *= aP;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${addressSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(state.address, body.x + padX, addressBaselineY);
    ctx.restore();
  }
  // City
  if (cP > 0 && state.city) {
    ctx.save();
    ctx.globalAlpha *= cP * 0.85;
    ctx.fillStyle = "#ffffff";
    ctx.font = `${citySize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(state.city, body.x + padX, cityBaselineY);
    ctx.restore();
  }
  // Price (right-aligned)
  if (pP > 0 && state.price) {
    ctx.save();
    ctx.globalAlpha *= pP;
    ctx.fillStyle = state.primary;
    ctx.font = `bold ${priceSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      state.price,
      body.x + body.w - padX,
      priceBaselineY
    );
    ctx.restore();
  }

  // Highlight pills row — above address row.
  const pills = state.highlights.slice(0, maxPills);
  if (pillP > 0 && pills.length > 0) {
    const pillRowBaselineY =
      addressBaselineY - addressSize - 24 - pillPadV;
    ctx.save();
    ctx.globalAlpha *= pillP;
    ctx.font = `bold ${pillTextSize}px Helvetica, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let pillX = body.x + padX;
    const pillH = pillTextSize + pillPadV * 2;
    for (const label of pills) {
      const textW = ctx.measureText(label).width;
      const pillW = textW + pillPadH * 2;
      ctx.fillStyle = state.accent;
      drawRoundedRect(ctx, pillX, pillRowBaselineY - pillH / 2, pillW, pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = state.onAccent;
      ctx.fillText(label, pillX + pillPadH, pillRowBaselineY);
      pillX += pillW + pillGap;
    }
    ctx.restore();
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* Scene 3 — QR card                                                */
/* ──────────────────────────────────────────────────────────────── */

function renderQrScene(sc: SceneCtx): void {
  const { ctx, sceneT, layout, state, assets } = sc;
  const isSquare = layout.isSquare;
  const body = layout.body;

  // Body fills with primary — same as scene 1 — so QR lives on
  // a clean brand-color surface that visually merges with the
  // header bar.
  ctx.fillStyle = state.primary;
  ctx.fillRect(body.x, body.y, body.w, body.h);

  if (!assets.qrImage) return;

  // QR scale-in animation: 0.92 → 1.0 over first 500ms.
  const qrP = clamp01(sceneT / 0.5);
  const easedP = easeOutCubic(qrP);
  const scale = 0.92 + easedP * 0.08;

  const cardSize = isSquare ? 440 : 600;
  const cardPad = 24; // internal white padding
  const innerSize = cardSize - cardPad * 2; // QR display size

  const cx = body.x + body.w / 2;
  const cardTopY = isSquare ? 320 : 620;

  const drawSize = cardSize * scale;
  const drawX = cx - drawSize / 2;
  const drawY = cardTopY + (cardSize - drawSize) / 2;

  ctx.save();
  ctx.globalAlpha *= easedP;

  // White card
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, drawX, drawY, drawSize, drawSize, isSquare ? 12 : 16);
  ctx.fill();

  // QR image inside card with internal padding
  const qrDrawX = drawX + cardPad * scale;
  const qrDrawY = drawY + cardPad * scale;
  const qrDrawSize = innerSize * scale;
  ctx.drawImage(assets.qrImage, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);
  ctx.restore();

  // SCAN FOR DETAILS label
  const labelSize = isSquare ? 22 : 32;
  const labelY = isSquare ? 800 : 1280;
  // Address one-liner below
  const addressSize = isSquare ? 18 : 24;
  const addressY = isSquare ? 850 : 1340;

  // Both labels fade in slightly after the QR settles.
  const labelP = clamp01((sceneT - 0.4) / 0.4);
  if (labelP > 0) {
    ctx.save();
    ctx.globalAlpha *= labelP;
    ctx.fillStyle = state.accent;
    ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    drawSpaced(ctx, "SCAN FOR DETAILS", cx, labelY, isSquare ? 2 : 3);
    ctx.restore();
  }
  if (labelP > 0 && state.address) {
    ctx.save();
    ctx.globalAlpha *= labelP * 0.85;
    ctx.fillStyle = state.onPrimary;
    ctx.font = `${addressSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(state.address, cx, addressY);
    ctx.restore();
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

function drawCenteredSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
  color: string,
  spacing: number
): void {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, text.toUpperCase(), cx, y, spacing);
  ctx.restore();
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
  color: string,
  bold: boolean,
  alphaMul: number = 1
): void {
  if (!text) return;
  ctx.save();
  ctx.globalAlpha *= alphaMul;
  ctx.fillStyle = color;
  ctx.font = `${bold ? "bold " : ""}${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, cx, y);
  ctx.restore();
}

function drawSafeAreaDebug(
  ctx: CanvasRenderingContext2D,
  canvas: { w: number; h: number }
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(SAFE_X, 0);
  ctx.lineTo(SAFE_X, canvas.h);
  ctx.moveTo(canvas.w - SAFE_X, 0);
  ctx.lineTo(canvas.w - SAFE_X, canvas.h);
  ctx.moveTo(0, SAFE_Y);
  ctx.lineTo(canvas.w, SAFE_Y);
  ctx.moveTo(0, canvas.h - SAFE_Y);
  ctx.lineTo(canvas.w, canvas.h - SAFE_Y);
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
