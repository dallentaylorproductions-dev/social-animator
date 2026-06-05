/**
 * deriveConsumerRoles — the single role-resolution entry point for the
 * flagship (v2) consumer template (F1 foundation).
 *
 * The flagship template consumes ONLY the SIGNATURE ramp derived from the
 * agent's accent; paper/ink (and the rest of the neutral layout scaffold) are
 * LAYOUT-LOCKED — they do NOT track the agent's brand background/text. This is
 * the ratified flagship decision, and it is why this helper hardcodes the
 * locked surface/ink defaults when it calls the engine instead of forwarding
 * brandColors.background / brandColors.text.
 *
 * Implementation is a THIN wrapper around the production color engine
 * (`BrandEngine.derive`, the one canonical derivation) — no new color math.
 * It exists so F2 has ONE import for every role + layout constant it needs.
 *
 * Server-safe: `BrandEngine` is a pure module (no window/document), so this
 * runs in the server-rendered `/h/<slug>` path.
 *
 * `accentHex` undefined / not a valid hex → the engine derives the production
 * DEFAULT ramp (terracotta `#C26A4E`), so callers never need to pre-validate.
 */

import { BrandEngine } from "@/lib/brand/color-engine";

/**
 * Layout-locked neutral scaffold for the flagship template. These are NOT
 * brand-derived — they're the fixed paper/ink register the v2 design sits on,
 * sourced from the current production consumer page's layout-owned surfaces
 * (presentation-page.css: --surface / --ink, the dark agent bands, on-dark
 * cream). Kept here so the template imports one resolved set.
 */
const LAYOUT = {
  paper: "#F1EBE0", // --surface (locked page register)
  ink: "#1A1612", // --ink (raw body ink)
  onDark: "#FBF6EC", // cream text used on the solid dark bands
  darkBand: "#1A1612", // agent / dark chapter band background
  darkBand2: "#16110D", // deeper dark band (editorial register)
} as const;

/** The full resolved role set the flagship (v2) template consumes. */
export interface ConsumerRoles {
  // ---- signature ramp (brand-derived, post-clamp resolved hexes) ----
  signature: string;
  signatureDeep: string;
  signatureLink: string;
  tint12: string;
  /** F1 quiet band tint — the 9% midpoint between tint12 and tint6. */
  tint9: string;
  tint6: string;
  line30: string;
  onSignature: string;
  // ---- layout-locked neutrals ----
  paper: string;
  ink: string;
  /** Softer body ink for secondary copy (production --ink-muted at defaults). */
  inkSoft: string;
  /** Faint ink for tertiary/label copy (production --ink-faint at defaults). */
  inkFaint: string;
  onDark: string;
  darkBand: string;
  darkBand2: string;
}

export function deriveConsumerRoles(
  accentHex: string | undefined,
): ConsumerRoles {
  // Drive the canonical engine with the agent's accent + the LOCKED layout
  // surface/ink. Invalid/undefined accent falls through to the engine's
  // default signature (#C26A4E) internally.
  const d = BrandEngine.derive(accentHex ?? "", {
    surface: LAYOUT.paper,
    ink: LAYOUT.ink,
  });
  const h = d.hexes;

  // inkSoft / inkFaint are layout-locked: derived from the locked paper/ink
  // via the engine's own OKLCh mix (reused math, not new), so they match the
  // production --ink-muted (56%) / --ink-faint (38%) resolved values exactly.
  const inkSoft = BrandEngine.mixOklch(LAYOUT.paper, LAYOUT.ink, 0.56);
  const inkFaint = BrandEngine.mixOklch(LAYOUT.paper, LAYOUT.ink, 0.38);

  return {
    signature: h.signature,
    signatureDeep: h["signature-deep"],
    signatureLink: h["signature-link"],
    tint12: h["tint-12"],
    tint9: h["tint-9"],
    tint6: h["tint-6"],
    line30: h["line-30"],
    onSignature: h["on-signature"],
    paper: LAYOUT.paper,
    ink: LAYOUT.ink,
    inkSoft,
    inkFaint,
    onDark: LAYOUT.onDark,
    darkBand: LAYOUT.darkBand,
    darkBand2: LAYOUT.darkBand2,
  };
}
