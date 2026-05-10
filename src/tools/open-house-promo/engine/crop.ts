/**
 * Focal-point cropping helpers shared across the open-house-promo's
 * PDF, JPEG (via the PDF rasterization path), and MP4 outputs.
 *
 * Concept: each photo carries a focalX/focalY pair (0-100, percent
 * of source dimensions) representing the point the user wants the
 * crop to center on. The PDF renders pre-cropped data URLs (since
 * react-pdf doesn't support object-position) and the MP4 renders
 * pre-cropped HTMLCanvasElements (so Ken Burns can scale/translate
 * the static crop without changing what's framed). The HTML preview
 * uses the same focal-point values as a CSS object-position string.
 */

export interface FocalPoint {
  /** 0-100 — percent of source width. 50 = horizontal center. */
  focalX: number;
  /** 0-100 — percent of source height. 50 = vertical center. */
  focalY: number;
}

export const DEFAULT_FOCAL_X = 50;
/** Real-estate exteriors typically have the house sitting below
 *  center with sky above — a slight downward bias keeps the house
 *  framed when the source is portrait. */
export const DEFAULT_FOCAL_Y = 60;

/**
 * Compute the source rectangle (sx/sy/sw/sh suitable for
 * ctx.drawImage) that fills `targetAspect`, centered on the
 * focal point, clipping at source edges so we don't read outside
 * the image bounds.
 */
export function computeCropRect(
  sourceW: number,
  sourceH: number,
  targetAspect: number,
  focalX: number,
  focalY: number
): { sx: number; sy: number; sw: number; sh: number } {
  if (sourceW <= 0 || sourceH <= 0) {
    return { sx: 0, sy: 0, sw: sourceW, sh: sourceH };
  }
  const sourceAspect = sourceW / sourceH;
  let cropW: number;
  let cropH: number;
  if (sourceAspect > targetAspect) {
    // Source wider than target — clip horizontally.
    cropH = sourceH;
    cropW = sourceH * targetAspect;
  } else {
    // Source taller than target — clip vertically.
    cropW = sourceW;
    cropH = sourceW / targetAspect;
  }
  const fx = clamp01(focalX / 100);
  const fy = clamp01(focalY / 100);
  // Center the crop on the focal point, then clamp so the crop
  // window stays inside the source.
  let sx = sourceW * fx - cropW / 2;
  let sy = sourceH * fy - cropH / 2;
  sx = Math.max(0, Math.min(sourceW - cropW, sx));
  sy = Math.max(0, Math.min(sourceH - cropH, sy));
  return { sx, sy, sw: cropW, sh: cropH };
}

/**
 * CONTAIN-fit a source image into a (boxW × boxH) canvas. Maintains
 * the image's aspect ratio without cropping; fills any unused
 * space (letterbox top/bottom OR pillarbox left/right) with
 * `fillColor` so there are no transparent gaps. The full image is
 * always visible — focal point isn't applicable to contain (the
 * whole image shows), so callers don't need to pass focal coords.
 *
 * Used for the open-house-promo hero photo to guarantee the entire
 * house is visible in PDF + MP4 even when the source aspect
 * doesn't match the hero region's aspect — the previous COVER mode
 * was clipping foundations / roofs depending on source orientation.
 */
export function containInBox(
  image: HTMLImageElement,
  boxW: number,
  boxH: number,
  fillColor: string
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(boxW));
  canvas.height = Math.max(1, Math.round(boxH));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  // Fill the entire box first — anything not covered by the image
  // becomes a clean letterbox/pillarbox bar at the brand color.
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return canvas;
  const imageAspect = image.naturalWidth / image.naturalHeight;
  const boxAspect = canvas.width / canvas.height;
  let drawW: number;
  let drawH: number;
  if (imageAspect > boxAspect) {
    // Image wider than box — fit width, letterbox top/bottom.
    drawW = canvas.width;
    drawH = canvas.width / imageAspect;
  } else {
    // Image taller than (or equal to) box — fit height, pillarbox
    // left/right.
    drawH = canvas.height;
    drawW = canvas.height * imageAspect;
  }
  const drawX = (canvas.width - drawW) / 2;
  const drawY = (canvas.height - drawH) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
  return canvas;
}

