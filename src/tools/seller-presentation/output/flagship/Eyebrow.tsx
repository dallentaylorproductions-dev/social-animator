/**
 * Flagship (v2) eyebrow primitive — the one eyebrow grammar used by EVERY
 * section (ratified: `index · label · signature dot · hairline`, applied
 * consistently INCLUDING the price section, which had been hand-simplified
 * in the prototype — that divergence is resolved here in favor of the full
 * grammar). The index is omitted on un-numbered sections (hero, price); the
 * signature dot + hairline are always present so the system reads uniform.
 *
 * Color roles (TOKEN_MAP): index = --decorative, label = --ink-soft, dot =
 * --signature, hairline = --line-30. On the dark bands, pass `onDark` so the
 * label/rule switch to the fixed layout cream register.
 */
export function Eyebrow({
  index,
  label,
  onDark,
}: {
  index?: string;
  label: string;
  onDark?: boolean;
}) {
  return (
    <div className={`fs-eyebrow${onDark ? " fs-eyebrow--on-dark" : ""}`}>
      {index && (
        <>
          <span className="fs-eyebrow__idx">{index}</span>
          <span className="fs-eyebrow__sep" aria-hidden="true">
            ·
          </span>
        </>
      )}
      <span className="fs-eyebrow__label">{label}</span>
      <span className="fs-eyebrow__dot" aria-hidden="true" />
      <span className="fs-eyebrow__rule" aria-hidden="true" />
    </div>
  );
}
