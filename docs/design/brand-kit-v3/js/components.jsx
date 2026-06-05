/* components.jsx — calm-dark settings form pieces. */
(function () {
  const { useState, useRef, useEffect } = React;
  const CU = window.CU;

  /* ---- ColorField: swatch opens native picker; hex commits on blur/Enter -- */
  function ColorField({ value, onChange, testid, pickerTestid, label, hint, compact }) {
    const [draft, setDraft] = useState(value);
    const pickerRef = useRef(null);
    useEffect(() => { setDraft(value); }, [value]);

    const commit = () => {
      const norm = CU.normalizeHex(draft);
      if (norm) onChange(norm);
      else setDraft(value); // invalid reverts
    };

    return (
      <div className="cfield" data-testid={testid}>
        <button
          type="button"
          className="cfield__swatch"
          style={{ background: value }}
          aria-label={`${label} — open color picker`}
          onClick={() => pickerRef.current && pickerRef.current.click()}
        >
          <input
            ref={pickerRef}
            data-testid={pickerTestid}
            type="color"
            className="cfield__native"
            value={CU.normalizeHex(value) ? value.toLowerCase() : "#000000"}
            onChange={(e) => onChange(CU.normalizeHex(e.target.value))}
          />
        </button>
        <div className="cfield__body">
          {label ? <div className="cfield__label">{label}</div> : null}
          {hint && !compact ? <div className="cfield__hint">{hint}</div> : null}
        </div>
        <div className="cfield__hexwrap">
          <span className="cfield__hash">#</span>
          <input
            className="cfield__hex"
            value={draft.replace(/^#/, "")}
            spellCheck={false}
            onChange={(e) => setDraft("#" + e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
              if (e.key === "Escape") { setDraft(value); e.target.blur(); }
            }}
          />
        </div>
      </div>
    );
  }

  /* ---- Signature row + logo suggestions ----------------------------------- */
  function SignatureRow({ value, onChange, onReset, suggestions, logoPresent }) {
    return (
      <section className="block">
        <div className="block__head">
          <h3 className="block__title">Signature color</h3>
          <button type="button" className="link" onClick={onReset}>
            Reset
          </button>
        </div>
        <p className="block__sub">
          Your one brand color. Everything else is derived from it.
        </p>
        <ColorField
          value={value}
          onChange={onChange}
          testid="brand-color-accent"
          pickerTestid="brand-color-picker-accent"
          label="Signature"
        />

        <div className="suggest" data-testid="brand-logo-suggestions">
          {logoPresent && suggestions && suggestions.length > 0 ? (
            <>
              <div className="suggest__copy">
                {suggestions.length === 1
                  ? "We found this color in your logo."
                  : "Suggested from your logo."}
              </div>
              <div className="suggest__row">
                {suggestions.map((hex) => {
                  const active = CU.normalizeHex(hex) === CU.normalizeHex(value);
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={"suggest__chip" + (active ? " is-active" : "")}
                      style={{ background: hex }}
                      onClick={() => onChange(hex)}
                      title={`Apply ${hex.toUpperCase()}`}
                    >
                      {active ? <span className="suggest__tick">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="suggest__empty" data-testid="brand-logo-suggestions-empty">
              Upload a logo and we’ll suggest colors from it.{" "}
              <a className="link" href="#profile" onClick={(e) => e.preventDefault()}>
                Go to Profile
              </a>
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ---- Derived palette strip (read-only) ---------------------------------- */
  function PaletteStrip({ ramp }) {
    return (
      <section className="block">
        <div className="block__head">
          <h3 className="block__title">Derived palette</h3>
          <span className="block__tag">Read-only</span>
        </div>
        <p className="block__sub">Shades we generate from your signature for fills, hovers and text.</p>
        <div className="strip" data-testid="brand-palette-strip">
          {ramp.map((c, i) => (
            <div
              key={c.key}
              className="strip__chip"
              data-testid={`brand-palette-chip-${i}`}
              title={`${c.role} · ${c.hex}`}
            >
              <span className="strip__sw" style={{ background: c.hex }} />
              <span className="strip__role">{c.role}</span>
              <span className="strip__hex">{c.hex}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* ---- Page surface (collapsed disclosure) -------------------------------- */
  function SurfaceDisclosure({ bg, text, onBg, onText, open, setOpen }) {
    return (
      <section className="block">
        <button
          type="button"
          className="disc__head"
          data-testid="brand-surface-disclosure"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="disc__chev" style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
          <span className="block__title">Page surface</span>
          <span className="disc__preview">
            <span className="disc__dot" style={{ background: bg }} />
            <span className="disc__dot" style={{ background: text }} />
          </span>
          <span className="disc__hint">{open ? "Hide" : "Background & text"}</span>
        </button>
        {open ? (
          <div className="disc__body">
            <p className="block__sub" style={{ marginTop: 2 }}>
              The page’s own background and body text. Your layout owns these — adjust only if needed.
            </p>
            <ColorField
              value={bg}
              onChange={onBg}
              testid="brand-color-background"
              pickerTestid="brand-color-picker-background"
              label="Background"
              compact
            />
            <ColorField
              value={text}
              onChange={onText}
              testid="brand-color-text"
              pickerTestid="brand-color-picker-text"
              label="Body text"
              compact
            />
          </div>
        ) : null}
      </section>
    );
  }

  /* ---- Default layout ----------------------------------------------------- */
  function LayoutSelect({ value, onChange }) {
    const opts = [
      { id: "spotlight", name: "Spotlight", desc: "One listing, stacked" },
      { id: "grid", name: "Grid", desc: "Two-up cards" },
      { id: "list", name: "List", desc: "Thumb + details" },
    ];
    return (
      <section className="block">
        <div className="block__head">
          <h3 className="block__title">Default layout</h3>
        </div>
        <p className="block__sub">How new seller pages arrange listings.</p>
        <div className="layouts">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              className={"layout" + (value === o.id ? " is-active" : "")}
              onClick={() => onChange(o.id)}
            >
              <span className={"layout__glyph layout__glyph--" + o.id}>
                <i /><i /><i />
              </span>
              <span className="layout__name">{o.name}</span>
              <span className="layout__desc">{o.desc}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  Object.assign(window, { ColorField, SignatureRow, PaletteStrip, SurfaceDisclosure, LayoutSelect });
})();
