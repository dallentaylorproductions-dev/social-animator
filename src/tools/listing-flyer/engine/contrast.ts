/**
 * WCAG relative luminance for an sRGB hex color. Returns 0–1, where higher
 * values are perceptually lighter.
 *
 * Used by the flyer's PDF + live preview to auto-flip text colors when the
 * agent picks a dark page background. Same formula in both render paths so
 * the preview reflects what the PDF will actually look like.
 */
export function getLuminance(hex: string): number {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || !/^[0-9a-fA-F]+$/.test(h)) return 1; // fall back to "light"
  const rgb = h.match(/.{2}/g)!.map((c) => parseInt(c, 16) / 255);
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Convenience: pick light or dark text color based on a background hex. */
export function pickContrastText(
  bgHex: string,
  light = "#ffffff",
  dark = "#0a0a0a"
): string {
  return getLuminance(bgHex) < 0.5 ? light : dark;
}

/** Background-aware muted text color (paired with primary text). */
export function pickContrastMuted(bgHex: string): string {
  return getLuminance(bgHex) < 0.5 ? "#a0a0a0" : "#666666";
}
