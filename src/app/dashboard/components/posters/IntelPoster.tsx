const BAR_HEIGHTS = [40, 65, 50, 80, 55, 90, 70] as const;

export function IntelPoster() {
  return (
    <div className="poster poster-intel">
      <div className="doc-page">
        <div className="doc-head">
          <div className="doc-eyebrow">SELLER INTEL</div>
          <div className="doc-title">Comps & Pricing</div>
        </div>
        <div className="intel-chart">
          {BAR_HEIGHTS.map((h, i) => (
            <span key={i} className="bar" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="intel-table">
          {[0, 1, 2].map((row) => (
            <div key={row} className="intel-row">
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
