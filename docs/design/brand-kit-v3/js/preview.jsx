/* preview.jsx — full-length seller-page preview (MiniPage).
   Phone frame grows to content height; the settings page scrolls, not this. */
(function () {
  const { useMemo } = React;
  const CU = window.CU;

  // A single un-branded "listing photo" placeholder (gray hatch).
  function Hatch({ label, h }) {
    return (
      <div
        style={{
          height: h,
          position: "relative",
          background:
            "repeating-linear-gradient(135deg,#d9d4cd 0 7px,#cfc9c1 7px 14px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          overflow: "hidden",
        }}
      >
        {label ? (
          <span
            style={{
              font: "500 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "#7c766d",
              background: "rgba(255,255,255,.72)",
              padding: "2px 5px",
              margin: 6,
              borderRadius: 3,
            }}
          >
            {label}
          </span>
        ) : null}
      </div>
    );
  }

  function MiniPage({ signature, pageBg, pageText, layout, agentName, logoPresent }) {
    const d = useMemo(() => {
      const ink = CU.readableInk(signature);            // label on the brand button
      const onSurf = CU.accentOnSurface(signature, pageBg); // eyebrow/link safe shade
      const muted = mix(pageText, pageBg, 0.45);
      const hair = mix(pageText, pageBg, 0.86);
      const card = mix(pageBg, pageText, 0.04);
      return { ink, accentText: onSurf.hex, muted, hair, card };
    }, [signature, pageBg, pageText]);

    const listings = [
      { price: "$845,000", meta: "4 bd · 3 ba · 2,410 sqft", addr: "18 Linden Court" },
      { price: "$612,000", meta: "3 bd · 2 ba · 1,680 sqft", addr: "240 Mesa Ridge Dr" },
      { price: "$1,180,000", meta: "5 bd · 4 ba · 3,090 sqft", addr: "7 Overlook Lane" },
    ];

    return (
      <div
        data-testid="brand-minipage-preview"
        style={{
          background: pageBg,
          color: pageText,
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif',
        }}
      >
        {/* top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 14px",
            borderBottom: `1px solid ${d.hair}`,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              flex: "0 0 auto",
              background: logoPresent ? signature : "transparent",
              border: logoPresent ? "none" : `1px dashed ${mix(pageText, pageBg, 0.6)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: logoPresent ? CU.readableInk(signature) : d.muted,
              font: "700 10px/1 ui-monospace,monospace",
            }}
          >
            {logoPresent ? (agentName ? agentName[0] : "A") : "logo"}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".01em" }}>
            {agentName || "Your agency"}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 11, color: d.muted, fontSize: 10 }}>
            <span>Listings</span><span>About</span>
          </span>
        </div>

        {/* COMPRESSED hero — un-branded by design, deliberately small */}
        <Hatch label="listing photo" h={88} />

        {/* EMPHASIZED scrim band — first brand impression lives here */}
        <div
          style={{
            padding: "14px 14px 16px",
            background: d.card,
            borderBottom: `1px solid ${d.hair}`,
          }}
        >
          <div
            style={{
              font: "600 9px/1 ui-monospace,monospace",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: d.accentText,
              marginBottom: 7,
            }}
          >
            Just listed
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.12, letterSpacing: "-.01em" }}>
            18 Linden Court
          </div>
          <div style={{ fontSize: 11, color: d.muted, marginTop: 4 }}>
            Maple Heights · Listed by {agentName || "your agency"}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
            <button
              style={{
                border: "none",
                borderRadius: 7,
                padding: "8px 14px",
                background: signature,
                color: d.ink,
                font: "600 11px/1 inherit",
                cursor: "default",
              }}
            >
              Contact agent
            </button>
            <button
              style={{
                borderRadius: 7,
                padding: "8px 13px",
                background: "transparent",
                color: d.accentText,
                border: `1px solid ${mix(d.accentText, pageBg, 0.55)}`,
                font: "600 11px/1 inherit",
                cursor: "default",
              }}
            >
              Schedule tour
            </button>
          </div>
        </div>

        {/* section heading */}
        <div style={{ padding: "16px 14px 2px" }}>
          <div
            style={{
              font: "600 9px/1 ui-monospace,monospace",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: d.accentText,
            }}
          >
            More from {agentName ? agentName.split(" ")[0] : "this agent"}
          </div>
        </div>

        {/* listings — layout owns the arrangement */}
        <div
          style={{
            padding: 14,
            display: "grid",
            gap: 11,
            gridTemplateColumns: layout === "grid" ? "1fr 1fr" : "1fr",
          }}
        >
          {listings.map((l, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${d.hair}`,
                borderRadius: 10,
                overflow: "hidden",
                background: d.card,
                display: layout === "list" ? "flex" : "block",
                gap: 10,
              }}
            >
              <div style={{ flex: layout === "list" ? "0 0 84px" : "auto" }}>
                <Hatch label={null} h={layout === "list" ? 64 : layout === "grid" ? 62 : 92} />
              </div>
              <div style={{ padding: layout === "list" ? "9px 10px 9px 0" : "9px 11px 11px" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{l.price}</div>
                <div style={{ fontSize: 10.5, color: d.muted, marginTop: 2 }}>{l.meta}</div>
                <div style={{ fontSize: 11, marginTop: 5, fontWeight: 500 }}>{l.addr}</div>
              </div>
            </div>
          ))}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "16px 14px 22px",
            borderTop: `1px solid ${d.hair}`,
            background: d.card,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: d.accentText }}>
            {agentName || "Your agency"}
          </div>
          <div style={{ fontSize: 10, color: d.muted, marginTop: 4, lineHeight: 1.5 }}>
            License #00000000 · (000) 000-0000<br />
            Equal housing opportunity
          </div>
        </div>
      </div>
    );
  }

  // mix two hexes in sRGB; t=0 → a, t=1 → b
  function mix(aHex, bHex, t) {
    const a = CU.hexToRgb(aHex) || { r: 0, g: 0, b: 0 };
    const b = CU.hexToRgb(bHex) || { r: 1, g: 1, b: 1 };
    return CU.rgbToHex({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    });
  }

  window.MiniPage = MiniPage;
})();
