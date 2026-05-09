import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutQuad, linear } from "@/engine/easing";
import { drawImageContain } from "@/engine/draw";

/**
 * Open House Promo MP4 — animated flyer composition mirroring the
 * static PDF layout. Replaces H-7g's multi-scene approach (title
 * card → photo+price → photo+highlights → photo+event → QR card),
 * which read as cheap-template; this redesign keeps the entire
 * flyer onscreen and adds subtle motion (Ken Burns + staggered
 * element fade-ins) to give it cinematic polish.
 *
 * Total runtime: 6 seconds, 30fps. Both 9:16 (1080×1920) and 1:1
 * (1080×1080) render the same vertical stack of blocks; only sizes
 * and which-blocks-render adapt to the aspect (1:1 drops the thumb
 * strip and tightens the agent block).
 *
 * Composition (top → bottom, mirrors PromoDocument):
 *   Header bar    primary-bg, "OPEN HOUSE" + date + time
 *   Hero photo    photos[0], focal-cropped, Ken Burns 1.0→1.04
 *   Thumb strip   (9:16 only) photos[1..4] in a 4-column row
 *   Property      "PRESENTING" + address + price
 *   Features      "FEATURES" + 3 primary-bullet bullets
 *   Agent + QR    logo + agent name (left) + QR + label (right)
 *   Footer bar    primary-bg, notes / address echo + license
 *
 * Motion:
 *   0.00-0.50s  header slides in from top + headline fades
 *   0.20-0.80s  hero fade-in + Ken Burns starts (continues 0..6s)
 *   0.80-1.40s  thumb strip staggered fade (9:16 only, 100ms each)
 *   1.40-2.00s  property block slides up from below + fades
 *   2.00-2.60s  features block fades
 *   2.60-3.20s  agent + QR row slides up + fades
 *   3.20-6.00s  hold + Ken Burns continues + QR gentle pulse
 *               (scale 1.00→1.02→1.00 sin wave on 2s period)
 *   Footer is present from t=0 (anchors the composition; no entry
 *   animation since it's the load-bearing bottom of the layout)
 */

export const PROMO_TOTAL_SEC = 6;

export interface PromoMp4State {
  primary: string;
  accent: string;
  background: string;
  textPrimary: string;
  textMuted: string;
  onPrimary: string;
  // Content
  title: string; // always "OPEN HOUSE"
  dateLabel: string;
  timeLabel: string;
  address: string;
  city: string;
  price: string;
  highlights: string[]; // top 3 used in MP4
  agentName: string;
  brokerage: string;
  phone: string;
  email: string;
  licenseNumber: string;
  /** Footer center text — eventNotes-or-address (computed upstream
   *  in render-mp4 so the MP4 footer matches the PDF footer). */
  footerCenter: string;
}

export interface PromoMp4Assets {
  /** Hero photo pre-cropped to the hero region's aspect on the
   *  user's focal point. Null = render brand-bg fallback. */
  hero: HTMLCanvasElement | null;
  /** Thumb-strip photos, each pre-cropped to the thumb cell aspect.
   *  9:16 uses up to 4; 1:1 ignores this asset entirely. */
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
  isSquare: boolean;
  header: Rect;
  hero: Rect;
  thumbStrip: Rect | null; // null on 1:1
  property: Rect;
  features: Rect;
  agentQr: Rect;
  footer: Rect;
  margin: number;
}

/**
 * Compute the vertical-stack layout for a given canvas size. 9:16
 * has room for the full stack including thumb strip; 1:1 drops the
 * strip and tightens every block.
 */
