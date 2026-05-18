/**
 * Parallel design token system for react-pdf rendering (Audit 1A §6).
 *
 * react-pdf's StyleSheet doesn't accept Tailwind classes; this module
 * is the source of truth for color, type, spacing, and radius values
 * used inside react-pdf <Document> trees. Token names mirror the web
 * theme (src/app/globals.css @theme inline block) so a designer can
 * reason about parity.
 *
 * Web/PDF parity table (audit 1A §6.1) — quick reference:
 *   text-xs    (12px web)  -> 9pt   PDF
 *   text-sm    (14px)      -> 10pt
 *   text-base  (16px)      -> 12pt
 *   text-lg    (18px)      -> 13pt
 *   text-xl    (20px)      -> 15pt
 *   text-2xl   (24px)      -> 18pt
 *   text-3xl   (30px)      -> 22pt
 *   text-display (44px)    -> 32pt
 *
 * --- Font registration ---
 *
 * Audit 1A D5 surfaces three options for the PDF font family:
 *   (a) Geist Variable TTF + Font.register()
 *   (b) Inter TTF + Font.register()
 *   (c) react-pdf's built-in Helvetica (no asset, no registration)
 *
 * The current build ships option (c) — Helvetica. The `geist` npm
 * package distributes only WOFF2 (consumed by Next.js's font loader
 * for the web surface). Converting Geist Variable to TTF for react-pdf
 * is the polish-bar choice once a TTF asset is available; until then
 * Helvetica matches what existing PDFs (Listing Flyer, Open House
 * Promo, Listing Presentation, Seller Intelligence Report) already use,
 * so no PDF surface diverges in this commit.
 *
 * To upgrade later: add Geist TTFs under public/fonts/, uncomment the
 * Font.register block below, and switch PDF_FONT_FAMILY to 'Geist'.
 */

// import { Font } from '@react-pdf/renderer';
//
// Font.register({
//   family: 'Geist',
//   fonts: [
//     { src: '/fonts/Geist-Regular.ttf' },
//     { src: '/fonts/Geist-Medium.ttf', fontWeight: 500 },
//     { src: '/fonts/Geist-SemiBold.ttf', fontWeight: 600 },
//     { src: '/fonts/Geist-Bold.ttf', fontWeight: 700 },
//   ],
// });

/** Built-in react-pdf font (Helvetica). Upgrade to 'Geist' once TTFs land. */
export const PDF_FONT_FAMILY = 'Helvetica' as const;

/** Color tokens — hex values mirror the web @theme tokens 1:1. */
export const PDF_COLORS = {
  // SEP brand
  mint: '#4ef2d9',
  mintHover: '#3fd9c1',

  // Editorial palette secondaries (D1 locked)
  gold: '#d4a857',
  brick: '#c76a50',
  rose: '#c99099',

  // PDF surfaces (print on white paper — inverse of web's dark canvas)
  paper: '#ffffff',
  paperMuted: '#f6f6f6',
  text: '#0a0a0a',
  textMuted: '#666666',
  textHelp: '#888888',

  // Rules / borders
  rule: '#e5e5e5',
  ruleEmphasis: '#4ef2d9',
} as const;

/** Type sizes in PDF points. */
export const PDF_FONT_SIZES = {
  xs: 9,
  sm: 10,
  base: 12,
  lg: 13,
  xl: 15,
  '2xl': 18,
  '3xl': 22,
  display: 32,
} as const;

/** Weight constants matching the web scale (Audit 1A §3.1). */
export const PDF_FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/** Spacing in PDF points. Roughly 0.75x the web px scale. */
export const PDF_SPACING = {
  '1': 3,
  '2': 6,
  '3': 9,
  '4': 12,
  '6': 18,
  '8': 24,
  '12': 36,
  '16': 48,
} as const;

/** Corner radii in points. PDF rounding is rare; tables use sharp corners. */
export const PDF_RADII = {
  sm: 3,
  md: 6,
  lg: 9,
  xl: 12,
} as const;

/** Border widths in points. */
export const PDF_BORDER_WIDTHS = {
  hairline: 0.5,
  default: 1,
  emphasis: 2,
} as const;
