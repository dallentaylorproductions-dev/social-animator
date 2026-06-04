/* ============================================================================
 * minipage.jsx — live MiniPage preview (Editorial layout)
 * ----------------------------------------------------------------------------
 * A faithful, miniaturised render of the published /h/<slug> seller page. It is
 * the reference implementation for role coverage: every brand role in the ramp
 * appears here exactly where it appears in production. Layout-owned surfaces
 * (cream canvas, dark agent band, photo treatments) are fixed and do NOT move
 * with the brand color.
 *
 * Colors arrive as CSS custom properties on the root (.mp), set by the host.
 * ========================================================================== */
(function () {
  function Eyebrow({ children, tone }) {
    return <div className={'mp-eyebrow' + (tone === 'signature' ? ' is-sig' : '')}>{children}</div>;
  }

  function PhotoSlot({ label, tall }) {
    return (
      <div className={'mp-photo' + (tall ? ' is-tall' : '')} aria-hidden="true">
        <span className="mp-photo__tag">{label}</span>
      </div>
    );
  }

  function MiniPage() {
    return (
      <div className="mp" data-testid="brand-minipage-preview">
        {/* HERO — layout-owned photo + dark scrim, signature eyebrow */}
        <div className="mp-hero">
          <PhotoSlot label="hero photo" tall />
          <div className="mp-hero__scrim">
            <Eyebrow>For the Halloran family</Eyebrow>
            <h1 className="mp-display mp-hero__addr">4427 Dudley Dr NE</h1>
            <div className="mp-meta">Tacoma, WA 98406 <span className="mp-dot">•</span> 4 bd <span className="mp-dot">•</span> 3 ba</div>
          </div>
        </div>

        <div className="mp-body">
          {/* PRICE — tint-12 panel, signature-deep numerals */}
          <section className="mp-sec">
            <Eyebrow tone="signature">Recommended list</Eyebrow>
            <div className="mp-price-panel">
              <div className="mp-price"><span className="mp-price__cur">$</span>687,298</div>
              <div className="mp-rule"></div>
              <p className="mp-note"><em>4 recent sales nearby anchor this number.</em></p>
            </div>
          </section>

          {/* NOTE + video — signature play button */}
          <section className="mp-sec">
            <Eyebrow>A short note from your agent</Eyebrow>
            <h2 className="mp-display mp-h2">Two <em>minutes</em>, on your home.</h2>
            <div className="mp-video">
              <PhotoSlot label="walkthrough" />
              <span className="mp-play" aria-hidden="true">▶</span>
            </div>
          </section>

          {/* PLAN — decorative numerals (secondary when set, else signature) */}
          <section className="mp-sec">
            <Eyebrow>What I'll do for you</Eyebrow>
            <h2 className="mp-display mp-h2">A quiet, <em>thorough</em> way to sell.</h2>
            <ol className="mp-list">
              <li><span className="mp-num">1</span><div><b>Chef's kitchen</b><span>Marble counters, brass pot filler</span></div></li>
              <li><span className="mp-num">2</span><div><b>Lake views</b><span>Five-minute walk to Clear Lake</span></div></li>
              <li><span className="mp-num">3</span><div><b>Brand-new roof</b><span>Installed last year</span></div></li>
            </ol>
            <a className="mp-link" href="#">See the full plan</a>
          </section>

          {/* STATS — tint-6 cards, signature values, line-30 rules */}
          <section className="mp-sec">
            <Eyebrow>Recent area sales</Eyebrow>
            <h2 className="mp-display mp-h2">A neighborhood that <em>moves</em>.</h2>
            <div className="mp-stats">
              <div className="mp-stat"><div className="mp-stat__v">$675,202</div><div className="mp-stat__l">Median sold</div></div>
              <div className="mp-stat"><div className="mp-stat__v">14</div><div className="mp-stat__l">Days on market</div></div>
              <div className="mp-stat"><div className="mp-stat__v">37</div><div className="mp-stat__l">Sold this year</div></div>
              <div className="mp-stat"><div className="mp-stat__v">101%</div><div className="mp-stat__l">Sale to list</div></div>
            </div>
          </section>
        </div>

        {/* AGENT — layout-owned deep band, on-signature CTA */}
        <div className="mp-agent">
          <Eyebrow tone="signature">Your agent</Eyebrow>
          <h2 className="mp-display mp-agent__name">Aaron Thomas.</h2>
          <div className="mp-agent__card">
            <span className="mp-avatar" aria-hidden="true"></span>
            <div>
              <b>Aaron Thomas</b>
              <span>Thomas Realty <span className="mp-badge" aria-hidden="true">✓</span></span>
            </div>
          </div>
          <button className="mp-cta">Schedule a listing call</button>
          <button className="mp-cta is-ghost">Call Aaron directly</button>
          <div className="mp-foot"><span className="mp-glyph" aria-hidden="true">◆</span> Thomas Realty</div>
        </div>
      </div>
    );
  }

  window.MiniPage = MiniPage;
})();