function computeLayout(size: { width: number; height: number }): Layout {
  const { width, height } = size;
  const isSquare = Math.abs(width - height) < 50;
  const margin = isSquare ? 40 : 50;

  if (isSquare) {
    const header = { x: 0, y: 0, w: width, h: 110 };
    const hero = { x: 0, y: header.h, w: width, h: 480 };
    // 1:1 skips the thumb strip — too narrow at 4 thumbs.
    const property = { x: 0, y: header.h + hero.h, w: width, h: 130 };
    const features = {
      x: 0,
      y: header.h + hero.h + property.h,
      w: width,
      h: 130,
    };
    const agentQr = {
      x: 0,
      y: header.h + hero.h + property.h + features.h,
      w: width,
      h: 150,
    };
    const footer = {
      x: 0,
      y: height - 80,
      w: width,
      h: 80,
    };
    return {
      isSquare,
      header,
      hero,
      thumbStrip: null,
      property,
      features,
      agentQr,
      footer,
      margin,
    };
  }

  // 9:16 portrait
  const header = { x: 0, y: 0, w: width, h: 220 };
  const hero = { x: 0, y: header.h, w: width, h: 600 };
  const thumbStrip = {
    x: margin,
    y: header.h + hero.h,
    w: width - margin * 2,
    h: 180,
  };
  const property = {
    x: 0,
    y: thumbStrip.y + thumbStrip.h,
    w: width,
    h: 240,
  };
  const features = {
    x: 0,
    y: property.y + property.h,
    w: width,
    h: 220,
  };
  const agentQr = {
    x: 0,
    y: features.y + features.h,
    w: width,
    h: 320,
  };
  const footer = { x: 0, y: height - 140, w: width, h: 140 };
  return {
    isSquare,
    header,
    hero,
    thumbStrip,
    property,
    features,
    agentQr,
    footer,
    margin,
  };
}

export function buildPromoTimeline(
  state: PromoMp4State,
  size: { width: number; height: number },
  assets: PromoMp4Assets
): Timeline {
  const layout = computeLayout(size);
  const tracks: Track[] = [];

  // Single track running for the full duration. Easier to reason
  // about animation timing as one continuous timeline rather than
  // splitting block draws across many tracks — and the canvas-2D
  // composition is naturally serial anyway (we paint each block in
  // a fixed z-order on every frame).
  tracks.push({
    id: "flyer",
    start: 0,
    duration: PROMO_TOTAL_SEC,
    easing: linear,
    onUpdate: (p, ctx) => {
      const t = p * PROMO_TOTAL_SEC;
      // Page background — covers any gaps between blocks.
      ctx.fillStyle = state.background;
      ctx.fillRect(0, 0, size.width, size.height);

      drawHeader(ctx, layout.header, state, t);
      drawHero(ctx, layout.hero, state, assets.hero, t);
      if (layout.thumbStrip && assets.thumbs.length > 0) {
        drawThumbStrip(ctx, layout.thumbStrip, assets.thumbs, t);
      }
      drawProperty(ctx, layout.property, state, layout, t);
      drawFeatures(ctx, layout.features, state, layout, t);
      drawAgentQr(
        ctx,
        layout.agentQr,
        state,
        assets.qrImage,
        assets.brandLogo,
        layout,
        t
      );
      drawFooter(ctx, layout.footer, state, layout);
    },
  });

  return new Timeline(tracks);
}

/* ──────────────────────────────────────────────────────────────── */
/* Block draws                                                      */
/* ──────────────────────────────────────────────────────────────── */

