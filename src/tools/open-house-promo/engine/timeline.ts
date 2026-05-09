import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack, linear } from "@/engine/easing";
import { drawImageCover, drawImageContain } from "@/engine/draw";

/**
 * Open House Promo — 6-second canvas-2D animation, aspect-aware
 * (1080×1920 reel + 1080×1080 square share the same composition,
 * with proportions and which-tracks-render adapting per aspect).
 *
 * Layout, both aspects: hero photo fills the top portion, brand-bg
 * fills the lower portion, and a vertically-stacked content block
 * sits on the brand-bg with centered text. Square trims highlights
 * since vertical budget is tighter; portrait keeps the full set.
 *
 * Animation:
 *   0.0–6.0  hero Ken Burns zoom 1.0 → 1.06 (linear, full duration)
 *   0.2–0.8  "OPEN HOUSE" title rises in (easeOutBack overshoot)
 *   0.6–1.1  event date rises in
 *   0.9–1.3  time range rises in
 *   1.6–2.1  address rises in
 *   2.1–2.5  listing price scales in with bounce
 *   2.6–4.0  highlights stagger (portrait only — 3 bullets, 0.25s offset)
 *   4.4–4.9  QR code scales in (easeOutBack)
 *   4.9–5.4  "Scan for details" label fades in
 *   5.4–6.0  static dwell
 */

export interface PromoTimelineState {
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
  /** Newline-separated highlights — only first 3 used in MP4. */
  highlights: string;
  qrLabel: string;
}

export interface PromoTimelineAssets {
  hero: HTMLImageElement | null;
  qrCode: HTMLImageElement | null;
  brandLogo: HTMLImageElement | null;
}

const DURATION = 6;

