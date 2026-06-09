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
 * DEFAULT ramp (F3: flagship blue `#037290`), so callers never need to
 * pre-validate. New publishes are flagship, so an unset-brand v2 page renders
 * the blue default ramp here (the v1 unset default stays terracotta elsewhere).
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
  // ---- light surfaces (D1 locked palette · Build-Handoff §1) ----
  white: "#FCFAF4", // lifted cards (price, comps, why-us, market, stepper, stats, chart)
  offwhite: "#F8F3E8", // note zone · why-work-with-us cream
  paper: "#F1EADC", // base page · price zone · comps zone · §05 area zone
  sand: "#ECE1CC", // how-we-market WARM-tint band
  mist: "#E3ECEC", // how-we-work COOL-tint band
  // ---- text on light ----
  ink: "#1B2A2E", // --t-ink (headings on light)
  inkSoft: "#2C3C40", // --t-body (running body on light, near-ink high-contrast)
  inkFaint: "#74858A", // --t-mute (tertiary / mono labels / captions on light)
  // ---- dark beats (the 4 full-bleed dark beats) ----
  darkBand: "#0C1518", // --ink (hero, by-the-numbers, reviews, agent)
  darkBand2: "#14242B", // --ink-2 (lifted dark panel: agent card, reviews confidence card)
  darkBand3: "#21383F", // --ink-3 (dark chip / avatar / secondary button fill)
  // ---- text on dark ----
  onDark: "#EFE9DC", // --t-pap (primary on dark)
  onDarkSoft: "#B4C0C1", // --t-pap-soft (secondary on dark)
  onDarkMute: "#7C8D90", // --t-pap-mute (tertiary / labels on dark)
} as const;

/**
 * Near-black ink fed to the COLOR ENGINE for its ramp + on-signature contrast
 * math ONLY. This is intentionally decoupled from the page's heading `--ink`
 * (the teal-tinted `LAYOUT.ink` #1B2A2E): the engine uses `ink` as the dark
 * candidate for `--on-signature` (the CTA label on the signature fill), and a
 * lighter tinted ink would weaken a mid-warm signature's dark-label contrast
 * below AA and wrongly flip it to cream. The signature ramp + tints are
 * ink-independent, so this only affects the on-signature pick — keeping the
 * contract (terracotta → dark label, blue/green → cream) intact.
 */
const ENGINE_INK = "#1A1612";

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
  /**
   * D1 — the RARE light-tip highlight (Build-Handoff §1 `--mint`). Reserved for
   * the two earned light-on-dark moments: the §by-the-numbers 98.3 figure + the
   * hero personalization dot. Derived as a high-lightness tip of the agent's
   * signature (OKLCh, hue held) so a re-hued brand stays cohesive AND always
   * pops bright on the dark beats — never the washed-out paper-mixed tint.
   */
  mint: string;
  // ---- layout-locked neutrals (D1 locked palette) ----
  /** Lifted-card surface (price/comp/why-us/market/stepper/stat/chart cards). */
  white: string;
  /** Cream zone — agent note + why-work-with-us. */
  offwhite: string;
  paper: string;
  /** Warm-tint band — how-we-market. */
  sand: string;
  /** Cool-tint band — how-we-work. */
  mist: string;
  ink: string;
  /** Running body ink (near-ink, high-contrast) for readable sized-up copy. */
  inkSoft: string;
  /** Faint ink for tertiary/label/caption copy. */
  inkFaint: string;
  onDark: string;
  /** Secondary text on the dark beats. */
  onDarkSoft: string;
  /** Tertiary / label text on the dark beats. */
  onDarkMute: string;
  darkBand: string;
  darkBand2: string;
  /** Dark chip / avatar / ghost-button fill on the dark beats. */
  darkBand3: string;
  // ---- derived layout gate (F4 §D) ----
  /**
   * F4 — display-seat gate. True iff the agent's RAW signature can't itself
   * reach 3:1 as a big display number on paper (a very pale signature, e.g.
   * `#E8C547`). When true, the flagship seats the price figure / count digit /
   * stat values on a `tint-12` chip and deepens them to `--signature-deep` (the
   * engine's ≥4.5:1 numerals-on-tint-12 role) so they stay legible — the rule
   * lives HERE, in one place, and rides the shared role path to the live
   * preview as `--display-seat`. Normal signatures (blue/green/terracotta/navy/
   * magenta all reach ≥3:1 raw) → false → byte-identical render.
   */
  needsDisplaySeat: boolean;
}

