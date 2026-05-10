"use client";

import { useEffect, useState } from "react";
import { drawImageContain } from "@/engine/draw";

export interface BrandSettings {
  logoDataUrl: string | null;
  agentName: string;
  primaryColor: string;
  accentColor: string;
  /**
   * Page/output background color. Reserved for tools that render their own
   * artifact (e.g. Listing Flyer PDF). Brand-profile UI does not currently
   * expose this — empty string means "use the tool's safe default".
   */
  backgroundColor: string;
  contactEmail: string;
  contactPhone: string;
  licenseNumber: string;
  brokerage: string;
}

// Storage key kept as `socanim_*` for backwards compatibility with users who
// already have brand settings saved from before the Studio refactor.
const STORAGE_KEY = "socanim_brand_settings";

const DEFAULT_BRAND: BrandSettings = {
  logoDataUrl: null,
  agentName: "",
  primaryColor: "#4ef2d9",
  accentColor: "#ffffff",
  backgroundColor: "",
  contactEmail: "",
  contactPhone: "",
  licenseNumber: "",
  brokerage: "",
};

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/**
 * Derive a sensible default accent color from the user's primary
 * brand color: same hue + saturation, lightness reduced by 20
 * percentage points. Produces a darker companion shade that pairs
 * with primary — e.g. mint #4ef2d9 → #1ec9b3 (darker mint),
 * coral #f97056 → #f33d18 (darker coral). Used by tools that want
 * an "accent" role distinct from primary when the user hasn't
 * explicitly picked one (the BrandSettings legacy default of
 * #ffffff produces poor results against most page backgrounds).
 *
 * Returns the primary input unchanged if the hex string is
 * malformed (rather than throwing — auto-derivation is a quality-
 * of-life feature, not load-bearing).
 */
export function deriveAccentFromPrimary(primaryHex: string): string {
  const h = primaryHex.replace("#", "").trim();
  const expanded =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (expanded.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return primaryHex;
  }
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  // Reduce lightness by 20 percentage points (clamped to ≥0.05 so
  // the result never collapses to pure black, which would be
  // useless against any page bg).
  const newL = Math.max(0.05, l - 0.2);
  return hslToHex(hue, sat, newL);
}

function hslToHex(h: number, s: number, l: number): string {
  const hueToRgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Resolve the effective accent color for a tool that wants the
 * auto-derive-when-unset behavior. Treats the empty string AND
 * the legacy BrandSettings default of "#ffffff" as "unset" and
 * derives a darker shade from primary instead. A user who really
 * wants white can pick "#fefefe" or any other near-white hex to
 * escape the auto-derivation.
 */
export function effectiveBrandAccent(brand: BrandSettings): string {
  const raw = brand.accentColor.trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "#ffffff" || lower === "#fff") {
    return deriveAccentFromPrimary(brand.primaryColor || "#4ef2d9");
  }
  return raw;
}

/**
 * Strip everything except digits, cap at 10 (US phone numbers). iOS phone
 * keypad lets `# * +` through type="tel" inputs — strip those out so they
 * never reach storage. Pasted formatted numbers ("253-202-8825") become
 * raw digits ready to re-format.
 */
export function extractPhoneDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

/**
 * Format raw digits as "(xxx) xxx-xxxx", accepting any input form (already
 * formatted, partial, or raw digits) by extracting digits first. Idempotent
 * — pass formatted output back in and you get the same formatted output.
 * Empty input returns empty string (don't render "(   )    -    " for blanks).
 */
export function formatPhone(input: string): string {
  const digits = extractPhoneDigits(input);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function loadBrandSettings(): BrandSettings {
  if (typeof window === "undefined") return DEFAULT_BRAND;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRAND;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      logoDataUrl:
        typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl : null,
      agentName: str(parsed.agentName),
      primaryColor: str(parsed.primaryColor, DEFAULT_BRAND.primaryColor),
      accentColor: str(parsed.accentColor, DEFAULT_BRAND.accentColor),
      backgroundColor: str(parsed.backgroundColor),
      contactEmail: str(parsed.contactEmail),
      // Normalize on load: drafts saved before H-1.7 stored "(253) 202-8825";
      // strip to raw digits so the input mask + downstream renders are
      // consistent. Idempotent for fresh-format storage.
      contactPhone: extractPhoneDigits(str(parsed.contactPhone)),
      licenseNumber: str(parsed.licenseNumber),
      brokerage: str(parsed.brokerage),
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

export function saveBrandSettings(settings: BrandSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage disabled or full — silently skip
  }
}

/**
 * Hook: loads brand settings + materializes the logo as an HTMLImageElement
 * (since canvas drawing needs an image element, not a data URL string).
 */
export function useBrandSettings() {
  const [settings, setSettings] = useState<BrandSettings>(() =>
    loadBrandSettings()
  );
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!settings.logoDataUrl) {
      setLogoImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.onerror = () => setLogoImg(null);
    img.src = settings.logoDataUrl;
  }, [settings.logoDataUrl]);

  const update = (next: BrandSettings) => {
    setSettings(next);
    saveBrandSettings(next);
  };

  return { settings, logoImg, update };
}

/**
 * Draw brand overlay on a canvas. Bottom-right logo (rounded square) with
 * optional agent name to the left. Designed for 1080-wide canvases.
 */
export function drawBrandOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  logoImg: HTMLImageElement | null,
  agentName: string,
  alpha: number = 1
): void {
  if (!logoImg && !agentName) return;
  if (alpha <= 0) return;

  const logoHeight = 80;
  const margin = 40;
  const gap = 16;
  const fontSize = 26;

  // Compute logo width from natural aspect ratio so wordmarks display wide,
  // square logos stay square, etc. Cap at 60-220 to keep brand area sensible.
  let logoWidth = logoHeight;
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    logoWidth = Math.max(60, Math.min(220, logoHeight * aspect));
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  const logoX = width - margin - logoWidth;
  const logoY = height - margin - logoHeight;

  // Logo: use contain (no cropping) so any logo aspect renders fully
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    drawImageContain(ctx, logoImg, logoX, logoY, logoWidth, logoHeight, 0);
  }

  // Agent name to the left of the logo (or pinned to right edge if no logo)
  if (agentName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    const nameX = logoImg ? logoX - gap : width - margin;
    ctx.fillText(agentName, nameX, logoY + logoHeight / 2);
  }

  ctx.restore();
}
