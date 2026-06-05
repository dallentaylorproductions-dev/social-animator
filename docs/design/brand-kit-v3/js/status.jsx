/* status.jsx — readability verdict, brand-ready state, save/scope footer,
   and the conditional existing-secondary line. */
(function () {
  const { useState } = React;
  const CU = window.CU;

  /* ---- Readability -------------------------------------------------------
     Collapses to "all clear" when every check passes with no clamp.
     Stays expanded as a warning when a check fails. Truthful copy: only
     say "adjusted" when the clamp actually changed something. */
  function Readability({ signature, pageBg, pageText }) {
    const [open, setOpen] = useState(false);

    const bodyRatio = CU.contrast(pageText, pageBg);
    const bodyPass = bodyRatio >= 4.5;
    const accent = CU.accentOnSurface(signature, pageBg); // links/eyebrows
    const buttonInk = CU.readableInk(signature);
    const buttonRatio = CU.contrast(buttonInk, signature);

    const checks = [
      {
        label: "Body text on page background",
        ratio: bodyRatio,
        pass: bodyPass,
        note: bodyPass ? null : "Pick a darker text or lighter background.",
      },
      {
        label: "Brand color as on-page text & links",
        ratio: accent.ratio,
        pass: true,
        // truthful: only flagged "adjusted" when the clamp moved it
        adjusted: accent.adjusted,
      },
      {
        label: "Button label on brand fill",
        ratio: buttonRatio,
        pass: buttonRatio >= 4.5,
      },
    ];

    const allPass = checks.every((c) => c.pass);
    const anyAdjusted = checks.some((c) => c.adjusted);

    // Warning state = something fails → force expanded.
    const isWarning = !allPass;
    const expanded = isWarning || open;

    return (
      <section className={"readab" + (isWarning ? " is-warn" : " is-ok")}>
        <button
          type="button"
          className="readab__head"
          data-testid="brand-readability-verdict"
          aria-expanded={expanded}
          onClick={() => { if (!isWarning) setOpen(!open); }}
        >
          <span className="readab__mark">{isWarning ? "!" : "✓"}</span>
          <span className="readab__verdict">
            {isWarning ? (
              <>
                <strong>Readability needs a look</strong>
                <span>Some page text may be hard to read.</span>
              </>
            ) : (
              <>
                <strong>Readability all clear</strong>
                <span>Your page text passes contrast checks.</span>
              </>
            )}
          </span>
          {!isWarning ? (
            <span className="readab__toggle">{open ? "Hide details" : "View details"}</span>
          ) : null}
        </button>

        {expanded ? (
          <div className="readab__body" data-testid="brand-readability-fixes">
            <ul className="readab__list">
              {checks.map((c, i) => (
                <li key={i} className={"readab__item" + (c.pass ? "" : " is-fail")}>
                  <span className="readab__dot" aria-hidden="true" />
                  <span className="readab__itemlabel">
                    {c.label}
                    {c.adjusted ? (
                      <span className="readab__adjusted">adjusted to stay readable</span>
                    ) : null}
                  </span>
                  <span className="readab__ratio">{c.ratio.toFixed(1)}:1</span>
                </li>
              ))}
            </ul>
            {isWarning ? (
              <p className="readab__fix">
                Your page background and body text are too close in contrast. Adjust them under
                <strong> Page surface</strong> above — saving still works either way.
              </p>
            ) : anyAdjusted ? (
              <p className="readab__fix readab__fix--quiet">
                Where your color sat too light to read, we used a deeper shade from your derived
                palette for text and links. Fills and the signature swatch are untouched.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  /* ---- Brand ready -------------------------------------------------------- */
  function BrandReady({ complete }) {
    return (
      <section className={"ready" + (complete ? " is-complete" : " is-incomplete")}>
        <span className="ready__mark">{complete ? "✓" : ""}</span>
        <div className="ready__body">
          {complete ? (
            <>
              <strong>Brand ready</strong>
              <span>Your color, logo, and page contrast are set for seller pages.</span>
            </>
          ) : (
            <>
              <strong>Almost ready</strong>
              <span>
                Add your agent name and logo so seller pages feel complete.{" "}
                <a className="link" href="#profile" onClick={(e) => e.preventDefault()}>
                  Go to Profile
                </a>
              </span>
            </>
          )}
        </div>
      </section>
    );
  }

  /* ---- Save + scope, read at the moment of change ------------------------- */
  function SaveScope({ state }) {
    return (
      <div className="save">
        <div className="save__row" data-testid="brand-autosave-indicator">
          <span className={"save__spin save--" + state}>
            {state === "saving" ? "" : "✓"}
          </span>
          <span className="save__label">
            {state === "saving" ? "Saving…" : "Saved automatically."}
          </span>
        </div>
        <p className="save__scope">
          Existing published pages keep their original colors. New publishes use your latest brand.
        </p>
      </div>
    );
  }

  /* ---- Conditional: a secondary value was saved by an earlier template ---- */
  function SecondarySaved() {
    return (
      <div className="secondary" data-testid="brand-secondary-saved">
        Secondary color saved for future templates.
      </div>
    );
  }

  Object.assign(window, { Readability, BrandReady, SaveScope, SecondarySaved });
})();