function drawHeader(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  t: number
): void {
  // Slide in from top: translateY -rect.h → 0 over 500ms with
  // easeOutCubic. Header is fully present after 0.5s.
  const slideP = clamp01(t / 0.5);
  const eased = easeOutCubic(slideP);
  const yOffset = -rect.h * (1 - eased);

  ctx.save();
  ctx.translate(0, yOffset);
  ctx.fillStyle = state.primary;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // Headline + date + time fade in slightly after the slide
  // starts so the slide motion reads first.
  const textP = clamp01((t - 0.1) / 0.5);
  if (textP > 0) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    const isSquare = rect.h < 150;
    const titleSize = isSquare ? 60 : 96;
    const dateSize = isSquare ? 24 : 32;
    const timeSize = isSquare ? 20 : 26;

    ctx.save();
    ctx.globalAlpha = textP;
    ctx.fillStyle = state.onPrimary;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold ${titleSize}px Helvetica, Arial, sans-serif`;
    drawSpaced(
      ctx,
      state.title.toUpperCase(),
      cx,
      cy - (state.dateLabel || state.timeLabel ? titleSize * 0.05 : -titleSize * 0.3),
      isSquare ? 4 : 8
    );

    if (state.dateLabel) {
      ctx.font = `bold ${dateSize}px Helvetica, Arial, sans-serif`;
      ctx.fillText(state.dateLabel, cx, cy + titleSize * 0.55 + dateSize * 0.5);
    }
    if (state.timeLabel) {
      ctx.font = `${timeSize}px Helvetica, Arial, sans-serif`;
      ctx.globalAlpha *= 0.9;
      ctx.fillText(
        state.timeLabel,
        cx,
        cy + titleSize * 0.55 + dateSize * 0.5 + timeSize * 1.4
      );
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  photoCanvas: HTMLCanvasElement | null,
  t: number
): void {
  // Hero region fill — visible while photo is null or the Ken
  // Burns zoom briefly exposes edges (it doesn't, but defensive).
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (!photoCanvas) {
    // Stenciled "OPEN HOUSE" placeholder text centered in the
    // region — same fallback as the static PDF.
    ctx.fillStyle = state.primary;
    ctx.globalAlpha = 0.6;
    ctx.font = `bold ${Math.floor(rect.h * 0.18)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OPEN HOUSE", rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
    return;
  }

  // Fade-in over 600ms starting at t=0.2.
  const fadeP = clamp01((t - 0.2) / 0.6);
  // Ken Burns: scale 1.0 → 1.04 over 6s, linear.
  const burnP = clamp01(t / PROMO_TOTAL_SEC);
  const zoom = 1.0 + burnP * 0.04;
  const dw = rect.w * zoom;
  const dh = rect.h * zoom;
  const dx = rect.x + (rect.w - dw) / 2;
  const dy = rect.y + (rect.h - dh) / 2;

  ctx.globalAlpha = fadeP;
  ctx.drawImage(photoCanvas, dx, dy, dw, dh);
  ctx.restore();
}

function drawThumbStrip(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  thumbs: HTMLCanvasElement[],
  t: number
): void {
  // Top padding inside the strip region for breathing room.
  const padTop = 14;
  const cellH = rect.h - padTop;
  const gap = 12;
  const count = Math.min(4, thumbs.length);
  const cellW = (rect.w - gap * (count - 1)) / count;

  for (let i = 0; i < count; i++) {
    // Stagger each thumb's fade-in 100ms apart, starting at 0.8s.
    const startT = 0.8 + i * 0.1;
    const fadeP = clamp01((t - startT) / 0.4);
    if (fadeP <= 0) continue;
    const cx = rect.x + i * (cellW + gap);
    const cy = rect.y + padTop;
    ctx.save();
    ctx.globalAlpha = fadeP;
    // Slight slide-up on entry (10pt) so the fade has motion.
    const slideOffset = (1 - fadeP) * 10;
    ctx.translate(0, slideOffset);
    // Clip to a rounded rect for a softer thumb edge.
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + cellW - r, cy);
    ctx.quadraticCurveTo(cx + cellW, cy, cx + cellW, cy + r);
    ctx.lineTo(cx + cellW, cy + cellH - r);
    ctx.quadraticCurveTo(
      cx + cellW,
      cy + cellH,
      cx + cellW - r,
      cy + cellH
    );
    ctx.lineTo(cx + r, cy + cellH);
    ctx.quadraticCurveTo(cx, cy + cellH, cx, cy + cellH - r);
    ctx.lineTo(cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(thumbs[i], cx, cy, cellW, cellH);
    ctx.restore();
  }
}

