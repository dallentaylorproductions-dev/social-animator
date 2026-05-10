import { Timeline, type Track } from "@/engine/timeline";
import { linear } from "@/engine/easing";
import { drawImageContain } from "@/engine/draw";

/**
 * Open House Promo MP4 — animated flyer composition.
 *
 * H-7q rewrite: motion simplified to opening fade-in + Ken Burns
 * + final QR pulse only (the per-block staggered entrances added
 * in H-7k read as "busy" on smoke tests). Square layout
 * restructured as a clean 2-column content row (address/price
 * LEFT, QR RIGHT) instead of stacking everything — the prior
 * stacked layout produced "Olympia" ghosting where the city line
 * overlapped agent text. Header gets a top-anchored, safe-area-
 * respecting text layout so "OPEN HOUSE" never clips at the
 * canvas top edge.
 *
 * Composition (top → bottom) — adapts to aspect:
 *   Header bar    primary-bg, "OPEN HOUSE" + date + time
 *   Hero photo    photos[0] blur-fill (H-7o)
 *   Thumb strip   (reel only) photos[1..4] in a 4-column row
 *   Content row   reel: address/price stacked, then features,
 *                       then agent + QR (full-width sections)
 *                 square: address/price LEFT, QR RIGHT (2-col,
 *                       no features, no agent block)
 *   Footer bar    primary-bg, eventNotes / address echo + license
 *
 * Motion (simplified):
 *   0.00-0.40s  opening fade-in: full canvas opacity 0 → 1
 *   0.00-6.00s  hero Ken Burns scale 1.0 → 1.04 (linear)
 *   3.50-6.00s  QR sin-wave pulse 1.0 → 1.02 → 1.0 (2s period)
 *   All other elements: static, drawn at full opacity from t=0
 *   (after the global fade-in covers the first 400ms).
 */

export const PROMO_TOTAL_SEC = 6;

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
  isSquare: boolean;
  header: Rect;
  hero: Rect;
  thumbStrip: Rect | null;
  content: Rect;
  footer: Rect;
}

