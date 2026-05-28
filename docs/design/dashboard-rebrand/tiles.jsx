// tiles.jsx
// Tile + poster preview components for the SEP-S dashboard.
// Each tool gets a custom mini "poster" that previews the actual output —
// so agents can see what they get instead of guessing from a label.

/* ─── shared bits ───────────────────────────────────────────────────────── */

const FormatChip = ({ label }) => (
  <span className="fmt-chip">{label}</span>
);

const FormatChips = ({ formats }) => (
  <div className="fmt-row">
    {formats.map((f) => <FormatChip key={f} label={f} />)}
  </div>
);

const StageDot = ({ stage }) => {
  const colors = {
    win:        'var(--stage-win)',
    launch:     'var(--stage-launch)',
    visibility: 'var(--stage-visibility)',
  };
  return <span className="stage-dot" style={{ background: colors[stage] }} />;
};

/* ─── tile shell ────────────────────────────────────────────────────────── */

const Tile = ({ stage, title, blurb, formats, poster, size = 'sm', onClick }) => {
  return (
    <button className={`tile tile-${size}`} onClick={onClick}>
      <div className="tile-poster">{poster}</div>
      <div className="tile-body">
        <div className="tile-meta">
          <StageDot stage={stage} />
          <FormatChips formats={formats} />
        </div>
        <h3 className="tile-title">{title}</h3>
        <p className="tile-blurb">{blurb}</p>
      </div>
      <span className="tile-cta" aria-hidden>Open →</span>
    </button>
  );
};

/* ─── poster building blocks ────────────────────────────────────────────── */

// Generic "photo would go here" block — striped placeholder with mono label.
const PhotoBlock = ({ label = 'PROPERTY PHOTO', height = '100%', tint = 'cool' }) => {
  const tints = {
    cool: 'linear-gradient(135deg, oklch(0.42 0.04 230) 0%, oklch(0.32 0.03 250) 100%)',
    warm: 'linear-gradient(135deg, oklch(0.45 0.05 60) 0%, oklch(0.34 0.04 40) 100%)',
    mint: 'linear-gradient(135deg, oklch(0.55 0.10 175) 0%, oklch(0.38 0.08 190) 100%)',
    rose: 'linear-gradient(135deg, oklch(0.48 0.08 20) 0%, oklch(0.35 0.06 10) 100%)',
  };
  return (
    <div className="photo-block" style={{ background: tints[tint], height }}>
      <div className="photo-stripes" />
      <span className="photo-label">{label}</span>
    </div>
  );
};

const LineGroup = ({ lines = 3, widths = ['100%', '85%', '60%'] }) => (
  <div className="line-group">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="line" style={{ width: widths[i % widths.length] }} />
    ))}
  </div>
);

/* ─── posters ───────────────────────────────────────────────────────────── */

const FlyerPoster = () => (
  <div className="poster poster-flyer">
    <div className="flyer-page">
      <div className="flyer-header">
        <span className="flyer-eyebrow">JUST LISTED</span>
        <span className="flyer-price">$1.24M</span>
      </div>
      <PhotoBlock label="HERO SHOT" tint="cool" height="58%" />
      <div className="flyer-foot">
        <div>
          <div className="flyer-addr">412 Bayview Ave</div>
          <div className="flyer-sub">3 BD · 2 BA · 1,840 sqft</div>
        </div>
        <div className="flyer-agent" />
      </div>
    </div>
  </div>
);

