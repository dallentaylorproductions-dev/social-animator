/**
 * Canvas drawing helpers shared across templates.
 */

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
  return lines.length;
}

// Per-image cache: (HTMLImageElement) → Map<dimension-key, offscreen canvas>
// WeakMap auto-cleans when the source image is garbage collected.
const _imageCoverCache = new WeakMap<
  HTMLImageElement,
  Map<string, HTMLCanvasElement>
>();

/**
 * Draw an image to fill (cover) a rectangular box, like CSS object-fit: cover.
 * Crops excess to maintain aspect ratio. Optional rounded corners via clip path.
 *
 * The cropped + rounded result is cached on an offscreen canvas keyed by image
 * + dimensions + radius, so subsequent frames only do a fast canvas-to-canvas
 * blit instead of a full image resample. Critical for hitting 30fps when the
 * source image is high-resolution.
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadius = 0
): void {
  if (!img.complete || img.naturalWidth === 0) return;

  const intW = Math.round(w);
  const intH = Math.round(h);
  const cacheKey = `${intW}x${intH}_r${Math.round(cornerRadius)}`;

  let perImageCache = _imageCoverCache.get(img);
  if (!perImageCache) {
    perImageCache = new Map();
    _imageCoverCache.set(img, perImageCache);
  }

  let cached = perImageCache.get(cacheKey);
  if (!cached) {
    // Render the cover-fit + rounded-clip image once, into an offscreen canvas
    cached = document.createElement("canvas");
    cached.width = intW;
    cached.height = intH;
    const cctx = cached.getContext("2d");
    if (!cctx) return;

    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = w / h;

    let drawW: number;
    let drawH: number;
    let drawX: number;
    let drawY: number;

    if (imgRatio > boxRatio) {
      drawH = h;
      drawW = h * imgRatio;
      drawX = -(drawW - w) / 2;
      drawY = 0;
    } else {
      drawW = w;
      drawH = w / imgRatio;
      drawX = 0;
      drawY = -(drawH - h) / 2;
    }

    if (cornerRadius > 0) {
      cctx.beginPath();
      cctx.roundRect(0, 0, w, h, cornerRadius);
      cctx.clip();
    }
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(img, drawX, drawY, drawW, drawH);

    perImageCache.set(cacheKey, cached);
  }

  // Fast path on subsequent frames: blit the pre-rendered canvas
  ctx.drawImage(cached, x, y);
}
