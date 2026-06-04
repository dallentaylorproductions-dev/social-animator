/* ============================================================================
 * color_engine.js — Brand kit v2 derivation engine  (Phase E.1, round 2)
 * ----------------------------------------------------------------------------
 * One signature color in → a 7-role tonal ramp out, every text-bearing step
 * contrast-clamped per role. Emits BOTH css-var values and resolved hexes.
 *
 * COLOR SPACE: mixing is done in OKLCh (matches CSS  color-mix(in oklch, …)).
 * This holds hue + chroma while moving lightness — the srgb path desaturated
 * deep/light steps into mud, which is the exact failure mode this system
 * exists to prevent. srgb equivalents live in the contract as reference only.
 *
 * Luminance for WCAG contrast still linearizes sRGB per the spec.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- hex <-> rgb ---- */
  function clampByte(x) { return Math.max(0, Math.min(255, Math.round(x))); }
  function hexToRgb(hex) {
    hex = String(hex).replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return clampByte(v).toString(16).padStart(2, '0'); }).join('').toUpperCase();
  }

  /* ---- sRGB gamma <-> linear ---- */
  function toLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function toGamma(c) { var v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return clampByte(v * 255); }

  /* ---- linear sRGB <-> OKLab (Björn Ottosson) ---- */
  function rgbToOklab(hex) {
    var p = hexToRgb(hex);
    var r = toLinear(p.r), g = toLinear(p.g), b = toLinear(p.b);
    var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    var l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return {
      L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
  }
  function oklabToRgb(L, a, b) {
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    var r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return rgbToHex(toGamma(r), toGamma(g), toGamma(bb));
  }
  function rgbToOklch(hex) {
    var o = rgbToOklab(hex);
    var C = Math.hypot(o.a, o.b);
    var h = Math.atan2(o.b, o.a) * 180 / Math.PI; if (h < 0) h += 360;
    return { L: o.L, C: C, h: h };
  }
  function oklchToRgb(L, C, h) {
    var hr = h * Math.PI / 180;
    return oklabToRgb(L, C * Math.cos(hr), C * Math.sin(hr));
  }

  /* ---- color-mix(in oklch, a, b  (wB*100)%) ---- */
  function mixOklch(a, b, wB) {
    var A = rgbToOklch(a), B = rgbToOklch(b), t = wB;
    var L = A.L + (B.L - A.L) * t;
    var C = A.C + (B.C - A.C) * t;
    var aAch = A.C < 1e-4, bAch = B.C < 1e-4, h;
    if (aAch && bAch) { h = 0; }
    else if (aAch) { h = B.h; }          // powerless hue carries the other endpoint
    else if (bAch) { h = A.h; }
    else {                                // shorter-arc hue interpolation
      var dh = B.h - A.h;
      if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
      h = A.h + dh * t;
    }
    return oklchToRgb(L, C, h);
  }
  // srgb reference mix (documented, not used on the live path)
  function mixSrgb(a, b, wB) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A.r + (B.r - A.r) * wB, A.g + (B.g - A.g) * wB, A.b + (B.b - A.b) * wB);
  }
  var mix = mixOklch;

  /* ---- WCAG contrast ---- */
  function luminance(hex) { var p = hexToRgb(hex); return 0.2126 * toLinear(p.r) + 0.7152 * toLinear(p.g) + 0.0722 * toLinear(p.b); }
  function contrast(a, b) { var L1 = luminance(a), L2 = luminance(b); var hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }

  /* ---- hex validation (E.0 contract) ---- */
  function isValidHex(s) { return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s || '').trim()); }
  function normHex(s) {
    if (!isValidHex(s)) return null;
    var h = String(s).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return '#' + h.toUpperCase();
  }

  /* ---- lightness clamp (OKLCh steps toward black/white) ---- */
  function clampContrast(color, surface, target, dir) {
    var neutral = dir === 'lighten' ? '#FFFFFF' : '#000000';
    var c = color, guard = 0;
    while (contrast(c, surface) < target && guard < 28) { c = mixOklch(c, neutral, 0.05); guard++; }
    return c;
  }

  /* --------------------------------------------------------------------------
   * on-signature (round-2 rule, deterministic):
   *   • both paper(cream) and ink pass AA on the fill → prefer PAPER (cohesion)
   *   • only one passes → use it
   *   • neither passes → return null; caller lightness-clamps the FILL until
   *     paper passes, then text = paper.
   * ------------------------------------------------------------------------ */
  function resolveOn(fill, paper, ink) {
    var cp = contrast(paper, fill), ci = contrast(ink, fill);
    if (cp >= 4.5 && ci >= 4.5) return paper;
    if (cp >= 4.5) return paper;
    if (ci >= 4.5) return ink;
    return null;
  }

  /* --------------------------------------------------------------------------
   * derive(signature, opts) → { hexes, vars, report, secondarySet }
   * ------------------------------------------------------------------------ */
  function derive(signature, opts) {
    opts = opts || {};
    var surface = normHex(opts.surface) || '#F1EBE0';   // = paper
    var ink     = normHex(opts.ink) || '#1A1612';
    var secondary = opts.secondary ? normHex(opts.secondary) : null;
    var sigIn = normHex(signature) || '#C26A4E';

    // decorative fills & lines — color-mix(signature N%, surface). Not clamped.
    var tint12 = mix(surface, sigIn, 0.12);
    var tint6  = mix(surface, sigIn, 0.06);
    var line30 = mix(surface, sigIn, 0.30);

    // display / decorative / fill signature — AA-large (3:1) vs surface
    var sig = clampContrast(sigIn, surface, 3.0, 'deepen');

    // on-signature, with the fill-clamp fallback
    var onSig = resolveOn(sig, surface, ink);
    if (onSig === null) { sig = clampContrast(sig, surface, 4.5, 'deepen'); onSig = surface; }

    // body-size links — AA (4.5:1) vs surface, deepened from the raw signature
    var link = clampContrast(sigIn, surface, 4.5, 'deepen');

    // price numerals on the tint-12 panel — AA (4.5:1)
    var deep = clampContrast(mix(sigIn, '#000000', 0.22), tint12, 4.5, 'deepen');

    // decorative — secondary at FULL STRENGTH when set (no ramp); else signature
    var decorative = secondary || sig;

    var hexes = {
      'signature': sig,
      'signature-deep': deep,
      'signature-link': link,
      'tint-12': tint12,
      'tint-6': tint6,
      'line-30': line30,
      'on-signature': onSig,
      'decorative': decorative,
      'surface': surface,
      'ink': ink
    };

    var vars = {};
    Object.keys(hexes).forEach(function (k) { vars['--' + k] = hexes[k]; });

    var report = {
      rawSignatureOnSurface: contrast(sigIn, surface),       // the agent's pick, unclamped
      signatureOnSurface: contrast(sig, surface),
      linkOnSurface: contrast(link, surface),
      deepOnPanel: contrast(deep, tint12),
      onSignature: contrast(onSig, sig),
      bodyOnSurface: contrast(ink, surface),
      decorativeOnSurface: contrast(decorative, surface)
    };

    return { hexes: hexes, vars: vars, report: report, secondarySet: !!secondary, surface: surface, ink: ink };
  }

  function applyVars(el, derived) {
    if (!el) return;
    Object.keys(derived.vars).forEach(function (k) { el.style.setProperty(k, derived.vars[k]); });
  }

  global.BrandEngine = {
    hexToRgb: hexToRgb, rgbToHex: rgbToHex,
    mix: mix, mixOklch: mixOklch, mixSrgb: mixSrgb,
    rgbToOklch: rgbToOklch, oklchToRgb: oklchToRgb,
    luminance: luminance, contrast: contrast,
    isValidHex: isValidHex, normHex: normHex,
    clampContrast: clampContrast, resolveOn: resolveOn,
    derive: derive, applyVars: applyVars
  };
})(typeof window !== 'undefined' ? window : this);
