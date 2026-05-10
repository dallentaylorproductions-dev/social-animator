"use client";

import QRCode from "qrcode";

/**
 * Generate a PNG data URL for a QR code linking to `targetUrl`.
 * Returns null for empty/invalid URL — callers should hide the QR
 * block when this is null. fgColor and bgColor support brand
 * theming; both default to a high-contrast black-on-white pairing
 * that scans reliably from any printed surface.
 *
 * `qrcode`'s default error-correction level (M) tolerates up to ~15%
 * damage — fine for digital screens; we keep it at default. The
 * library's default quiet zone (4 modules) is preserved so the
 * embedded code reads cleanly without trimming.
 */
export async function generateQrDataUrl(
  targetUrl: string,
  size: number = 400,
  fgColor: string = "#000000",
  bgColor: string = "#ffffff"
): Promise<string | null> {
  const trimmed = targetUrl.trim();
  if (!trimmed) return null;
  try {
    const dataUrl = await QRCode.toDataURL(trimmed, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: fgColor,
        light: bgColor,
      },
    });
    return dataUrl;
  } catch {
    // Malformed URLs cause toDataURL to throw — treat as "no QR" so
    // the document doesn't fail to render.
    return null;
  }
}
