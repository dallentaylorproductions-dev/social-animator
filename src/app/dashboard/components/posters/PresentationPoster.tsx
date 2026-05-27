import { PhotoBlock } from './PhotoBlock';
import { LineGroup } from './LineGroup';

export function PresentationPoster() {
  return (
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
}
