import { PhotoBlock } from './PhotoBlock';

export function FlyerPoster() {
  return (
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
}
