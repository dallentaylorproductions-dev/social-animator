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

// Quality knobs for offscreen image caches. Photos are baked into a cache canvas
// at SUPERSAMPLE×target dims so the browser has extra resolution to downsample
// from when blitting to the main canvas — visibly crisper than rendering at
// target dims and stretching to display size.
//
// Cap at MAX_OFFSCREEN_EDGE px on the longest side so a 4×3 phone shot doesn't
// allocate a 8000×6000 cache. Cap at the source image's natural dimensions so
// we never sample beyond what's actually there. If SUPERSAMPLE feels heavy on
// low-end mobile, dial down to ~1.75 — animation framerate is the canary.
const SUPERSAMPLE = 2;
const MAX_OFFSCREEN_EDGE = 2000;

/**
 * Pick the largest scale factor (≤ SUPERSAMPLE) that satisfies all caps:
 *  - source resolution (don't oversample beyond the source image)
 *  - MAX_OFFSCREEN_EDGE (don't allocate a giant cache)
 *
 * Returns 0 if either target dimension is non-positive.
 */
function pickSupersample(
  intW: number,
  intH: number,
  naturalW: number,
  naturalH: number
): number {
  if (intW <= 0 || intH <= 0) return 0;
  const idealW = intW * SUPERSAMPLE;
  const idealH = intH * SUPERSAMPLE;
  const sourceLimitW = naturalW / idealW;
  const sourceLimitH = naturalH / idealH;
  const edgeLimit = MAX_OFFSCREEN_EDGE / Math.max(idealW, idealH);
  // Math.min(1, ...): never *exceed* SUPERSAMPLE; the caps can shrink, not grow.
  const scaleFromCaps = Math.min(1, sourceLimitW, sourceLimitH, edgeLimit);
  return SUPERSAMPLE * scaleFromCaps;
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
 *
 * The offscreen canvas is sized at SUPERSAMPLE×target dims (capped — see
 * pickSupersample), giving the browser high-res pixels to downsample from when
 * blitting to the visible canvas.
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
  if (intW <= 0 || intH <= 0) return;

  // Cache key uses target dims only — supersample factor is internal.
  const cacheKey = `${intW}x${intH}_r${Math.round(cornerRadius)}`;

  let perImageCache = _imageCoverCache.get(img);
  if (!perImageCache) {
    perImageCache = new Map();
    _imageCoverCache.set(img, perImageCache);
  }

  let cached = perImageCache.get(cacheKey);
  if (!cached) {
    const supersample = pickSupersample(
      intW,
      intH,
      img.naturalWidth,
      img.naturalHeight
    );
    const cacheW = Math.max(1, Math.round(intW * supersample));
    const cacheH = Math.max(1, Math.round(intH * supersample));
    // Same scale on both axes since pickSupersample preserves target aspect.
    const supersampleRatio = cacheW / intW;

    cached = document.createElement("canvas");
    cached.width = cacheW;
    cached.height = cacheH;
    const cctx = cached.getContext("2d");
    if (!cctx) return;

    // Cover-crop math, scaled to the supersampled offscreen size
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = cacheW / cacheH;

    let drawW: number;
    let drawH: number;
    let drawX: number;
    let drawY: number;

    if (imgRatio > boxRatio) {
      drawH = cacheH;
      drawW = cacheH * imgRatio;
      drawX = -(drawW - cacheW) / 2;
      drawY = 0;
    } else {
      drawW = cacheW;
      drawH = cacheW / imgRatio;
      drawX = 0;
      drawY = -(drawH - cacheH) / 2;
    }

    if (cornerRadius > 0) {
      // Multiply radius by supersample ratio so corners stay proportional.
      cctx.beginPath();
      cctx.roundRect(0, 0, cacheW, cacheH, cornerRadius * supersampleRatio);
      cctx.clip();
    }
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(img, drawX, drawY, drawW, drawH);

    perImageCache.set(cacheKey, cached);
  }

  // Explicit dest dims so the browser downsamples from the supersampled cache.
  // Quality of this downsample relies on imageSmoothing settings on `ctx`,
  // which Canvas.tsx sets once at context creation.
  ctx.drawImage(cached, x, y, intW, intH);
}

// Same cache pattern for contain-fit images (logos). Separate WeakMap so cover
// vs contain at the same dimensions don't collide.
const _imageContainCache = new WeakMap<
  HTMLImageElement,
  Map<string, HTMLCanvasElement>
>();

/**
 * Draw an image to fit (contain) within a rectangular box, like CSS
 * object-fit: contain. Preserves the image's aspect ratio without cropping —
 * letterboxes (transparent) if image and box ratios differ. Use this for
 * logos and other images where cropping would damage meaning (e.g. cutting
 * off letters in a wordmark).
 *
 * Cached + supersampled like drawImageCover, since the brand-watermark logo
 * is rendered every frame.
 */
export function drawImageContain(
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
  if (intW <= 0 || intH <= 0) return;

  const cacheKey = `${intW}x${intH}_r${Math.round(cornerRadius)}`;

  let perImageCache = _imageContainCache.get(img);
  if (!perImageCache) {
    perImageCache = new Map();
    _imageContainCache.set(img, perImageCache);
  }

  let cached = perImageCache.get(cacheKey);
  if (!cached) {
    const supersample = pickSupersample(
      intW,
      intH,
      img.naturalWidth,
      img.naturalHeight
    );
    const cacheW = Math.max(1, Math.round(intW * supersample));
    const cacheH = Math.max(1, Math.round(intH * supersample));
    const supersampleRatio = cacheW / intW;

    cached = document.createElement("canvas");
    cached.width = cacheW;
    cached.height = cacheH;
    const cctx = cached.getContext("2d");
    if (!cctx) return;

    // Contain-fit math: image fits inside the cache canvas, transparent
    // letterbox padding fills the remainder.
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = cacheW / cacheH;

    let drawW: number;
    let drawH: number;
    let drawX: number;
    let drawY: number;

    if (imgRatio > boxRatio) {
      // Image wider than box — fit width, center vertically
      drawW = cacheW;
      drawH = cacheW / imgRatio;
      drawX = 0;
      drawY = (cacheH - drawH) / 2;
    } else {
      // Image taller than box — fit height, center horizontally
      drawH = cacheH;
      drawW = cacheH * imgRatio;
      drawX = (cacheW - drawW) / 2;
      drawY = 0;
    }

    if (cornerRadius > 0) {
      cctx.beginPath();
      cctx.roundRect(0, 0, cacheW, cacheH, cornerRadius * supersampleRatio);
      cctx.clip();
    }
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(img, drawX, drawY, drawW, drawH);

    perImageCache.set(cacheKey, cached);
  }

  ctx.drawImage(cached, x, y, intW, intH);
}
