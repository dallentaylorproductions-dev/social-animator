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

/**
 * Draw an image to fill (cover) a rectangular box, like CSS object-fit: cover.
 * Crops excess to maintain aspect ratio. Optional rounded corners via clip path.
 * Safe to call with not-yet-loaded images — bails out silently.
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

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;

  let drawW: number;
  let drawH: number;
  let drawX: number;
  let drawY: number;

  if (imgRatio > boxRatio) {
    drawH = h;
    drawW = h * imgRatio;
    drawX = x - (drawW - w) / 2;
    drawY = y;
  } else {
    drawW = w;
    drawH = w / imgRatio;
    drawX = x;
    drawY = y - (drawH - h) / 2;
  }

  ctx.save();
  ctx.beginPath();
  if (cornerRadius > 0) {
    ctx.roundRect(x, y, w, h, cornerRadius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}
