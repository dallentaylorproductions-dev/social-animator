"use client";

import { useEffect, useState } from "react";
import { drawImageContain } from "@/engine/draw";

export interface BrandSettings {
  logoDataUrl: string | null;
  agentName: string;
  primaryColor: string;
  accentColor: string;
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
  contactEmail: "",
  contactPhone: "",
  licenseNumber: "",
  brokerage: "",
};

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

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
      contactEmail: str(parsed.contactEmail),
      contactPhone: str(parsed.contactPhone),
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