/**
 * Compose a blur-fill hero photo: a blurred + zoomed copy of the
 * source as the background layer, with the original photo
 * contain-fit on top. Replaces solid brand-color letterbox /
 * pillarbox bars (which read as cheap-template when the source
 * aspect is far from the box aspect). The blurred layer always
 * comes from the same photo, so the box looks intentional even
 * when the foreground is a vertical phone shot in a horizontal
 * box: the surroundings dissolve into a soft, on-brand context
 * for the photo itself.
 *
 * When the source aspect matches the box aspect closely, the
 * foreground covers the entire blurred layer and the blur becomes
 * invisible — desirable behavior for "natural" 3:2 real-estate
 * photos that fit edge-to-edge.
 *
 * Implementation:
 *   Pass 1: ctx.filter = blur(N) → draw image cover-fit (with
 *           an extra +10% zoom so the blur's soft edges never
 *           reveal canvas background). Optional darken overlay
 *           on top of the blur to make the foreground photo
 *           pop against a busy background.
 *   Pass 2: ctx.filter = none → draw image contain-fit centered.
 *
 * Canvas's ctx.filter property is supported in all evergreen
 * browsers (and the Node.js polyfill react-pdf uses internally
 * via skia-canvas if applicable). If a renderer ignores the
 * filter, the blur layer renders unblurred — visually still a
 * cover-fit of the same photo behind a contain-fit, which reads
 * fine.
 */
export function blurFillCompose(
  image: HTMLImageElement,
  boxW: number,
  boxH: number,
  options?: {
    /** Gaussian blur radius in px. Higher = softer, busier
     *  source photos benefit from higher values. */
    blur?: number;
    /** Darken overlay alpha (0-1) painted between the blurred
     *  background and the foreground photo. 0 = no overlay. */
    darken?: number;
    /** Cap on the blurred-background zoom factor. Prevents
     *  amplifying compression artifacts when the source photo
     *  is much smaller than the target box. */
    maxScale?: number;
  }
): HTMLCanvasElement {
  const blur = options?.blur ?? 28;
  const darken = options?.darken ?? 0.18;
  const maxScale = options?.maxScale ?? 1.6;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(boxW));
  canvas.height = Math.max(1, Math.round(boxH));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ── Pass 1: blurred zoomed background ──────────────────────
  // Cover-fit fills the box, capped by maxScale to avoid extreme
  // upscale artifacts. +10% extra zoom so the blur's softened
  // edges don't expose the canvas's transparent default behind
  // the box (the blur effect feathers ~blur radius outward).
  const coverScale = Math.max(
    canvas.width / image.naturalWidth,
    canvas.height / image.naturalHeight
  );
  const bgScale = Math.min(coverScale, maxScale) * 1.1;
  const bgW = image.naturalWidth * bgScale;
  const bgH = image.naturalHeight * bgScale;
  const bgX = (canvas.width - bgW) / 2;
  const bgY = (canvas.height - bgH) / 2;

  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(image, bgX, bgY, bgW, bgH);
  ctx.filter = "none";
  ctx.restore();

  if (darken > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${darken})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // ── Pass 2: foreground photo (contain-fit) ─────────────────
  const containScale = Math.min(
    canvas.width / image.naturalWidth,
    canvas.height / image.naturalHeight
  );
  const fgW = image.naturalWidth * containScale;
  const fgH = image.naturalHeight * containScale;
  const fgX = (canvas.width - fgW) / 2;
  const fgY = (canvas.height - fgH) / 2;
  ctx.drawImage(image, fgX, fgY, fgW, fgH);

  return canvas;
}

/**
 * Pre-crop a source image to exact target dimensions, centered on
 * the focal point. Returns an offscreen HTMLCanvasElement suitable
 * for canvas drawImage (MP4 path) or canvas.toDataURL (PDF path).
 */
export function cropToCanvas(
  image: HTMLImageElement,
  targetW: number,
  targetH: number,
  focalX: number,
  focalY: number
): HTMLCanvasElement {
  const targetAspect = targetW / targetH;
  const { sx, sy, sw, sh } = computeCropRect(
    image.naturalWidth,
    image.naturalHeight,
    targetAspect,
    focalX,
    focalY
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetW));
  canvas.height = Math.max(1, Math.round(targetH));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Convert focal-point values to a CSS object-position string
 * (e.g., "50% 60%") for use on HTMLImageElement in the live
 * preview. The browser handles the cropping natively.
 */
export function computeObjectPosition(focalX: number, focalY: number): string {
  return `${clamp01(focalX / 100) * 100}% ${clamp01(focalY / 100) * 100}%`;
}

/**
 * Decode a data URL (or any image src) into a fully-loaded
 * HTMLImageElement. Resolves once paint-ready. Used by the export
 * paths that need to materialize stored data URLs into images for
 * canvas operations.
 */
export function srcToImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image src"));
    img.src = src;
  });
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
