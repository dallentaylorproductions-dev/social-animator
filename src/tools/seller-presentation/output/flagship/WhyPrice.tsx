import type { PublicComp, PublicPayload } from "../public-payload";
import { Eyebrow } from "./Eyebrow";
import { countSentence, hasCount } from "./copy";

/**
 * §02 · Why this price — confident-tint band. The argument for the number:
 *  - count block: a big derived DIGIT beside an n-aware sentence ("B-side").
 *    The digit slot renders ONLY the numeral (`whyPrice.comps.length`, the
 *    already-filtered counted set) — never freeform text. Digit = --signature
 *    (a substantive display number); sentence = --ink.
 *  - optional agent message: the EXISTING seller-visible "why this price"
 *    field (`whyPrice.publicRationale`, captured by StepStrategy's "your
 *    seller reads this" zone and rendered publicly by v1). Bound here as an
 *    --ink italic lead below the count block — NO new persisted field, never
 *    the numeral treatment.
 *  - comps ledger: comp price = --signature-deep; rules = --line-30.
 */
export function WhyPrice({ payload }: { payload: PublicPayload }) {
  const { whyPrice } = payload;
  const rationale = whyPrice.publicRationale?.trim();
  const comps = whyPrice.comps;
  const n = comps.length;

  // Hide entirely when there is neither a message nor any comp to show.
  if (!rationale && n === 0) return null;

  return (
    <section className="fs-why fs-block tint-confident" data-testid="fs-why">
      <div className="fs-wrap">
        <Eyebrow index="02" label="Why this price" />
        <h2 className="fs-headline reveal">
          A confident, <em>defensible</em> number.
        </h2>

        {hasCount(n) && (
          <div className="fs-count fs-count--beside reveal">
            <span className="fs-count__digit" data-testid="fs-count-digit">
              {n}
            </span>
            <p className="fs-count__say" data-testid="fs-count-say">
              {countSentence(n)}
            </p>
          </div>
        )}

        {rationale && (
          <p className="fs-count__msg reveal" data-testid="fs-count-msg">
            {rationale}
          </p>
        )}

        {n > 0 && (
          <div className="fs-comps" data-testid="fs-comps">
            {comps.map((c, i) => (
              <CompRow key={i} comp={c} index={i} />
            ))}
          </div>
        )}
        {n > 0 && <div className="fs-comps__src">Source · Public record</div>}
      </div>
    </section>
  );
}

function CompRow({ comp, index }: { comp: PublicComp; index: number }) {
  const no = String(index + 1).padStart(2, "0");
  const sub = [
    comp.sqft ? `${comp.sqft} sqft` : null,
    comp.yearBuilt !== undefined ? `Built ${comp.yearBuilt}` : null,
    comp.soldDate ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fs-comp reveal" data-testid={`fs-comp-${index}`}>
      <div className="fs-comp__no">{no}</div>
      <div>
        <div className="fs-comp__addr">{comp.address || "—"}</div>
        {sub && <div className="fs-comp__sub">{sub}</div>}
      </div>
      <div>
        <div className="fs-comp__price">{comp.soldPrice || "—"}</div>
        <span className="fs-comp__tag">Sold</span>
      </div>
    </div>
  );
}
