/* ============================================================================
 * color-engine.ts — Brand kit v2 derivation engine (Phase E.1)
 * ----------------------------------------------------------------------------
 * Verbatim TypeScript port of docs/design/brand-unification/color_engine.js
 * (the authoritative, dependency-free derivation reference). One signature
 * color in → a 7-role tonal ramp out, every text-bearing step contrast-clamped
 * per role. Emits BOTH css-var values and resolved hexes — canvas templates
 * consume `hexes` in a later phase, so the return shape is a CONTRACT: keep it
 * stable.
 *
 * COLOR SPACE: mixing is done in OKLCh (matches CSS `color-mix(in oklch, …)`),
 * holding hue + chroma while moving lightness — the sRGB path desaturated
 * deep/light steps into mud, the exact failure this system prevents. WCAG
 * luminance still linearizes sRGB per spec. `mixSrgb` is retained for reference
 * parity only and is NOT used on the live path.
 *
 * The math here is intentionally identical to the design's color_engine.js,
 * line-for-line, so the ported engine stays the canonical contract reference.
 * ========================================================================== */

export interface DeriveOptions {
  surface?: string;
  ink?: string;
  secondary?: string | null;
}

/** Resolved #RRGGBB hexes, post-clamp. Shape is a downstream contract. */
export interface BrandHexes {
  signature: string;
  "signature-deep": string;
  "signature-link": string;
  "tint-12": string;
  "tint-6": string;
  "line-30": string;
  "on-signature": string;
  decorative: string;
  surface: string;
  ink: string;
}

export type BrandVars = Record<string, string>;

export interface BrandReport {
  rawSignatureOnSurface: number;
  signatureOnSurface: number;
  linkOnSurface: number;
  deepOnPanel: number;
  onSignature: number;
  bodyOnSurface: number;
  decorativeOnSurface: number;
}

export interface DerivedBrand {
  hexes: BrandHexes;
  vars: BrandVars;
  report: BrandReport;
  secondarySet: boolean;
  surface: string;
  ink: string;
}

/* ---- hex <-> rgb ---- */
function clampByte(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => clampByte(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/* ---- sRGB gamma <-> linear ---- */
function toLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function toGamma(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clampByte(v * 255);
}

/* ---- linear sRGB <-> OKLab (Björn Ottosson) ---- */
function rgbToOklab(hex: string): { L: number; a: number; b: number } {
  const p = hexToRgb(hex);
  const r = toLinear(p.r),
    g = toLinear(p.g),
    b = toLinear(p.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l),
    m_ = Math.cbrt(m),
    s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}
function oklabToRgb(L: number, a: number, b: number): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_,
    m = m_ * m_ * m_,
    s = s_ * s_ * s_;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return rgbToHex(toGamma(r), toGamma(g), toGamma(bb));
}
function rgbToOklch(hex: string): { L: number; C: number; h: number } {
  const o = rgbToOklab(hex);
  const C = Math.hypot(o.a, o.b);
  let h = (Math.atan2(o.b, o.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: o.L, C, h };
}
function oklchToRgb(L: number, C: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(hr), C * Math.sin(hr));
}

/* ---- color-mix(in oklch, a, b (wB*100)%) ---- */
function mixOklch(a: string, b: string, wB: number): string {
  const A = rgbToOklch(a),
    B = rgbToOklch(b),
    t = wB;
  const L = A.L + (B.L - A.L) * t;
  const C = A.C + (B.C - A.C) * t;
  const aAch = A.C < 1e-4,
    bAch = B.C < 1e-4;
  let h: number;
  if (aAch && bAch) {
    h = 0;
  } else if (aAch) {
    h = B.h; // powerless hue carries the other endpoint
  } else if (bAch) {
    h = A.h;
  } else {
    // shorter-arc hue interpolation
    let dh = B.h - A.h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    h = A.h + dh * t;
  }
  return oklchToRgb(L, C, h);
}
// srgb reference mix (documented, not used on the live path)
function mixSrgb(a: string, b: string, wB: number): string {
  const A = hexToRgb(a),
    B = hexToRgb(b);
  return rgbToHex(
    A.r + (B.r - A.r) * wB,
    A.g + (B.g - A.g) * wB,
    A.b + (B.b - A.b) * wB,
  );
}
const mix = mixOklch;

/* ---- WCAG contrast ---- */
function luminance(hex: string): number {
  const p = hexToRgb(hex);
  return 0.2126 * toLinear(p.r) + 0.7152 * toLinear(p.g) + 0.0722 * toLinear(p.b);
}
function contrast(a: string, b: string): number {
  const L1 = luminance(a),
    L2 = luminance(b);
  const hi = Math.max(L1, L2),
    lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---- hex validation (E.0 contract) ---- */
function isValidHex(s: unknown): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s || "").trim());
}
function normHex(s: unknown): string | null {
  if (!isValidHex(s)) return null;
  let h = String(s).replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return "#" + h.toUpperCase();
}

