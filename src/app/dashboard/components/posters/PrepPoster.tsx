const CHECKLIST_ITEMS = [
  'Sign placement',
  'Refreshments',
  'Sign-in QR',
  'Lighting',
  'Talking points',
] as const;

export function PrepPoster() {
  return (
    <div className="poster poster-prep">
      <div className="doc-page">
        <div className="doc-head">
          <div className="doc-eyebrow">OPEN HOUSE</div>
          <div className="doc-title">Day-of Prep</div>
        </div>
        <ul className="checklist">
          {CHECKLIST_ITEMS.map((item, i) => (
            <li key={item}>
              <span className={`check ${i < 2 ? 'done' : ''}`} />
              <span className="check-label">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
