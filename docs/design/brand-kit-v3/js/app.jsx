/* app.jsx — assembles the Brand kit v3 settings screen. */
(function () {
  const { useState, useRef, useEffect, useMemo } = React;
  const CU = window.CU;
  const {
    SignatureRow, PaletteStrip, SurfaceDisclosure, LayoutSelect,
    Readability, BrandReady, SaveScope, SecondarySaved, MiniPage,
  } = window;

  const DEFAULT_SIGNATURE = "#C26A4E";
  // Colors "extracted" from the uploaded logo (mock). Excludes B/W/gray.
  const LOGO_SUGGESTIONS = ["#C26A4E", "#2F6B5C", "#CDA13C"];

  function Seg({ label, value, onChange, options }) {
    return (
      <label className="seg">
        <span className="seg__label">{label}</span>
        <span className="seg__track">
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              className={"seg__btn" + (value === o.v ? " is-on" : "")}
              onClick={() => onChange(o.v)}
            >
              {o.t}
            </button>
          ))}
        </span>
      </label>
    );
  }

  function App() {
    // ---- real brand settings ----
    const [signature, setSignature] = useState(DEFAULT_SIGNATURE);
    const [pageBg, setPageBg] = useState("#F1EBE0");
    const [pageText, setPageText] = useState("#1A1612");
    const [layout, setLayout] = useState("spotlight");
    const [surfaceOpen, setSurfaceOpen] = useState(false);

    // ---- mock / conditional states ----
    const [viewport, setViewport] = useState("desktop");
    const [logoPresent, setLogoPresent] = useState(true);
    const [hasName, setHasName] = useState(true);
    const [secondarySaved, setSecondarySaved] = useState(false);
    const [readDemo, setReadDemo] = useState("pass");

    // ---- autosave (never on mount) ----
    const [saveState, setSaveState] = useState("saved");
    const mounted = useRef(false);
    const timer = useRef(null);
    useEffect(() => {
      if (!mounted.current) { mounted.current = true; return; }
      setSaveState("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaveState("saved"), 650);
      return () => clearTimeout(timer.current);
    }, [signature, pageBg, pageText, layout]);

    const agentName = hasName ? "Riese & Co." : null;
    const ramp = useMemo(() => CU.deriveRamp(signature), [signature]);
    const suggestions = logoPresent ? LOGO_SUGGESTIONS : [];

    // readability demo swaps page text to a low-contrast value
    const goodText = useRef("#1A1612");
    const applyReadDemo = (mode) => {
      setReadDemo(mode);
      if (mode === "warning") { goodText.current = pageText; setPageText("#BBB3A8"); }
      else setPageText(goodText.current);
    };
    // keep goodText fresh when user edits in pass mode
    useEffect(() => { if (readDemo === "pass") goodText.current = pageText; }, [pageText, readDemo]);

    // Decided: a contrast warning is advisory only — render-time clamps keep
    // published pages readable — so it does NOT downgrade Brand ready.
    const brandComplete = logoPresent && !!agentName;

    const openSample = () => {
      const q = new URLSearchParams({
        accent: signature, bg: pageBg, text: pageText, layout,
        agent: agentName || "", logo: logoPresent ? "1" : "0",
      });
      window.open("sample_page.html?" + q.toString(), "_blank", "noopener");
    };

    const form = (
      <div className="form">
        <SignatureRow
          value={signature}
          onChange={setSignature}
          onReset={() => setSignature(DEFAULT_SIGNATURE)}
          suggestions={suggestions}
          logoPresent={logoPresent}
        />
        {secondarySaved ? <SecondarySaved /> : null}
        <PaletteStrip ramp={ramp} />
        <SurfaceDisclosure
          bg={pageBg} text={pageText}
          onBg={setPageBg} onText={setPageText}
          open={surfaceOpen} setOpen={setSurfaceOpen}
        />
        <LayoutSelect value={layout} onChange={setLayout} />
        <Readability signature={signature} pageBg={pageBg} pageText={pageText} />
        <BrandReady complete={brandComplete} />
        <SaveScope state={saveState} />
      </div>
    );

    const preview = (
      <div className="previewcol">
        <div className="previewcol__cap">Live preview · seller page</div>
        <div className="phone">
          <div className="phone__notch" />
          <div className="phone__screen">
            <MiniPage
              signature={signature} pageBg={pageBg} pageText={pageText}
              layout={layout} agentName={agentName} logoPresent={logoPresent}
            />
          </div>
        </div>
        <button type="button" className="samplebtn" onClick={openSample}>
          <span>Open full sample page</span>
          <span className="samplebtn__ext">↗</span>
        </button>
        <p className="previewcol__note">Opens a full-length sample page in your current colors.</p>
      </div>
    );

    return (
      <div className="root">
        {/* mock scaffolding — not part of the product UI */}
        <div className="mockbar">
          <span className="mockbar__tag">Mock states</span>
          <Seg label="Viewport" value={viewport} onChange={setViewport}
            options={[{ v: "desktop", t: "Desktop" }, { v: "mobile", t: "Mobile" }]} />
          <Seg label="Logo in profile" value={logoPresent ? "on" : "off"} onChange={(v) => setLogoPresent(v === "on")}
            options={[{ v: "on", t: "Yes" }, { v: "off", t: "No" }]} />
          <Seg label="Agent name" value={hasName ? "on" : "off"} onChange={(v) => setHasName(v === "on")}
            options={[{ v: "on", t: "Yes" }, { v: "off", t: "No" }]} />
          <Seg label="Secondary saved" value={secondarySaved ? "on" : "off"} onChange={(v) => setSecondarySaved(v === "on")}
            options={[{ v: "off", t: "No" }, { v: "on", t: "Yes" }]} />
          <Seg label="Readability" value={readDemo} onChange={applyReadDemo}
            options={[{ v: "pass", t: "Pass" }, { v: "warning", t: "Warn" }]} />
        </div>

        <div className={"shell shell--" + viewport}>
          <header className="hd">
            <div className="hd__eyebrow">Settings · Brand</div>
            <h1 className="hd__title">Brand kit</h1>
            <p className="hd__sub">
              Set one signature color. We derive the rest and check your pages stay readable.
            </p>
          </header>

          {viewport === "desktop" ? (
            <div className="cols">
              <div className="cols__form">{form}</div>
              <div className="cols__preview">{preview}</div>
            </div>
          ) : (
            <div className="stack">
              {preview}
              {form}
            </div>
          )}
        </div>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
})();
