import type { PublicPayload } from "../public-payload";
import { Eyebrow } from "./Eyebrow";
import { hasCount, priceNoteCountLabel } from "./copy";
import { priceCountupAttrs, priceParts } from "./price-format";

/**
 * §2 · Recommended list price — paper band, the hero value moment. The "$"
 * + amount paint --signature; the price counts up once in view via the
 * SHARED motion driver (the `data-price-countup` / `data-price-final` /
 * `[data-price-digits]` contract is reproduced verbatim, with `.sep`-classed
 * commas so the at-rest markup matches the driver's animated end-state).
 *
 * Note copy = the short subordinate credibility form "Based on N recent
 * sales nearby." (n-aware; the full claim lives in §02). The count is
 * `whyPrice.comps.length` — the public payload's already-filtered counted
 * set. Suppressed at n === 0 (no comp to base the price on).
 */
export function Price({ payload }: { payload: PublicPayload }) {
  const value = payload.property.recommendedList || payload.recommendedPrice;
  const n = payload.whyPrice.comps.length;
  const parts = priceParts(value);
  const countupAttrs = priceCountupAttrs(value);

  return (
    <section className="fs-price fs-block" data-testid="fs-price">
      <div className="fs-wrap">
        <Eyebrow label="Recommended list" />
        <div className="fs-price__inner">
          <div className="fs-price__big reveal" {...countupAttrs}>
            {parts.kind === "grouped" ? (
              <>
                <span className="fs-price__cur">$</span>
                <span data-price-digits>
                  {parts.groups.map((g, i) => (
                    <span key={i}>
                      {i > 0 && <span className="sep">,</span>}
                      {g}
                    </span>
                  ))}
                </span>
                {parts.tail && <span>{parts.tail}</span>}
              </>
            ) : (
              <span>{parts.raw}</span>
            )}
          </div>
          {hasCount(n) && (
            <p className="fs-price__note fs-price__side reveal">
              Based on{" "}
              <span className="fs-price__note-b">{priceNoteCountLabel(n)}</span>{" "}
              nearby.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
