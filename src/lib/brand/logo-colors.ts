/* ============================================================================
 * logo-colors.ts — "Suggested from your logo" extraction (Brand kit v3, Item 2)
 * ----------------------------------------------------------------------------
 * EXTRACTION, never AI. Decodes the agent's Profile logo on a canvas, quantizes
 * the opaque pixels, and returns up to THREE dominant brand colors for the
 * "Suggested from your logo" row. Pure client-side (needs a DOM canvas).
 *
 * The logo is a `data:` URL stored in BrandSettings.logoDataUrl — same-origin,
 * so `getImageData` never taints the canvas (no CORS). On ANY failure (no DOM,
 * decode error, tainted read, or zero usable colors) it resolves to [] and the
 * caller renders the visible-but-empty state — we NEVER fabricate swatches.
 *
 * Guardrails (docs/design/brand-kit-v3/ENGINEERING_NOTES.md §1):
 *   - drop near-transparent pixels (alpha < 24/255)
 *   - exclude pure black/white (OKLCh L ≤ 0.12 or ≥ 0.93)
 *   - exclude grays/near-neutral (OKLCh C < 0.04)
 *   - drop tiny-accent bins (< 3% of sampled opaque pixels)
 *   - merge near-duplicates (ΔL < 0.05 AND ΔH < 8°), keeping the larger share
 *   - cap 3, ordered by pixel share (most dominant first)
 * ========================================================================== */

import { BrandEngine } from "./color-engine";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface Candidate {
  hex: string;
  L: number;
  C: number;
  H: number;
  share: number;
}

export async function extractLogoColors(src: string | null | undefined): Promise<string[]> {
  if (typeof document === "undefined" || !src) return [];

  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(src);
  } catch {
    return [];
  }
  if (!img || !img.width || !img.height) return [];

  const N = 64; // downsample target — color sampling tolerates the squash
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, N, N);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, N, N).data;
  } catch {
    return []; // tainted canvas — never guess
  }

  // quantize opaque pixels into coarse RGB bins (~6 levels/channel)
  const q = (v: number) => Math.min(255, Math.round(v / 48) * 48);
  const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) continue; // near-transparent → skip
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    total++;
    const key = (q(r) << 16) | (q(g) << 8) | q(b);
    const e = bins.get(key);
    if (e) {
      e.r += r;
      e.g += g;
      e.b += b;
      e.n++;
    } else {
      bins.set(key, { r, g, b, n: 1 });
    }
  }
  if (total === 0) return [];

  const candidates: Candidate[] = [];
  for (const e of bins.values()) {
    const share = e.n / total;
    if (share < 0.03) continue; // tiny-accent flourish
    const r = Math.round(e.r / e.n),
      g = Math.round(e.g / e.n),
      b = Math.round(e.b / e.n);
    const hex = BrandEngine.rgbToHex(r, g, b);
    const { L, C, h } = BrandEngine.rgbToOklch(hex);
    if (L <= 0.12 || L >= 0.93) continue; // pure black / white
    if (C < 0.04) continue; // gray / near-neutral
    candidates.push({ hex, L, C, H: h, share });
  }

  candidates.sort((a, b) => b.share - a.share);

  const kept: Candidate[] = [];
  for (const c of candidates) {
    const dup = kept.some(
      (k) => Math.abs(k.L - c.L) < 0.05 && hueDist(k.H, c.H) < 8,
    );
    if (!dup) kept.push(c);
    if (kept.length >= 3) break;
  }

  return kept.map((c) => BrandEngine.normHex(c.hex)).filter((h): h is string => !!h);
}
