import type { ReactNode } from "react";

/**
 * Seller State A · the shared proof-panel primitive (§3.6 — the coordinated
 * proof-number system).
 *
 * ONE component, two surface variants (light / dark). All three State A proof
 * numbers render through it with an IDENTICAL treatment, so they read as one
 * coordinated system rather than three bespoke stats:
 *
 *   • Z2 — `+6%`            (light, on the cream brief activity panel)
 *   • Z3 — `$580K – $700K`  (dark,  in the valuation band)
 *   • Z4 — `101.3%`         (light, the trust-strip stat rail)
 *
 * The treatment is constant: a tonal fill + a 2px teal keyline + a mono label +
 * a Newsreader number (+ an optional muted caption). Each ZONE owns only its
 * surrounding layout (the grid, the rail, the band) and passes the number as
 * children — the panel itself never changes shape between zones.
 *
 * COLOR: the teal keyline + number track the agent brand (light = var(--teal-700),
 * dark = var(--teal-500), set in state-a.css), so the panels re-hue with the
 * agent exactly like the neighboring sparkline / stars. The cream + dark fills
 * are fixed editorial neutrals (the design's proof-panel tones). The number
 * fades + rises once on view (`.reveal.in`), with a reduced-motion fallback that
 * lands it drawn — see state-a.css.
 *
 * This is a NEW component used only on State A surfaces; it never touches any
 * existing stat element State B renders, so State B stays byte-identical.
 */
export function ProofPanel({
  variant = "light",
  label,
  caption,
  className,
  testid,
  numAriaLabel,
  children,
}: {
  /** Surface tone: `light` (cream) or `dark` (ink-lift). */
  variant?: "light" | "dark";
  /** The mono eyebrow above the number (uppercased in CSS). */
  label: string;
  /** Optional muted sub-line under the number (e.g. "vs. last year"). */
  caption?: string;
  /** Extra class for zone-local layout/surface overrides (e.g. the Z4 inset rail). */
  className?: string;
  /** Stable test hook on the panel root. */
  testid?: string;
  /** Accessible label for a graphical number (e.g. the Z3 range), when the
   *  visible content is decorative. Falls through to the children otherwise. */
  numAriaLabel?: string;
  /** The proof number itself (a string, or a graphic node like the Z3 range). */
  children: ReactNode;
}) {
  return (
    <div
      className={`sa-proof sa-proof--${variant}${className ? ` ${className}` : ""}`}
      data-variant={variant}
      data-testid={testid}
    >
      <span className="sa-proof__label">{label}</span>
      <div
        className="sa-proof__num"
        {...(numAriaLabel ? { "aria-label": numAriaLabel, role: "text" } : {})}
      >
        {children}
      </div>
      {caption && <span className="sa-proof__cap">{caption}</span>}
    </div>
  );
}