export function buildPromoTimeline(
  state: PromoTimelineState,
  size: { width: number; height: number },
  assets: PromoTimelineAssets
): Timeline {
  const { width, height } = size;
  const isSquare = Math.abs(width - height) < 50;

  // Hero region: top 50% on portrait, top 55% on square. Square gets
  // slightly more hero so the lower content block doesn't crowd.
  const heroH = Math.floor(height * (isSquare ? 0.5 : 0.5));
  const heroW = width;

  // Lower region: brand-bg with centered text stack.
  const lowerY = heroH;
  const lowerH = height - heroH;
  const lowerCenterX = width / 2;

  // Aspect-aware text sizing
  const titleSize = isSquare ? 60 : 76;
  const dateSize = isSquare ? 26 : 32;
  const timeSize = isSquare ? 22 : 28;
  const addressSize = isSquare ? 36 : 48;
  const citySize = isSquare ? 20 : 24;
  const priceSize = isSquare ? 44 : 60;
  const highlightSize = isSquare ? 22 : 28;
  const qrLabelSize = isSquare ? 16 : 20;

  // QR code dimension — scaled to aspect.
  const qrSize = isSquare ? 130 : 180;

  // Vertical positions inside the lower region. Anchor titleY a bit
  // below the hero/lower border, then stack down.
  const padTop = isSquare ? 30 : 50;
  const titleY = lowerY + padTop + titleSize * 0.7;
  const dateY = titleY + titleSize * 0.6 + 10;
  const timeY = dateY + dateSize + 4;
  const addressY = timeY + timeSize + (isSquare ? 18 : 32);
  const cityY = addressY + addressSize * 0.55 + 6;
  const priceY = cityY + citySize + (isSquare ? 16 : 26);

  // Highlights only render on portrait — square is too tight.
  const showHighlights = !isSquare;
  const highlightStartY = priceY + priceSize * 0.55 + 22;
  const highlightLineH = highlightSize + 12;

  // QR code position. Portrait: centered below highlights. Square:
  // centered below price (skipping highlights).
  const qrCenterY = isSquare
    ? priceY + priceSize * 0.55 + 30 + qrSize / 2
    : highlightStartY + 3 * highlightLineH + 26 + qrSize / 2;
  const qrLabelY = qrCenterY + qrSize / 2 + qrLabelSize * 0.8 + 8;

  const tracks: Track[] = [];

  // ── 1. Hero with Ken Burns ─────────────────────────────────────
  tracks.push({
    id: "hero",
    start: 0,
    duration: DURATION,
    easing: linear,
    onUpdate: (p, ctx) => {
      // Background fill for the hero region (visible while image
      // is null or while the Ken Burns zoom exposes edges).
      ctx.fillStyle = state.accent || "#1f2937";
      ctx.fillRect(0, 0, heroW, heroH);
      if (assets.hero) {
        const zoom = 1 + p * 0.06;
        const zw = heroW * zoom;
        const zh = heroH * zoom;
        const zx = (heroW - zw) / 2;
        const zy = (heroH - zh) / 2;
        drawImageCover(ctx, assets.hero, zx, zy, zw, zh);
      } else {
        // No hero — render a stenciled "OPEN HOUSE" centered in the
        // hero region as a fallback.
        ctx.fillStyle = state.primary;
        ctx.globalAlpha = 0.6;
        ctx.font = `bold ${Math.floor(heroH * 0.12)}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("OPEN HOUSE", heroW / 2, heroH / 2);
        ctx.globalAlpha = 1;
      }
    },
  });

  // Lower-region brand-bg fill. Always present; runs at 0 opacity-
  // change for full duration so the stack draws on top.
  tracks.push({
    id: "lowerBg",
    start: 0,
    duration: DURATION,
    easing: linear,
    onUpdate: (_p, ctx) => {
      ctx.fillStyle = state.background;
      ctx.fillRect(0, lowerY, width, lowerH);
    },
  });

  // ── 2. "OPEN HOUSE" title ──────────────────────────────────────
  tracks.push({
    id: "title",
    start: 0.2,
    duration: 0.6,
    easing: easeOutBack,
    onUpdate: (p, ctx) => {
      const yOff = (1 - p) * 24;
      ctx.globalAlpha = Math.min(1, p * 1.6);
      ctx.fillStyle = state.primary;
      ctx.font = `bold ${titleSize}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      // letter-spacing on canvas is approximated by drawing each
      // character at a calculated x offset. For a single header
      // string at large size this read clean enough.
      drawSpaced(
        ctx,
        state.title.toUpperCase(),
        lowerCenterX,
        titleY + yOff,
        4
      );
      ctx.globalAlpha = 1;
    },
  });

  // ── 3. Event date ──────────────────────────────────────────────
  if (state.dateLabel) {
    tracks.push({
      id: "date",
      start: 0.6,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        const yOff = (1 - p) * 18;
        ctx.globalAlpha = p;
        ctx.fillStyle = state.textPrimary;
        ctx.font = `bold ${dateSize}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(state.dateLabel, lowerCenterX, dateY + yOff);
        ctx.globalAlpha = 1;
      },
    });
  }

  // ── 4. Time range ──────────────────────────────────────────────
  if (state.timeLabel) {
    tracks.push({
      id: "time",
      start: 0.9,
      duration: 0.4,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        const yOff = (1 - p) * 14;
        ctx.globalAlpha = p;
        ctx.fillStyle = state.textMuted;
        ctx.font = `${timeSize}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(state.timeLabel, lowerCenterX, timeY + yOff);
        ctx.globalAlpha = 1;
      },
    });
  }

  // ── 5. Address ──────────────────────────────────────────────
  if (state.address) {
    tracks.push({
      id: "address",
      start: 1.6,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        const yOff = (1 - p) * 18;
        ctx.globalAlpha = p;
        ctx.fillStyle = state.textPrimary;
        ctx.font = `bold ${addressSize}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(state.address, lowerCenterX, addressY + yOff);
        if (state.city) {
          ctx.font = `${citySize}px Helvetica, Arial, sans-serif`;
          ctx.fillStyle = state.textMuted;
          ctx.fillText(state.city, lowerCenterX, cityY + yOff);
        }
        ctx.globalAlpha = 1;
      },
    });
  }

  // ── 6. Price ──────────────────────────────────────────────
  if (state.price) {
    tracks.push({
      id: "price",
      start: 2.1,
      duration: 0.4,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const scale = 0.7 + p * 0.3;
        ctx.globalAlpha = Math.min(1, p * 1.4);
        ctx.save();
        ctx.translate(lowerCenterX, priceY);
        ctx.scale(scale, scale);
        ctx.fillStyle = state.primary;
        ctx.font = `bold ${priceSize}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(state.price, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      },
    });
  }

  // ── 7. Highlights stagger (portrait only) ─────────────────
  if (showHighlights) {
    const highlightLines = state.highlights
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    highlightLines.forEach((line, i) => {
      const offsetStart = 2.6 + i * 0.25;
      const lineY = highlightStartY + i * highlightLineH;
      tracks.push({
        id: `highlight-${i}`,
        start: offsetStart,
        duration: 0.4,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          const xOff = (1 - p) * 24;
          ctx.globalAlpha = p;
          // Bullet dot
          const dotR = highlightSize * 0.18;
          ctx.fillStyle = state.primary;
          ctx.beginPath();
          ctx.arc(
            lowerCenterX - 200 - xOff,
            lineY - highlightSize * 0.35,
            dotR,
            0,
            Math.PI * 2
          );
          ctx.fill();
          // Label
          ctx.fillStyle = state.textPrimary;
          ctx.font = `${highlightSize}px Helvetica, Arial, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(line, lowerCenterX - 180 - xOff, lineY);
          ctx.globalAlpha = 1;
        },
      });
    });
  }

  // ── 8. QR code ─────────────────────────────────────────────
  if (assets.qrCode) {
    tracks.push({
      id: "qr",
      start: 4.4,
      duration: 0.5,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const scale = 0.5 + p * 0.5;
        ctx.globalAlpha = Math.min(1, p * 1.5);
        const drawW = qrSize * scale;
        const drawH = qrSize * scale;
        const drawX = lowerCenterX - drawW / 2;
        const drawY = qrCenterY - drawH / 2;
        // White card behind QR for crisp edges on dark bg
        const pad = 12 * scale;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(drawX - pad, drawY - pad, drawW + pad * 2, drawH + pad * 2);
        drawImageContain(ctx, assets.qrCode!, drawX, drawY, drawW, drawH);
        ctx.globalAlpha = 1;
      },
    });
  }

  // ── 9. "Scan for details" label ───────────────────────────
  if (assets.qrCode && state.qrLabel) {
    tracks.push({
      id: "qrLabel",
      start: 4.9,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.fillStyle = state.primary;
        ctx.font = `bold ${qrLabelSize}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        drawSpaced(
          ctx,
          state.qrLabel.toUpperCase(),
          lowerCenterX,
          qrLabelY,
          2
        );
        ctx.globalAlpha = 1;
      },
    });
  }

  // ── 10. Brand logo (top-left of hero, faded) ──────────────
  if (assets.brandLogo) {
    tracks.push({
      id: "logo",
      start: 0,
      duration: DURATION,
      easing: linear,
      onUpdate: (_p, ctx) => {
        const logoSize = isSquare ? 48 : 64;
        const logoX = isSquare ? 30 : 50;
        const logoY = isSquare ? 30 : 50;
        ctx.globalAlpha = 0.95;
        drawImageContain(ctx, assets.brandLogo!, logoX, logoY, logoSize, logoSize);
        ctx.globalAlpha = 1;
      },
    });
  }

  return new Timeline(tracks);
}

/**
 * Draw text with letter-spacing. Canvas 2D doesn't support
 * letter-spacing natively, so we walk the string character by
 * character and offset each by the measured width plus the
 * requested spacing. Used for the "OPEN HOUSE" title and
 * "Scan for details" label where the wide letter-spacing is
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

