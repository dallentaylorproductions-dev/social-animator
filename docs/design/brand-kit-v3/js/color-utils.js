/* color-utils.js — one-signature derivation + WCAG readability.
   Plain JS, attached to window.CU. No dependencies. */
(function () {
  "use strict";

  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  // ---- hex <-> rgb ----------------------------------------------------------
  function hexToRgb(hex) {
    if (typeof hex !== "string") return null;
    let h = hex.trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    };
  }
  function rgbToHex({ r, g, b }) {
    const to = (v) =>
      Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
    return "#" + to(r) + to(g) + to(b);
  }
  function isValidHex(hex) {
    return hexToRgb(hex) !== null;
  }
  function normalizeHex(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToHex(rgb).toUpperCase() : null;
  }

  // ---- sRGB gamma -----------------------------------------------------------
  const toLinear = (c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const toGamma = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  // ---- linear sRGB <-> OKLab/OKLCh -----------------------------------------
  function rgbToOklch({ r, g, b }) {
    const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
    const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
    const C = Math.sqrt(a * a + bb * bb);
    let H = (Math.atan2(bb, a) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L, C, H };
  }
  function oklchToRgb({ L, C, H }) {
    const hr = (H * Math.PI) / 180;
    const a = Math.cos(hr) * C;
    const b = Math.sin(hr) * C;
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return {
      r: clamp01(toGamma(lr)),
      g: clamp01(toGamma(lg)),
      b: clamp01(toGamma(lb)),
    };
  }

  // ---- WCAG contrast --------------------------------------------------------
  function relLuminance({ r, g, b }) {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }
  function contrast(hexA, hexB) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    if (!a || !b) return 0;
    const la = relLuminance(a), lb = relLuminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  // best plain-foreground (#fff or near-black) for a fill
  function readableInk(fillHex) {
    const onWhite = contrast(fillHex, "#FFFFFF");
    const onDark = contrast(fillHex, "#1A1714");
    return onWhite >= onDark ? "#FFFFFF" : "#1A1714";
  }

  // ---- one-signature derivation --------------------------------------------
  // Derived family: lighter tints + deeper shades around the signature hue.
  // Shown-not-asked; read-only.
  function deriveRamp(signatureHex) {
    const base = rgbToOklch(hexToRgb(signatureHex) || hexToRgb("#C26A4E"));
    const steps = [
      { key: "wash", L: 0.95, cMul: 0.32, role: "Wash" },
      { key: "tint", L: 0.88, cMul: 0.55, role: "Tint" },
      { key: "soft", L: 0.78, cMul: 0.82, role: "Soft" },
      { key: "hover", L: 0.55, cMul: 1.0, role: "Hover" },
      { key: "deep", L: 0.44, cMul: 0.96, role: "Deep" },
      { key: "ink", L: 0.33, cMul: 0.82, role: "Ink" },
    ];
    return steps.map((st) => {
      const rgb = oklchToRgb({ L: st.L, C: base.C * st.cMul, H: base.H });
      return { ...st, hex: rgbToHex(rgb).toUpperCase() };
    });
  }

  // A deeper, on-surface-safe shade of the signature for text/links/eyebrows.
  // Returns { hex, adjusted } — adjusted=true only if the signature itself
  // failed AA on the surface and we had to darken it.
  function accentOnSurface(signatureHex, surfaceHex, minRatio = 4.5) {
    const direct = contrast(signatureHex, surfaceHex);
    if (direct >= minRatio) return { hex: signatureHex, adjusted: false, ratio: direct };
    const base = rgbToOklch(hexToRgb(signatureHex) || hexToRgb("#C26A4E"));
    // walk lightness down (or up, if surface is dark) until it passes
    const surfLum = relLuminance(hexToRgb(surfaceHex) || { r: 1, g: 1, b: 1 });
    const dir = surfLum > 0.4 ? -1 : 1; // darken on light surfaces
    let L = base.L, best = signatureHex, bestRatio = direct;
    for (let i = 0; i < 40; i++) {
      L = clamp01(L + dir * 0.02);
      const hex = rgbToHex(oklchToRgb({ L, C: base.C, H: base.H })).toUpperCase();
      const ratio = contrast(hex, surfaceHex);
      if (ratio > bestRatio) { bestRatio = ratio; best = hex; }
      if (ratio >= minRatio) return { hex, adjusted: true, ratio };
    }
    return { hex: best, adjusted: true, ratio: bestRatio };
  }

  window.CU = {
    clamp01, hexToRgb, rgbToHex, isValidHex, normalizeHex,
    rgbToOklch, oklchToRgb, contrast, readableInk, deriveRamp, accentOnSurface,
  };
})();
