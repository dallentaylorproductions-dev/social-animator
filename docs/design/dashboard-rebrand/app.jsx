// app.jsx
// SEP-S Dashboard — main shell.
// Composes: header, hero "up next" card, three workflow sections
// (Win → Launch → Stay visible), Social Studio modal, and Tweaks panel.

const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#5BF5C9",
  "background": "warm",
  "density": "comfy",
  "showStageDots": true,
  "marqueeSpeed": "normal"
}/*EDITMODE-END*/;

/* ─── Stage section header ──────────────────────────────────────────────── */

const StageHeader = ({ index, label, hint, stage }) => (
  <header className="stage-head" data-stage={stage}>
    <div className="stage-num">{String(index).padStart(2, '0')}</div>
    <div className="stage-text">
      <div className="stage-label">{label}</div>
      <div className="stage-hint">{hint}</div>
    </div>
    <div className="stage-rule" />
  </header>
);

/* ─── Social Studio modal ───────────────────────────────────────────────── */

const SocialStudioModal = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="modal-eyebrow">SOCIAL STUDIO</div>
            <h2 className="modal-title">Pick a template</h2>
            <p className="modal-sub">10 animated formats. All export as MP4, 9×16 and 1×1.</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-grid">
          {SOCIAL_TEMPLATES.map((t) => (
            <button key={t.id} className={`tmpl-card tint-${t.tint}`}>
              <div className="tmpl-preview">
                <SocialMini {...t} />
              </div>
              <div className="tmpl-foot">
                <div className="tmpl-name">{t.name}</div>
                <div className="tmpl-tag">MP4</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Toast (for non-Social tile clicks) ────────────────────────────────── */

const Toast = ({ message, onDone }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="toast">
      <span className="toast-dot" />
      {message}
    </div>
  );
};

/* ─── App ───────────────────────────────────────────────────────────────── */

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [studioOpen, setStudioOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const launch = (name) => setToast(`Launching ${name}…`);

  // Apply tweaks via CSS custom props on root.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', t.accent);
    root.dataset.bg = t.background;
    root.dataset.density = t.density;
    root.dataset.stagedots = t.showStageDots ? 'on' : 'off';
    const speeds = { slow: '60s', normal: '40s', fast: '24s' };
    root.style.setProperty('--marquee-dur', speeds[t.marqueeSpeed] || '40s');
  }, [t]);

  return (
    <div className="app">
      {/* Background ambient orbs */}
      <div className="ambient" aria-hidden>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <span className="brand-dot" />
          </span>
          <span className="brand-name">SIMPLY EDIT <span className="brand-pro">PRO STUDIO</span></span>
        </div>
        <nav className="topnav">
          <a href="#" className="topnav-link">Library</a>
          <a href="#" className="topnav-link">Brand kit</a>
          <a href="#" className="topnav-link">Settings</a>
          <span className="topnav-sep" />
          <a href="#" className="topnav-link topnav-quiet">Sign out</a>
        </nav>
      </header>

      <section className="welcome">
        <div className="welcome-left">
          <div className="welcome-eyebrow">
            <span className="live-dot" />
            DASHBOARD · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 className="welcome-title">
            Welcome back,<br />
            <span className="welcome-name">Dallen Taylor.</span>
          </h1>
          <p className="welcome-sub">Two listings active · One open house this weekend.</p>
        </div>
        <div className="welcome-stats">
          <div className="stat">
            <div className="stat-num">7</div>
            <div className="stat-lbl">Assets this week</div>
          </div>
          <div className="stat">
            <div className="stat-num">2</div>
            <div className="stat-lbl">Active listings</div>
          </div>
          <div className="stat">
            <div className="stat-num">1.4k</div>
            <div className="stat-lbl">Reel views, 30d</div>
          </div>
        </div>
      </section>

      <HeroNextAction
        onPrimary={() => launch('Listing Flyer Generator')}
        onSecondary={() => document.getElementById('stage-launch')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      {/* WIN ── seller-facing prep documents */}
      <section className="stage" id="stage-win">
        <StageHeader index={1} label="Win the listing" hint="Show up prepared. Close the appointment." stage="win" />
        <div className="grid grid-4">
          <Tile
            stage="win"
            title="Listing Presentation"
            blurb="Full seller-facing deck. Agent prep + premium presentation page."
            formats={['PDF', 'URL']}
            poster={<PresentationPoster />}
            onClick={() => launch('Seller Presentation')}
          />
          <Tile
            stage="win"
            title="Seller Intelligence"
            blurb="Your private prep — comps, talking points, pricing strategy."
            formats={['PDF']}
            poster={<IntelPoster />}
            onClick={() => launch('Seller Intelligence Report')}
          />
          <Tile
            stage="win"
            title="One-Pager"
            blurb="The doc you bring to the seller appointment to win it."
            formats={['PDF', 'JPEG']}
            poster={<DocPoster title="One-Pager" accent="mint" />}
            onClick={() => launch('Listing Presentation One-Pager')}
          />
          <Tile
            stage="win"
            title="Open House Prep"
            blurb="Day-of prep doc + sign-in URL so the open house actually converts."
            formats={['PDF', 'URL']}
            poster={<PrepPoster />}
            onClick={() => launch('Open House Prep')}
          />
        </div>
      </section>

      {/* LAUNCH ── marketing assets for new listings & open houses */}
      <section className="stage" id="stage-launch">
        <StageHeader index={2} label="Launch the marketing" hint="Branded assets, ready in a minute." stage="launch" />
        <div className="grid grid-2">
          <Tile
            stage="launch"
            size="md"
            title="Listing Flyer Generator"
            blurb="Branded marketing pack for a single listing — print-ready flyer + social cuts."
            formats={['PDF', 'JPEG', '2× MP4']}
            poster={<FlyerPoster />}
            onClick={() => launch('Listing Flyer Generator')}
          />
          <Tile
            stage="launch"
            size="md"
            title="Open House Promo"
            blurb="Event-day pack — printable flyer, social tiles, QR code for sign-ins."
            formats={['PDF', 'JPEG', '2× MP4', 'PNG']}
            poster={<OpenHousePoster />}
            onClick={() => launch('Open House Promo Generator')}
          />
        </div>
      </section>

      {/* STAY VISIBLE ── flagship Social Studio */}
      <section className="stage" id="stage-visibility">
        <StageHeader index={3} label="Stay visible" hint="Cadence content. One studio, ten formats." stage="visibility" />
        <SocialStudioTile onClick={() => setStudioOpen(true)} />
      </section>

      <footer className="bottom">
        <span>SEP-S v3.2 · Last asset generated 2h ago · 412 Bayview flyer</span>
        <a href="#" className="bottom-link">What&rsquo;s new →</a>
      </footer>

      <SocialStudioModal open={studioOpen} onClose={() => setStudioOpen(false)} />
      <Toast message={toast} onDone={() => setToast(null)} />

      <TweaksPanel>
        <TweakSection label="Accent" />
        <TweakColor
          label="Primary"
          value={t.accent}
          options={['#5BF5C9', '#FFB45B', '#7EB6FF', '#E1A5FF']}
          onChange={(v) => setTweak('accent', v)}
        />
        <TweakSection label="Atmosphere" />
        <TweakRadio
          label="Background"
          value={t.background}
          options={['warm', 'cool', 'true']}
          onChange={(v) => setTweak('background', v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['tight', 'comfy', 'roomy']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakToggle
          label="Show stage dots"
          value={t.showStageDots}
          onChange={(v) => setTweak('showStageDots', v)}
        />
        <TweakSection label="Social Studio" />
        <TweakRadio
          label="Marquee speed"
          value={t.marqueeSpeed}
          options={['slow', 'normal', 'fast']}
          onChange={(v) => setTweak('marqueeSpeed', v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
