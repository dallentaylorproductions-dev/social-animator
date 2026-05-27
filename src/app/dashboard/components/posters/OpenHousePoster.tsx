import { PhotoBlock } from './PhotoBlock';

/**
 * QR-grid uses a deterministic pseudo-noise pattern (NOT Math.random)
 * so SSR + client first paint render identical pixels — sep-nextjs-
 * hydration-pattern. The reference used Math.random which would mismatch
 * on every render; this seeded variant gives the same visual texture
 * without the hydration warning.
 */
const QR_PATTERN: readonly boolean[] = [
  true, false, true, true, false,
  false, true, false, true, true,
  true, true, false, false, true,
  false, true, true, false, true,
  true, false, false, true, true,
];

export function OpenHousePoster() {
  return (
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
              {QR_PATTERN.map((on, i) => (
                <span
                  key={i}
                  style={{ background: on ? '#111' : 'transparent' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
