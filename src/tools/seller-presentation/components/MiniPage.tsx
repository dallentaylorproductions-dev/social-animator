"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * MiniPage — brand-driven miniature seller page (Phase E.0).
 *
 * Recreated from docs/design/brand-kit-system/mini_page.jsx (Claude
 * Design source-of-truth). Visuals live in ./brand-kit.css under the
 * `.bk-scope` namespace; this component renders the structure + threads
 * the agent's three brand colors through CSS custom properties.
 *
 * INVERSION CONTRACT:
 *   - COLORS come from props (bg / text / accent), set as
 *     --m-bg / --m-text / --m-accent. Every other visible color is
 *     DERIVED from those three via color-mix in brand-kit.css (muted,
 *     faint, rules, the dark agent-footer card). No theme-baked colors.
 *   - LAYOUT / TYPOGRAPHY come from `themeId`. Only "editorial" exists
 *     today (serif headlines, magazine rhythm, serif numerals, dark
 *     footer). "studio" / "warm" fall back to editorial until those
 *     layouts are built (flagged Coming soon).
 *   - `scale` (default 1) scales the whole page; a ResizeObserver keeps
 *     the outer box sized to the scaled height so layout reserves real
 *     space.
 *
 * Canned content matches the design: Halloran family / 4427 Dudley Dr.
 * The hero photo, video, and avatar are CSS placeholders.
 */

const BASE_W = 360; // natural design width of the mini page

interface LayoutTokens {
  serif: boolean;
  /** Font stack for headline/price/numeral surfaces. */
  head: string;
  /** font-weight used for the recommended-price + area-stat numbers. */
  priceWeight: number;
}

// themeId -> layout/type tokens. Editorial is the only built layout.
// (Spectral in the design; this project's editorial serif is Instrument
// Serif, surfaced via the --serif token in brand-kit.css — the same
// serif the real /h/<slug> page renders, so the preview is truthful.)
const LAYOUTS: Record<string, LayoutTokens> = {
  editorial: {
    serif: true,
    head: "var(--serif)",
    priceWeight: 500,
  },
};

function layoutFor(themeId: string | undefined): LayoutTokens {
  return (themeId && LAYOUTS[themeId]) || LAYOUTS.editorial; // studio/warm -> editorial
}

function IconPlay({ s = 11 }: { s?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export interface MiniPageProps {
  bg: string;
  text: string;
  accent: string;
  /** E.0: only "editorial" is rendered; "studio"/"warm" fall back. */
  themeId?: string;
  /** Default 1; Settings uses 0.74. */
  scale?: number;
}

export function MiniPage({
  bg,
  text,
  accent,
  themeId = "editorial",
  scale = 1,
}: MiniPageProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  });

  const lay = layoutFor(themeId);
  const vars = {
    "--m-bg": bg,
    "--m-text": text,
    "--m-accent": accent,
    "--m-head": lay.head,
    "--m-price-weight": lay.priceWeight,
  } as React.CSSProperties;

  return (
    <div
      className="mini-scaler"
      style={{ width: BASE_W * scale, height: h * scale }}
      data-testid="brand-minipage-preview"
    >
      <div
        ref={innerRef}
        className={"mini" + (lay.serif ? " is-serif" : "")}
        style={{
          ...vars,
          width: BASE_W,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* hero */}
        <div className="m-hero">
          <div className="m-hero-photo" />
          <div className="m-hero-band">
            <span className="m-eyebrow on-dark">For the Halloran family</span>
            <span className="m-addr">4427 Dudley Dr NE</span>
            <span className="m-city">Tacoma, WA 98406</span>
          </div>
        </div>

        {/* recommended price */}
        <div className="m-sec">
          <span className="m-eyebrow on-accent">Recommended list</span>
          <div className="m-price">
            <span className="m-dollar">$</span>687,298
          </div>
          <div className="m-rule" />
          <span className="m-note">4 recent sales nearby anchor this number.</span>
        </div>

        {/* agent video note */}
        <div className="m-sec">
          <span className="m-eyebrow">A short note from your agent</span>
          <h4 className="m-head">
            Two <i>minutes</i>, on your home.
          </h4>
          <div className="m-video">
            <span className="m-play">
              <IconPlay s={11} />
            </span>
          </div>
        </div>

        {/* pitch list */}
        <div className="m-sec">
          <span className="m-eyebrow">What I&apos;ll do for you</span>
          <h4 className="m-head">
            A quiet, <i>thorough</i> way to sell.
          </h4>
          <ol className="m-list">
            <li>
              <span className="m-num">1</span>
              <span className="m-li">
                <b>Chef&apos;s kitchen</b>
                <span>Marble counters, brass pot filler</span>
              </span>
            </li>
            <li>
              <span className="m-num">2</span>
              <span className="m-li">
                <b>Lake views</b>
                <span>Five-minute walk to Clear Lake</span>
              </span>
            </li>
            <li>
              <span className="m-num">3</span>
              <span className="m-li">
                <b>Brand-new roof</b>
                <span>Installed last year</span>
              </span>
            </li>
          </ol>
          <a className="m-link" href="#">
            See the full plan
          </a>
        </div>

        {/* area stats */}
        <div className="m-sec">
          <span className="m-eyebrow">Recent area sales</span>
          <h4 className="m-head">
            A neighborhood that <i>moves</i>.
          </h4>
          <div className="m-stats">
            <div className="m-stat">
              <b>$675,202</b>
              <span>Median sold</span>
            </div>
            <div className="m-stat">
              <b>14</b>
              <span>Days on market</span>
            </div>
            <div className="m-stat">
              <b>37</b>
              <span>Sold this year</span>
            </div>
            <div className="m-stat">
              <b>101%</b>
              <span>Sale to list</span>
            </div>
          </div>
        </div>

        {/* agent footer */}
        <div className="m-foot">
          <span className="m-eyebrow on-dark">Your agent</span>
          <h4 className="m-foot-name">Aaron Thomas.</h4>
          <div className="m-foot-row">
            <div className="m-avatar" />
            <span className="m-li">
              <b>Aaron Thomas</b>
              <span>Thomas Realty</span>
            </span>
          </div>
          <div className="m-cta">Schedule a listing call</div>
          <div className="m-cta ghost">Call Aaron directly</div>
        </div>
      </div>
    </div>
  );
}
