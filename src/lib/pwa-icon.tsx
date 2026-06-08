import type { ReactElement } from "react";

/**
 * Shared SEP app mark for the PWA icons, rendered through `next/og`
 * `ImageResponse` (same engine as the OG card route) so we never hand-export
 * PNGs. One drawing function feeds every icon surface: the favicon
 * (`app/icon.tsx`), the Apple touch icon (`app/apple-icon.tsx`), and the
 * three manifest icons (`/icons/192`, `/icons/512`, `/icons/maskable`).
 *
 * Brand tokens are verified against the live design system, NOT invented:
 *   canvas  #0a0a0a   — globals.css `--color-canvas`
 *   mint    #5BF5C9   — dashboard/sep-studio.css `--accent` (the glowing dot)
 *   text    #ededed   — globals.css `--color-text-primary`
 *
 * The background is FULLY OPAQUE brand-dark on every variant: iOS renders a
 * transparent Apple touch icon as a black box, and a maskable icon must be
 * full-bleed so platform masks have something to crop into. No rounded
 * corners in the source — iOS and Android apply their own mask.
 */

const CANVAS = "#0a0a0a";
const MINT = "#5BF5C9";
const TEXT = "#ededed";

/**
 * @param size   pixel dimension (square)
 * @param inset  fractional safe-zone padding (0 for normal, ~0.12 for
 *               `purpose: maskable` so the wordmark survives a circular mask)
 */
export function SepMark({
  size,
  inset = 0,
}: {
  size: number;
  inset?: number;
}): ReactElement {
  const pad = Math.round(size * inset);
  const dot = Math.max(6, Math.round(size * 0.09));
  const font = Math.round(size * 0.33);
  const gap = Math.round(size * 0.05);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: CANVAS,
      }}
    >
      <div
        style={{
          flex: 1,
          margin: pad,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: CANVAS,
        }}
      >
        <div
          style={{
            width: dot,
            height: dot,
            borderRadius: dot,
            background: MINT,
            marginBottom: gap,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: font,
            fontWeight: 800,
            letterSpacing: Math.round(size * 0.015),
            color: TEXT,
            fontFamily: "sans-serif",
          }}
        >
          <span style={{ color: TEXT }}>SE</span>
          <span style={{ color: MINT }}>P</span>
        </div>
      </div>
    </div>
  );
}