/* ---- lightness clamp (OKLCh steps toward black/white) ---- */
function clampContrast(
  color: string,
  surface: string,
  target: number,
  dir: "lighten" | "deepen",
): string {
  const neutral = dir === "lighten" ? "#FFFFFF" : "#000000";
  let c = color,
    guard = 0;
  while (contrast(c, surface) < target && guard < 28) {
    c = mixOklch(c, neutral, 0.05);
    guard++;
  }
  return c;
}

/* --------------------------------------------------------------------------
 * on-signature (round-2 rule, deterministic):
 *   • both paper(cream) and ink pass AA on the fill → prefer PAPER (cohesion)
 *   • only one passes → use it
 *   • neither passes → return null; caller lightness-clamps the FILL until
 *     paper passes, then text = paper.
 * ------------------------------------------------------------------------ */
function resolveOn(fill: string, paper: string, ink: string): string | null {
  const cp = contrast(paper, fill),
    ci = contrast(ink, fill);
  if (cp >= 4.5 && ci >= 4.5) return paper;
  if (cp >= 4.5) return paper;
  if (ci >= 4.5) return ink;
  return null;
}

/* --------------------------------------------------------------------------
 * derive(signature, opts) → { hexes, vars, report, secondarySet }
 * ------------------------------------------------------------------------ */
function derive(signature: string, opts?: DeriveOptions): DerivedBrand {
  opts = opts || {};
  const surface = normHex(opts.surface) || "#F1EBE0"; // = paper
  const ink = normHex(opts.ink) || "#1A1612";
  const secondary = opts.secondary ? normHex(opts.secondary) : null;
  const sigIn = normHex(signature) || "#C26A4E";

  // decorative fills & lines — color-mix(signature N%, surface). Not clamped.
  const tint12 = mix(surface, sigIn, 0.12);
  const tint6 = mix(surface, sigIn, 0.06);
  const line30 = mix(surface, sigIn, 0.3);

  // display / decorative / fill signature — AA-large (3:1) vs surface
  let sig = clampContrast(sigIn, surface, 3.0, "deepen");

  // on-signature, with the fill-clamp fallback
  let onSig = resolveOn(sig, surface, ink);
  if (onSig === null) {
    sig = clampContrast(sig, surface, 4.5, "deepen");
    onSig = surface;
  }

  // body-size links — AA (4.5:1) vs surface, deepened from the raw signature
  const link = clampContrast(sigIn, surface, 4.5, "deepen");

  // price numerals on the tint-12 panel — AA (4.5:1)
  const deep = clampContrast(mix(sigIn, "#000000", 0.22), tint12, 4.5, "deepen");

  // decorative — secondary at FULL STRENGTH when set (no ramp); else signature
  const decorative = secondary || sig;

  const hexes: BrandHexes = {
    signature: sig,
    "signature-deep": deep,
    "signature-link": link,
    "tint-12": tint12,
    "tint-6": tint6,
    "line-30": line30,
    "on-signature": onSig,
    decorative: decorative,
    surface: surface,
    ink: ink,
  };

  const vars: BrandVars = {};
  (Object.keys(hexes) as Array<keyof BrandHexes>).forEach((k) => {
    vars["--" + k] = hexes[k];
  });

  const report: BrandReport = {
    rawSignatureOnSurface: contrast(sigIn, surface), // the agent's pick, unclamped
    signatureOnSurface: contrast(sig, surface),
    linkOnSurface: contrast(link, surface),
    deepOnPanel: contrast(deep, tint12),
    onSignature: contrast(onSig, sig),
    bodyOnSurface: contrast(ink, surface),
    decorativeOnSurface: contrast(decorative, surface),
  };

  return {
    hexes,
    vars,
    report,
    secondarySet: !!secondary,
    surface,
    ink,
  };
}

function applyVars(el: HTMLElement | null, derived: DerivedBrand): void {
  if (!el) return;
  Object.keys(derived.vars).forEach((k) => {
    el.style.setProperty(k, derived.vars[k]);
  });
}

export const BrandEngine = {
  hexToRgb,
  rgbToHex,
  mix,
  mixOklch,
  mixSrgb,
  rgbToOklch,
  oklchToRgb,
  luminance,
  contrast,
  isValidHex,
  normHex,
  clampContrast,
  resolveOn,
  derive,
  applyVars,
};
