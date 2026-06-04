/* ============================================================================
 * palette_strip.jsx — read-only derived-ramp display
 * ----------------------------------------------------------------------------
 * Shows what IS derived from the signature. Seven chips, each a swatch + a
 * 2–3 word plain-English role label + resolved hex. NOT clickable, NOT pickers.
 * Updates live when the `hexes` prop changes. Wraps to two rows on narrow
 * viewports (mobile contract).
 *
 * Truthful-copy rule: labels describe real roles in the layout. No "AI",
 * no aspirational claims.
 * ========================================================================== */
(function () {
  const { useMemo } = React;

  // Order + copy is intentional: hero first, then deep/light, fills, line, on-fill.
  const ROLES = [
    { key: 'signature',      name: 'signature',      label: 'prices & big numbers' },
    { key: 'signature-deep', name: 'deep',           label: 'price numerals' },
    { key: 'signature-link', name: 'link',           label: 'body links' },
    { key: 'tint-12',        name: 'panel tint',     label: 'panel fills' },
    { key: 'tint-6',         name: 'card tint',      label: 'stat-card fills' },
    { key: 'line-30',        name: 'line',           label: 'dividers' },
    { key: 'on-signature',   name: 'on-signature',   label: 'text on fills' },
  ];

  function PaletteChip({ role, hex, contrastHex }) {
    // For on-signature we paint the swatch as the signature fill with the text tone,
    // so the chip literally previews the pairing.
    const isOnSig = role.key === 'on-signature';
    const swatchBg = isOnSig ? contrastHex : hex;
    const glyphColor = isOnSig ? hex : null;

    return (
      <div className="pchip" data-testid={'brand-palette-chip-' + role.key}>
        <div
          className="pchip__swatch"
          style={{ background: swatchBg }}
          aria-hidden="true"
        >
          {isOnSig ? <span className="pchip__aa" style={{ color: glyphColor }}>Aa</span> : null}
        </div>
        <div className="pchip__meta">
          <div className="pchip__role">{role.name}</div>
          <div className="pchip__label">{role.label}</div>
          <div className="pchip__hex">{hex}</div>
        </div>
      </div>
    );
  }

  function PaletteStrip({ hexes }) {
    const chips = useMemo(function () {
      return ROLES.map(function (role) {
        return (
          <PaletteChip
            key={role.key}
            role={role}
            hex={hexes[role.key]}
            contrastHex={hexes['signature']}
          />
        );
      });
    }, [hexes]);

    return (
      <div className="palette-strip" data-testid="brand-palette-strip" role="group" aria-label="Your derived palette">
        <div className="palette-strip__chips">{chips}</div>
      </div>
    );
  }

  window.PaletteStrip = PaletteStrip;
})();