export function deriveConsumerRoles(
  accentHex: string | undefined,
): ConsumerRoles {
  // Drive the canonical engine with the agent's accent + the LOCKED layout
  // surface/ink. Invalid/undefined accent falls through to the engine's default
  // signature (flagship blue #037290) — kept as-is so this redesign doesn't move
  // the shared brand-system default; a set brand re-hues the whole signature ramp
  // (the D1 locked teal-700 is the brand-kit pick, not a hard-coded page lock).
  const d = BrandEngine.derive(accentHex ?? "", {
    surface: LAYOUT.paper,
    ink: ENGINE_INK,
  });
  const h = d.hexes;

  // --mint — the bright light-tip of the signature (OKLCh lighten toward white,
  // hue/chroma character held by the engine mix), so it always reads as a vivid
  // highlight on the dark beats regardless of how deep the agent's accent is.
  const mint = BrandEngine.mixOklch(h.signature, "#FFFFFF", 0.42);

  return {
    signature: h.signature,
    signatureDeep: h["signature-deep"],
    signatureLink: h["signature-link"],
    tint12: h["tint-12"],
    tint9: h["tint-9"],
    tint6: h["tint-6"],
    line30: h["line-30"],
    onSignature: h["on-signature"],
    mint,
    white: LAYOUT.white,
    offwhite: LAYOUT.offwhite,
    paper: LAYOUT.paper,
    sand: LAYOUT.sand,
    mist: LAYOUT.mist,
    ink: LAYOUT.ink,
    inkSoft: LAYOUT.inkSoft,
    inkFaint: LAYOUT.inkFaint,
    onDark: LAYOUT.onDark,
    onDarkSoft: LAYOUT.onDarkSoft,
    onDarkMute: LAYOUT.onDarkMute,
    darkBand: LAYOUT.darkBand,
    darkBand2: LAYOUT.darkBand2,
    darkBand3: LAYOUT.darkBand3,
    // F4 §D — the agent's RAW signature can't serve as a 3:1 display number on
    // paper. The engine reports this directly (no new color math): when the
    // unclamped signature-on-surface is < 3:1, the foreground clamp can only
    // reach legibility by deepening the brand color into mud, so we seat the
    // big numbers on a chip instead. Normal signatures report ≥ 3:1 here.
    needsDisplaySeat: d.report.rawSignatureOnSurface < 3.0,
  };
}

/**
 * The flagship root's CSS custom-property map, derived from a resolved role
 * set. This is the ONE place the `role → --token` mapping lives, so the
 * server-rendered FlagshipPage and the Brand-kit live preview (which pushes
 * these same vars over the embed bridge) paint from one source of truth —
 * "the preview and the real page share one color path." `--decorative` aliases
 * the signature (secondary retired in PR #29).
 */
export function consumerRoleVars(roles: ConsumerRoles): Record<string, string> {
  return {
    "--signature": roles.signature,
    "--signature-deep": roles.signatureDeep,
    "--signature-link": roles.signatureLink,
    "--tint-12": roles.tint12,
    "--tint-9": roles.tint9,
    "--tint-6": roles.tint6,
    "--line-30": roles.line30,
    "--on-signature": roles.onSignature,
    "--decorative": roles.signature,
    "--mint": roles.mint,
    "--white": roles.white,
    "--offwhite": roles.offwhite,
    "--paper": roles.paper,
    "--sand": roles.sand,
    "--mist": roles.mist,
    "--ink": roles.ink,
    "--ink-soft": roles.inkSoft,
    "--ink-faint": roles.inkFaint,
    "--on-dark": roles.onDark,
    "--on-dark-soft": roles.onDarkSoft,
    "--on-dark-mute": roles.onDarkMute,
    "--dark-band": roles.darkBand,
    "--dark-band-2": roles.darkBand2,
    "--dark-band-3": roles.darkBand3,
    // F4 §D — the display-seat gate as a CSS flag (always emitted as "1"/"0"
    // so a live bridge push reliably overwrites the prior value). The scoped
    // `@container style(--display-seat: 1)` block in flagship.css is the ONLY
    // consumer; "0" matches nothing → byte-identical render.
    "--display-seat": roles.needsDisplaySeat ? "1" : "0",
  };
}