function computeLayout(size: { width: number; height: number }): Layout {
  const { width, height } = size;
  const isSquare = Math.abs(width - height) < 50;

  if (isSquare) {
    // 1:1 — header / hero / 2-col content / footer.
    const header = { x: 0, y: 0, w: width, h: 100 };
    const hero = { x: 0, y: header.h, w: width, h: 600 };
    const content = {
      x: 0,
      y: header.h + hero.h,
      w: width,
      h: 320,
    };
    const footer = { x: 0, y: height - 60, w: width, h: 60 };
    return {
      isSquare,
      header,
      hero,
      thumbStrip: null,
      content,
      footer,
    };
  }

  // 9:16 portrait. Vertical stack with thumb strip inside hero
  // section. Content row is the remaining vertical space; its
  // sub-blocks (property / features / agent+QR) lay out
  // top-to-bottom inside drawContentReel.
  const header = { x: 0, y: 0, w: width, h: 200 };
  const hero = { x: 0, y: header.h, w: width, h: 720 };
  const thumbStrip = {
    x: SAFE_X,
    y: header.h + hero.h,
    w: width - SAFE_X * 2,
    h: 160,
  };
  const content = {
    x: 0,
    y: thumbStrip.y + thumbStrip.h,
    w: width,
    h: height - 100 - (thumbStrip.y + thumbStrip.h),
  };
  const footer = { x: 0, y: height - 100, w: width, h: 100 };
  return {
    isSquare,
    header,
    hero,
    thumbStrip,
    content,
    footer,
  };
}

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
      // Page background — covers any gaps between blocks.
      ctx.fillStyle = state.background;
      ctx.fillRect(0, 0, size.width, size.height);

      // Global opening fade-in: 0 → 1 over first 400ms. Applies
      // to every block draw on top, so the entire frame fades
      // in as one unit. Replaces the per-block staggered
      // entrances from H-7k that read as busy on smoke tests.
      const openingFade = clamp01(t / 0.4);

      ctx.save();
      ctx.globalAlpha = openingFade;

      drawHeader(ctx, layout.header, state);
      drawHero(ctx, layout.hero, state, assets.hero, t);
      if (layout.thumbStrip && assets.thumbs.length > 0) {
        drawThumbStrip(ctx, layout.thumbStrip, assets.thumbs);
      }
      if (layout.isSquare) {
        drawContentSquare(ctx, layout.content, state, assets, t);
      } else {
        drawContentReel(ctx, layout.content, state, assets, t);
      }
      drawFooter(ctx, layout.footer, state);

      ctx.restore();

      if (DEBUG_SAFE_AREA) drawSafeAreaDebug(ctx, size);
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
  state: PromoMp4State
): void {
  ctx.fillStyle = state.primary;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const isSquare = rect.h < 150;
  const titleSize = isSquare ? 56 : 80;
  const dateSize = isSquare ? 22 : 30;
  const timeSize = isSquare ? 18 : 24;
  // Top inset inside the header band — relaxed from full SAFE_Y
  // since the band itself provides visual containment from the
  // canvas edge. This is the value that fixes the H-7q
  // "OPEN HOUSE" partial-clip bug from round 4: at H-7k the
  // headline was alphabetic-baseline-anchored and could push
  // its glyph top past y=0.
  const padTop = isSquare ? 14 : 22;

  const cx = rect.x + rect.w / 2;
  // Title: top-anchored. textBaseline "top" makes y the glyph
  // top, so the headline can never clip the canvas top regardless
  // of font metrics.
  ctx.save();
  ctx.fillStyle = state.onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `bold ${titleSize}px Helvetica, Arial, sans-serif`;
  drawSpaced(
    ctx,
    state.title.toUpperCase(),
    cx,
    rect.y + padTop,
    isSquare ? 4 : 8
  );

  let y = rect.y + padTop + titleSize + (isSquare ? 4 : 8);
  if (state.dateLabel) {
    ctx.font = `bold ${dateSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.dateLabel, cx, y);
    y += dateSize + 4;
  }
  if (state.timeLabel) {
    ctx.font = `${timeSize}px Helvetica, Arial, sans-serif`;
    ctx.globalAlpha *= 0.9;
    ctx.fillText(state.timeLabel, cx, y);
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
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = state.primary;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (!photoCanvas) {
    ctx.fillStyle = state.onPrimary;
    ctx.globalAlpha = 0.6;
    ctx.font = `bold ${Math.floor(rect.h * 0.14)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OPEN HOUSE", rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
    return;
  }

  // Ken Burns: scale 1.0 → 1.04 over 6s, linear. The pre-composed
  // photoCanvas is already blur-filled at the region's exact size,
  // so scaling it amplifies the foreground photo without revealing
  // any transparent edges.
  const burnP = clamp01(t / PROMO_TOTAL_SEC);
  const zoom = 1.0 + burnP * 0.04;
  const dw = rect.w * zoom;
  const dh = rect.h * zoom;
  const dx = rect.x + (rect.w - dw) / 2;
  const dy = rect.y + (rect.h - dh) / 2;
  ctx.drawImage(photoCanvas, dx, dy, dw, dh);
  ctx.restore();
}

function drawThumbStrip(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  thumbs: HTMLCanvasElement[]
): void {
  const padTop = 14;
  const cellH = rect.h - padTop;
  const gap = 12;
  const count = Math.min(4, thumbs.length);
  const cellW = (rect.w - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const cx = rect.x + i * (cellW + gap);
    const cy = rect.y + padTop;
    ctx.save();
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + cellW - r, cy);
    ctx.quadraticCurveTo(cx + cellW, cy, cx + cellW, cy + r);
    ctx.lineTo(cx + cellW, cy + cellH - r);
    ctx.quadraticCurveTo(cx + cellW, cy + cellH, cx + cellW - r, cy + cellH);
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

function drawContentReel(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  assets: PromoMp4Assets,
  t: number
): void {
  // Reel content: vertical stack — property block, features, then
  // agent + QR side-by-side at the bottom.
  const padX = SAFE_X;
  const padY = 24;
  let y = rect.y + padY;

  // PRESENTING + address + city + price
  const kickerSize = 24;
  const addressSize = 56;
  const citySize = 26;
  const priceSize = 76;

  ctx.save();
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${kickerSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  drawSpaced(ctx, "PRESENTING", padX, y, 3);
  y += kickerSize + 12;

  if (state.address) {
    ctx.fillStyle = state.textPrimary;
    ctx.font = `bold ${addressSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address, padX, y);
    y += addressSize + 4;
  }
  if (state.city) {
    ctx.fillStyle = state.textMuted;
    ctx.font = `${citySize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.city, padX, y);
    y += citySize + 8;
  }
  if (state.price) {
    ctx.fillStyle = state.primary;
    ctx.font = `bold ${priceSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.price, padX, y);
    y += priceSize + 18;
  }
  ctx.restore();

  // Features list (3 max) — primary bullets + textPrimary text.
  const highlights = state.highlights.slice(0, 3);
  if (highlights.length > 0) {
    const labelSize = 22;
    const bulletSize = 30;
    const bulletGap = 10;
    const bulletDotR = 7;

    ctx.save();
    ctx.fillStyle = state.primary;
    ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    drawSpaced(ctx, "FEATURES", padX, y, 3);
    y += labelSize + 14;

    ctx.font = `${bulletSize}px Helvetica, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    for (const h of highlights) {
      const lineY = y + bulletSize / 2;
      ctx.fillStyle = state.primary;
      ctx.beginPath();
      ctx.arc(padX + bulletDotR, lineY, bulletDotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = state.textPrimary;
      ctx.fillText(h, padX + bulletDotR * 2 + 18, lineY);
      y += bulletSize + bulletGap;
    }
    ctx.restore();
    y += 8;
  }

  // Agent block (left) + QR block (right) at the bottom of the
  // content row — anchor to rect bottom so any extra slack lands
  // above between features and agent rather than below.
  const bottomRowH = 200;
  const bottomY = rect.y + rect.h - bottomRowH;
  const splitX = rect.x + rect.w * 0.6;
  drawAgentBlock(
    ctx,
    {
      x: rect.x,
      y: bottomY,
      w: splitX - rect.x,
      h: bottomRowH,
    },
    state,
    assets.brandLogo,
    /* compact */ false
  );
  drawQrBlock(
    ctx,
    {
      x: splitX,
      y: bottomY,
      w: rect.x + rect.w - splitX,
      h: bottomRowH,
    },
    state,
    assets.qrImage,
    t,
    /* sizeMode */ "reel"
  );
}

function drawContentSquare(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  assets: PromoMp4Assets,
  t: number
): void {
  // Square content: 2-column row. LEFT is address/price stack,
  // RIGHT is QR + SCAN. No features list, no agent block — square
  // is too tight for that density (the round-4 "Olympia ghosting"
  // bug came from cramming agent text into the same vertical
  // space as the city line).
  const padX = SAFE_X;
  const padY = 16;
  const splitX = rect.x + rect.w * 0.55;

  // LEFT column: PRESENTING + address + city + price
  let y = rect.y + padY;
  const kickerSize = 18;
  const addressSize = 42;
  const citySize = 20;
  const priceSize = 50;

  ctx.save();
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${kickerSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  drawSpaced(ctx, "PRESENTING", padX, y, 2);
  y += kickerSize + 8;

  if (state.address) {
    ctx.fillStyle = state.textPrimary;
    ctx.font = `bold ${addressSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.address, padX, y);
    y += addressSize + 4;
  }
  if (state.city) {
    ctx.fillStyle = state.textMuted;
    ctx.font = `${citySize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.city, padX, y);
    y += citySize + 10;
  }
  if (state.price) {
    ctx.fillStyle = state.primary;
    ctx.font = `bold ${priceSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.price, padX, y);
  }
  ctx.restore();

  // RIGHT column: QR + SCAN FOR DETAILS
  drawQrBlock(
    ctx,
    {
      x: splitX,
      y: rect.y,
      w: rect.x + rect.w - splitX,
      h: rect.h,
    },
    state,
    assets.qrImage,
    t,
    /* sizeMode */ "square"
  );
}

function drawAgentBlock(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  brandLogo: HTMLImageElement | null,
  _compact: boolean
): void {
  const padX = SAFE_X;
  const logoSize = 70;
  const nameSize = 32;
  const brokerageSize = 22;
  const contactSize = 20;

  ctx.save();
  ctx.textBaseline = "top";

  // Logo (or fallback square)
  const logoY = rect.y;
  if (brandLogo) {
    drawImageContain(ctx, brandLogo, padX, logoY, logoSize, logoSize);
  } else {
    ctx.fillStyle = state.primary;
    ctx.fillRect(padX, logoY, logoSize, logoSize);
    ctx.fillStyle = state.onPrimary;
    ctx.font = `bold ${Math.floor(logoSize * 0.22)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOGO", padX + logoSize / 2, logoY + logoSize / 2);
    ctx.textBaseline = "top";
  }

  // Name + brokerage to the right of logo
  const nameX = padX + logoSize + 18;
  ctx.textAlign = "left";
  ctx.fillStyle = state.textPrimary;
  ctx.font = `bold ${nameSize}px Helvetica, Arial, sans-serif`;
  ctx.fillText(state.agentName || "Your name", nameX, logoY + 4);
  if (state.brokerage) {
    ctx.fillStyle = state.textMuted;
    ctx.font = `${brokerageSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(state.brokerage, nameX, logoY + 4 + nameSize + 4);
  }

  // Phone + email below the logo row
  let contactY = rect.y + logoSize + 18;
  ctx.fillStyle = state.textPrimary;
  ctx.font = `${contactSize}px Helvetica, Arial, sans-serif`;
  if (state.phone) {
    ctx.fillText(state.phone, padX, contactY);
    contactY += contactSize + 4;
  }
  if (state.email) {
    ctx.fillText(state.email, padX, contactY);
  }

  ctx.restore();
}

function drawQrBlock(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State,
  qrImage: HTMLImageElement | null,
  t: number,
  sizeMode: "reel" | "square"
): void {
  if (!qrImage) return;
  const qrSize = sizeMode === "square" ? 220 : 200;
  const cardPad = sizeMode === "square" ? 12 : 14;
  const labelSize = sizeMode === "square" ? 16 : 22;

  // QR pulse: sin-wave 1.0 → 1.02 → 1.0 over 2s, starting at 3.5s.
  // Subtle "tap me" cue without being distracting.
  const pulseT = Math.max(0, t - 3.5);
  const pulse = pulseT > 0 ? Math.sin((pulseT / 2) * Math.PI * 2) * 0.01 + 1.0 : 1.0;
  const drawW = qrSize * pulse;
  const drawH = qrSize * pulse;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 - labelSize;
  const drawX = cx - drawW / 2;
  const drawY = cy - drawH / 2;

  ctx.save();
  // White card behind QR
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(
    ctx,
    drawX - cardPad,
    drawY - cardPad,
    drawW + cardPad * 2,
    drawH + cardPad * 2,
    sizeMode === "square" ? 8 : 12
  );
  ctx.fill();
  ctx.drawImage(qrImage, drawX, drawY, drawW, drawH);

  // SCAN FOR DETAILS label below — accent color (load-bearing
  // for accent in the MP4 alongside PDF + preview).
  ctx.fillStyle = state.accent;
  ctx.font = `bold ${labelSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  drawSpaced(
    ctx,
    "SCAN FOR DETAILS",
    cx,
    drawY + drawH + cardPad + 12,
    sizeMode === "square" ? 1.5 : 2.5
  );
  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: PromoMp4State
): void {
  const isSquare = rect.h < 80;
  ctx.fillStyle = state.primary;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const padX = SAFE_X;
  const centerSize = isSquare ? 18 : 26;
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
      rect.y + rect.h - padX / 4
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