function drawProperty(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  layout: Layout,
  t: number
): void {
  // Slide up from below + fade over 600ms starting at 1.4s.
  const p = clamp01((t - 1.4) / 0.6);
  if (p <= 0) return;
  const eased = easeOutQuad(p);
  const yOffset = (1 - eased) * 30;

  const isSquare = layout.isSquare;
  const padX = layout.margin;
  const kickerSize = isSquare ? 18 : 24;
  const addressSize = isSquare ? 44 : 64;
  const citySize = isSquare ? 22 : 28;
  const priceSize = isSquare ? 56 : 84;

  ctx.save();
  ctx.translate(0, yOffset);
  ctx.globalAlpha = p;

  let y = rect.y + 24;

  // PRESENTING (accent)
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${kickerSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, "PRESENTING", padX, y, isSquare ? 2 : 3);
  y += kickerSize + (isSquare ? 12 : 18);

  // Address (textPrimary)
  if (state.address) {
    ctx.fillStyle = state.textPrimary;
    ctx.font = `bold ${addressSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address, padX, y + addressSize * 0.85);
    y += addressSize + 6;
  }
  if (state.city) {
    ctx.fillStyle = state.textMuted;
    ctx.font = `${citySize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.city, padX, y + citySize);
    y += citySize + (isSquare ? 6 : 12);
  }
  // Price (primary, large, right-aligned to give the property
  // block room for both address and price on a single eye-line).
  if (state.price) {
    ctx.fillStyle = state.primary;
    ctx.font = `bold ${priceSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(
      state.price,
      rect.x + rect.w - padX,
      rect.y + rect.h - 16
    );
  }
  ctx.restore();
}

function drawFeatures(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  layout: Layout,
  t: number
): void {
  const p = clamp01((t - 2.0) / 0.6);
  if (p <= 0) return;

  const isSquare = layout.isSquare;
  const padX = layout.margin;
  const labelSize = isSquare ? 18 : 24;
  const bulletSize = isSquare ? 26 : 34;
  const bulletGap = isSquare ? 16 : 22;
  const bulletDotR = isSquare ? 6 : 8;

  const highlights = state.highlights.slice(0, 3);
  if (highlights.length === 0) return;

  ctx.save();
  ctx.globalAlpha = p;

  let y = rect.y + 22;

  // FEATURES label (primary)
  ctx.fillStyle = state.primary;
  ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, "FEATURES", padX, y, isSquare ? 2 : 3);
  y += labelSize + (isSquare ? 16 : 22);

  // Bullets — primary dot + textPrimary text, one per line.
  ctx.font = `${bulletSize}px Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  highlights.forEach((h) => {
    const lineY = y + bulletSize / 2;
    ctx.fillStyle = state.primary;
    ctx.beginPath();
    ctx.arc(padX + bulletDotR, lineY, bulletDotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = state.textPrimary;
    ctx.fillText(h, padX + bulletDotR * 2 + (isSquare ? 14 : 22), lineY);
    y += bulletSize + bulletGap;
  });

  ctx.restore();
}

function drawAgentQr(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  qrImage: HTMLImageElement | null,
  brandLogo: HTMLImageElement | null,
  layout: Layout,
  t: number
): void {
  const p = clamp01((t - 2.6) / 0.6);
  if (p <= 0) return;
  const eased = easeOutQuad(p);
  const yOffset = (1 - eased) * 30;

  const isSquare = layout.isSquare;
  const padX = layout.margin;

  ctx.save();
  ctx.translate(0, yOffset);
  ctx.globalAlpha = p;

  // Two-column split: agent block on the left (~60% width), QR on
  // the right (~40% width with internal padding).
  const splitX = rect.x + rect.w * 0.6;

  // ── Agent block ──────────────────────────────────────────
  const logoSize = isSquare ? 50 : 80;
  const nameSize = isSquare ? 26 : 36;
  const brokerageSize = isSquare ? 18 : 24;
  const contactSize = isSquare ? 16 : 22;

  let agentY = rect.y + 24;
  if (brandLogo) {
    drawImageContain(ctx, brandLogo, padX, agentY, logoSize, logoSize);
  } else {
    // Fallback square with mint color and "LOGO" stenciled
    ctx.fillStyle = state.primary;
    ctx.fillRect(padX, agentY, logoSize, logoSize);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold ${Math.floor(logoSize * 0.22)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOGO", padX + logoSize / 2, agentY + logoSize / 2);
  }

  // Agent name to right of logo
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = state.textPrimary;
  ctx.font = `bold ${nameSize}px Helvetica, Arial, sans-serif`;
  const nameX = padX + logoSize + (isSquare ? 14 : 20);
  let nameY = agentY + nameSize;
  ctx.fillText(state.agentName || "Your name", nameX, nameY);
  nameY += brokerageSize + 4;
  if (state.brokerage) {
    ctx.font = `${brokerageSize}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = state.textMuted;
    ctx.fillText(state.brokerage, nameX, nameY);
  }

  agentY += logoSize + (isSquare ? 14 : 22);
  // Phone + email lines below the logo row
  ctx.fillStyle = state.textPrimary;
  ctx.font = `${contactSize}px Helvetica, Arial, sans-serif`;
  if (state.phone) {
    ctx.fillText(state.phone, padX, agentY + contactSize);
    agentY += contactSize + 6;
  }
  if (state.email) {
    ctx.fillText(state.email, padX, agentY + contactSize);
  }

  // ── QR block ─────────────────────────────────────────────
  if (qrImage) {
    // Gentle pulse: scale 1.0 → 1.02 → 1.0 over 2s, repeating after
    // the entry animation finishes (~3.2s). sin-wave is smoother
    // than a stepwise scale.
    const pulseT = Math.max(0, t - 3.2);
    const pulse = Math.sin((pulseT / 2) * Math.PI * 2) * 0.01 + 1.0;

    const qrSize = isSquare ? 110 : 200;
    const qrCardPad = isSquare ? 8 : 14;
    const qrCenterX = splitX + (rect.x + rect.w - splitX) / 2;
    const qrCenterY = rect.y + 24 + qrSize / 2;
    const drawW = qrSize * pulse;
    const drawH = qrSize * pulse;
    const drawX = qrCenterX - drawW / 2;
    const drawY = qrCenterY - drawH / 2;

    // White card behind QR — keeps it scannable on any primary bg.
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(
      ctx,
      drawX - qrCardPad,
      drawY - qrCardPad,
      drawW + qrCardPad * 2,
      drawH + qrCardPad * 2,
      isSquare ? 6 : 10
    );
    ctx.fill();
    ctx.drawImage(qrImage, drawX, drawY, drawW, drawH);

    // SCAN FOR DETAILS label below QR (accent — load-bearing for
    // the secondary brand color in this layout).
    const labelSize = isSquare ? 14 : 20;
    ctx.fillStyle = state.accent;
    ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    drawSpaced(
      ctx,
      "SCAN FOR DETAILS",
      qrCenterX,
      drawY + drawH + qrCardPad + labelSize + 8,
      isSquare ? 1.5 : 2.5
    );
  }

  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  layout: Layout
): void {
  const isSquare = layout.isSquare;
  // Footer always visible — no animation. Anchors the bottom of
  // the layout from t=0.
  ctx.fillStyle = state.primary;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const padX = layout.margin;
  const centerSize = isSquare ? 18 : 28;
  const licSize = isSquare ? 12 : 18;

  ctx.save();
  ctx.fillStyle = state.onPrimary;
  ctx.font = `bold ${centerSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (state.footerCenter) {
    ctx.fillText(
      state.footerCenter,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2
    );
  }
  if (state.licenseNumber) {
    ctx.font = `${licSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.globalAlpha = 0.85;
    ctx.fillText(
      `License #${state.licenseNumber.replace(/^#/, "")}`,
      rect.x + rect.w - padX,
      rect.y + rect.h - padX / 2
    );
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

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

/**
 * Draw text with manual letter-spacing. Canvas 2D doesn't support
 * letter-spacing natively. Used for headers and small all-caps
 * labels where the wide spacing is load-bearing for the design.
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
  // Snap textAlign to "left" so each character draws at the
  // computed x; we already positioned the start.
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}
