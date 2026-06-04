"use client";

import type { BrandVars } from "@/lib/brand/color-engine";

/**
 * MiniPage — brand-driven miniature seller page (Phase E.1, Brand kit v2).
 *
 * Recreated from docs/design/brand-unification/minipage.jsx (the role-
 * coverage reference). It is a faithful, miniaturised render of the
 * published /h/<slug> Editorial page: every brand role in the derived
 * ramp appears here exactly where it appears in production. Visuals live
 * in ./brand-kit.css under the `.bk-scope` namespace (the `.mp-*` block).
 *
 * COLOR CONTRACT (E.1):
 *   - Colors arrive as the resolved derived ramp — `vars` is
 *     `BrandEngine.derive(...).vars` (a `--signature` / `--tint-12` / …
 *     map). They are spread as inline CSS custom properties on the `.mp`
 *     root, so the whole page re-tones the instant the agent dials a
 *     color. No srgb color-mix on the live path; the engine resolved the
 *     AA-clamped hexes upstream.
 *   - Layout-owned surfaces (the cream canvas `--surface`, the dark agent
 *     band `--ink`, photo placeholders) are fixed and do NOT move with the
 *     brand color — they read from `--surface`/`--ink`, also in `vars`.
 *
 * Role map (matches the production seller page + palette strip):
 *   --signature       eyebrows, dots, badge, glyph, price rule, stat values
 *   --signature-deep  the big price numeral on the tint-12 panel
 *   --signature-link  the "See the full plan" body link
 *   --tint-12         price panel fill        --tint-6   stat-card fills
 *   --line-30         list dividers + stat grid lines
 *   --on-signature    label/glyph on signature fills (play button, CTA)
 *   --decorative      plan numerals + end-mark (secondary when set)
 *
 * Canned content matches the design: Halloran family / 4427 Dudley Dr.
 * The hero photo, video, and avatar are CSS placeholders.
 *
 * studio/warm fall back to the Editorial layout (only one built today),
 * so `themeId` does not branch the structure — it is accepted for API
 * parity with the seller-page renderer and the form's default-layout
 * select.
 */

export interface MiniPageProps {
  /** Resolved derived ramp from `BrandEngine.derive(...).vars`. */
  vars: BrandVars;
  /** E.1: only "editorial" is rendered; "studio"/"warm" fall back. */
  themeId?: string;
}

function Eyebrow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "signature";
}) {
  return (
    <div className={"mp-eyebrow" + (tone === "signature" ? " is-sig" : "")}>
      {children}
    </div>
  );
}

function PhotoSlot({ label, tall }: { label: string; tall?: boolean }) {
  return (
    <div className={"mp-photo" + (tall ? " is-tall" : "")} aria-hidden="true">
      <span className="mp-photo__tag">{label}</span>
    </div>
  );
}

export function MiniPage({ vars }: MiniPageProps) {
  return (
    <div
      className="mp"
      data-testid="brand-minipage-preview"
      style={vars as React.CSSProperties}
    >
      {/* HERO — layout-owned photo + dark scrim, on-dark eyebrow (the
          on-photo rule: signature text never sits on photo content) */}
      <div className="mp-hero">
        <PhotoSlot label="hero photo" tall />
        <div className="mp-hero__scrim">
          <Eyebrow>For the Halloran family</Eyebrow>
          <h1 className="mp-display mp-hero__addr">4427 Dudley Dr NE</h1>
          <div className="mp-meta">
            Tacoma, WA 98406 <span className="mp-dot">•</span> 4 bd{" "}
            <span className="mp-dot">•</span> 3 ba
          </div>
        </div>
      </div>

      <div className="mp-body">
        {/* PRICE — tint-12 panel, signature-deep numerals, signature rule */}
        <section className="mp-sec">
          <Eyebrow tone="signature">Recommended list</Eyebrow>
          <div className="mp-price-panel">
            <div className="mp-price">
              <span className="mp-price__cur">$</span>687,298
            </div>
            <div className="mp-rule" />
            <p className="mp-note">
              <em>4 recent sales nearby anchor this number.</em>
            </p>
          </div>
        </section>

        {/* NOTE + video — on-signature play button */}
        <section className="mp-sec">
          <Eyebrow>A short note from your agent</Eyebrow>
          <h2 className="mp-display mp-h2">
            Two <em>minutes</em>, on your home.
          </h2>
          <div className="mp-video">
            <PhotoSlot label="walkthrough" />
            <span className="mp-play" aria-hidden="true">
              ▶
            </span>
          </div>
        </section>

        {/* PLAN — decorative numerals (secondary when set, else signature),
            line-30 dividers, signature-link "See the full plan" */}
        <section className="mp-sec">
          <Eyebrow>What I&apos;ll do for you</Eyebrow>
          <h2 className="mp-display mp-h2">
            A quiet, <em>thorough</em> way to sell.
          </h2>
          <ol className="mp-list">
            <li>
              <span className="mp-num">1</span>
              <div>
                <b>Chef&apos;s kitchen</b>
                <span>Marble counters, brass pot filler</span>
              </div>
            </li>
            <li>
              <span className="mp-num">2</span>
              <div>
                <b>Lake views</b>
                <span>Five-minute walk to Clear Lake</span>
              </div>
            </li>
            <li>
              <span className="mp-num">3</span>
              <div>
                <b>Brand-new roof</b>
                <span>Installed last year</span>
              </div>
            </li>
          </ol>
          <a className="mp-link" href="#">
            See the full plan
          </a>
        </section>

        {/* END-MARK — centered decorative glyph */}
        <div className="mp-endmark" aria-hidden="true">
          ◆
        </div>

        {/* STATS — tint-6 cards on a line-30 grid, signature values */}
        <section className="mp-sec">
          <Eyebrow>Recent area sales</Eyebrow>
          <h2 className="mp-display mp-h2">
            A neighborhood that <em>moves</em>.
          </h2>
          <div className="mp-stats">
            <div className="mp-stat">
              <div className="mp-stat__v">$675,202</div>
              <div className="mp-stat__l">Median sold</div>
            </div>
            <div className="mp-stat">
              <div className="mp-stat__v">14</div>
              <div className="mp-stat__l">Days on market</div>
            </div>
            <div className="mp-stat">
              <div className="mp-stat__v">37</div>
              <div className="mp-stat__l">Sold this year</div>
            </div>
            <div className="mp-stat">
              <div className="mp-stat__v">101%</div>
              <div className="mp-stat__l">Sale to list</div>
            </div>
          </div>
        </section>
      </div>

      {/* AGENT — layout-owned deep band, on-signature CTA, signature badge */}
      <div className="mp-agent">
        <Eyebrow tone="signature">Your agent</Eyebrow>
        <h2 className="mp-display mp-agent__name">Aaron Thomas.</h2>
        <div className="mp-agent__card">
          <span className="mp-avatar" aria-hidden="true" />
          <div>
            <b>Aaron Thomas</b>
            <span>
              Thomas Realty{" "}
              <span className="mp-badge" aria-hidden="true">
                ✓
              </span>
            </span>
          </div>
        </div>
        <button type="button" className="mp-cta">
          Schedule a listing call
        </button>
        <button type="button" className="mp-cta is-ghost">
          Call Aaron directly
        </button>
        <div className="mp-foot">
          <span className="mp-glyph" aria-hidden="true">
            ◆
          </span>{" "}
          Thomas Realty
        </div>
      </div>
    </div>
  );
}