const OpenHousePoster = () => (
  <div className="poster poster-openhouse">
    <div className="flyer-page">
      <div className="flyer-header">
        <span className="flyer-eyebrow oh">OPEN SAT</span>
        <span className="flyer-price">1–3 PM</span>
      </div>
      <PhotoBlock label="EXTERIOR" tint="warm" height="52%" />
      <div className="flyer-foot">
        <div>
          <div className="flyer-addr">88 Cedar Ln</div>
          <div className="flyer-sub">Refreshments · Tours</div>
        </div>
        <div className="qr-block">
          <div className="qr-grid">
            {Array.from({ length: 25 }).map((_, i) => (
              <span key={i} style={{ background: Math.random() > 0.45 ? '#111' : 'transparent' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DocPoster = ({ title = 'Listing Presentation', accent = 'cool' }) => (
  <div className="poster poster-doc">
    <div className="doc-page">
      <div className="doc-corner" />
      <div className="doc-head">
        <div className="doc-eyebrow">PREPARED FOR</div>
        <div className="doc-title">{title}</div>
      </div>
      <PhotoBlock label="LISTING" tint={accent} height="42%" />
      <LineGroup lines={4} widths={['100%', '90%', '70%', '95%']} />
    </div>
  </div>
);

const IntelPoster = () => (
  <div className="poster poster-intel">
    <div className="doc-page">
      <div className="doc-head">
        <div className="doc-eyebrow">SELLER INTEL</div>
        <div className="doc-title">Comps & Pricing</div>
      </div>
      <div className="intel-chart">
        {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
          <span key={i} className="bar" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="intel-table">
        <div className="intel-row"><span /><span /><span /></div>
        <div className="intel-row"><span /><span /><span /></div>
        <div className="intel-row"><span /><span /><span /></div>
      </div>
    </div>
  </div>
);

const PrepPoster = () => (
  <div className="poster poster-prep">
    <div className="doc-page">
      <div className="doc-head">
        <div className="doc-eyebrow">OPEN HOUSE</div>
        <div className="doc-title">Day-of Prep</div>
      </div>
      <ul className="checklist">
        {['Sign placement', 'Refreshments', 'Sign-in QR', 'Lighting', 'Talking points'].map((it, i) => (
          <li key={it}>
            <span className={`check ${i < 2 ? 'done' : ''}`} />
            <span className="check-label">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const PresentationPoster = () => (
  <div className="poster poster-pres">
    <div className="slide-stack">
      <div className="slide slide-back">
        <PhotoBlock label="" tint="cool" height="100%" />
      </div>
      <div className="slide slide-mid">
        <div className="slide-mini-head">
          <div className="slide-mini-dot" />
          <div className="slide-mini-bar" />
        </div>
        <LineGroup lines={3} widths={['100%', '80%', '50%']} />
      </div>
      <div className="slide slide-front">
        <div className="slide-front-head">
          <span className="slide-eyebrow">SELLER PRESENTATION</span>
          <span className="slide-num">01 / 12</span>
        </div>
        <div className="slide-front-title">Why list with us</div>
        <PhotoBlock label="HERO" tint="mint" height="48%" />
      </div>
    </div>
  </div>
);

/* ─── Social Studio: the flagship marquee tile ──────────────────────────── */

const SOCIAL_TEMPLATES = [
  { id: 'qa',         name: 'Q&A Card',          tint: 'cool',  kind: 'qa' },
  { id: 'listing',    name: 'Listing Card',      tint: 'mint',  kind: 'listing' },
  { id: 'showcase',   name: 'Listing Showcase',  tint: 'warm',  kind: 'showcase' },
  { id: 'carousel',   name: 'Listing Carousel',  tint: 'cool',  kind: 'carousel' },
  { id: 'beforeafter',name: 'Before / After',    tint: 'rose',  kind: 'beforeafter' },
  { id: 'testimonial',name: 'Testimonial',       tint: 'mint',  kind: 'testimonial' },
  { id: 'numbered',   name: 'Numbered Process',  tint: 'warm',  kind: 'numbered' },
  { id: 'grid',       name: 'Grid Comparison',   tint: 'cool',  kind: 'grid' },
  { id: 'stat',       name: 'Stat Highlight',    tint: 'mint',  kind: 'stat' },
  { id: 'market',     name: 'Market Update',     tint: 'rose',  kind: 'market' },
];

const SocialMini = ({ kind, name, tint }) => {
  // Each social template mini-preview is a unique tiny composition.
  const renderInner = () => {
    switch (kind) {
      case 'qa':
        return (
          <div className="mini-qa">
            <span className="mini-q">Q</span>
            <div className="mini-bars">
              <span /><span style={{ width: '60%' }} />
            </div>
          </div>
        );
      case 'listing':
        return (
          <div className="mini-listing">
            <PhotoBlock label="" tint={tint} height="62%" />
            <div className="mini-price">$1.24M</div>
          </div>
        );
      case 'showcase':
        return (
          <div className="mini-showcase">
            <PhotoBlock label="" tint={tint} height="100%" />
            <div className="mini-play" />
          </div>
        );
      case 'carousel':
        return (
          <div className="mini-carousel">
            <span /><span /><span />
          </div>
        );
      case 'beforeafter':
        return (
          <div className="mini-ba">
            <div className="mini-ba-l" />
            <div className="mini-ba-r" />
            <div className="mini-ba-line" />
          </div>
        );
      case 'testimonial':
        return (
          <div className="mini-test">
            <div className="mini-stars">★★★★★</div>
            <div className="mini-bars"><span /><span style={{ width: '80%' }} /><span style={{ width: '50%' }} /></div>
          </div>
        );
      case 'numbered':
        return (
          <div className="mini-num">
            {[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}
          </div>
        );
      case 'grid':
        return (
          <div className="mini-grid">
            <span /><span /><span /><span />
          </div>
        );
      case 'stat':
        return (
          <div className="mini-stat">
            <div className="mini-stat-num">42%</div>
            <div className="mini-bars"><span style={{ width: '70%' }} /></div>
          </div>
        );
      case 'market':
        return (
          <div className="mini-market">
            <div className="mini-spark">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                <polyline points="0,22 14,18 28,20 42,12 56,14 70,8 84,10 100,4"
                          fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <div className="mini-bars"><span style={{ width: '40%' }} /></div>
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <div className={`social-mini tint-${tint}`}>
      <div className="social-mini-inner">{renderInner()}</div>
      <div className="social-mini-name">{name}</div>
    </div>
  );
};

const SocialStudioTile = ({ onClick }) => {
  // Duplicate the row so the marquee can loop seamlessly.
  const row = [...SOCIAL_TEMPLATES, ...SOCIAL_TEMPLATES];
  return (
    <button className="tile tile-flagship" onClick={onClick}>
      <div className="flagship-poster">
        <div className="marquee">
          <div className="marquee-track">
            {row.map((t, i) => <SocialMini key={`${t.id}-${i}`} {...t} />)}
          </div>
        </div>
        <div className="marquee-fade-l" />
        <div className="marquee-fade-r" />
      </div>
      <div className="flagship-body">
        <div className="tile-meta">
          <StageDot stage="visibility" />
          <FormatChips formats={['MP4', '10 TEMPLATES']} />
        </div>
        <div className="flagship-headline">
          <h3 className="tile-title flagship-title">Social Studio</h3>
          <span className="tile-cta flagship-cta">Open studio →</span>
        </div>
        <p className="tile-blurb flagship-blurb">
          Ten animated social templates — Q&amp;A, Listing Card, Carousel, Before/After,
          Stat, Market Update and more — all in one studio.
        </p>
      </div>
    </button>
  );
};

/* ─── Hero "Up next" card ───────────────────────────────────────────────── */

const HeroNextAction = ({ onPrimary, onSecondary }) => (
  <div className="hero-card">
    <div className="hero-left">
      <div className="hero-eyebrow">
        <span className="hero-dot" />
        UP NEXT · BASED ON YOUR ACTIVITY
      </div>
      <h2 className="hero-title">Launch your new listing at 412 Bayview.</h2>
      <p className="hero-sub">
        You added a listing 2 days ago and haven&rsquo;t generated marketing yet.
        Start with a flyer, then schedule a showcase reel for Friday.
      </p>
      <div className="hero-actions">
        <button className="btn btn-primary" onClick={onPrimary}>
          Generate Listing Flyer
          <span className="btn-arrow">→</span>
        </button>
        <button className="btn btn-ghost" onClick={onSecondary}>
          Skip · pick another tool
        </button>
      </div>
      <div className="hero-after">
        <span className="hero-after-label">Then queue</span>
        <span className="hero-chip">Listing Showcase Reel</span>
        <span className="hero-chip">Open House Promo</span>
      </div>
    </div>
    <div className="hero-right">
      <div className="hero-poster-wrap">
        <FlyerPoster />
        <div className="hero-poster-tag">PREVIEW · YOUR OUTPUT</div>
      </div>
    </div>
  </div>
);

/* ─── exports ───────────────────────────────────────────────────────────── */

Object.assign(window, {
  Tile,
  HeroNextAction,
  SocialStudioTile,
  FlyerPoster,
  OpenHousePoster,
  DocPoster,
  IntelPoster,
  PrepPoster,
  PresentationPoster,
  SOCIAL_TEMPLATES,
  SocialMini,
});
