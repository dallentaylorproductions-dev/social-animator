import { PhotoBlock, type PhotoBlockTint } from './PhotoBlock';
import { LineGroup } from './LineGroup';

export function DocPoster({
  title = 'Listing Presentation',
  accent = 'cool',
}: {
  title?: string;
  accent?: PhotoBlockTint;
}) {
  return (
    <div className="poster poster-doc">
      <div className="doc-page">
        <div className="doc-corner" />
        <div className="doc-head">
          <div className="doc-eyebrow">PREPARED FOR</div>
          <div className="doc-title">{title}</div>
        </div>
        <PhotoBlock label="LISTING" tint={accent} height="42%" />
        <LineGroup lines={4} widths={['100%', '90%', '70%', '95%']} />
      </div>
    </div>
  );
}
