import type { PublicPayload } from "../public-payload";
import { hasCount, priceNoteCountLabel } from "./copy";
import { priceCountupAttrs, priceParts } from "./price-format";

/**
 * §2 · Recommended price — ported from the locked prototype's `Price` DOM. The
 * white panel overlaps UP onto the dark hero band (overlap depth), teal accent
 * rule on its left edge. Meta row FIRST (RECOMMENDED LIST + "Based on N recent
 * sales nearby."), the big number BELOW at the LOCKED scale (single
 * clamp(60→144), range legs clamp(46→104) — never shrunk; overflow handled by
 * the card layout + tabular-nums).
 *
 * The single price keeps the shared count-up contract (data-price-countup /
 * data-price-final / [data-price-digits] + `.sep` commas); a low–high range
 * renders STATICALLY (the driver animates a single integer).
 */
export function Price({ payload }: { payload: PublicPayload }) {
  const value = payload.property.recommendedList || payload.recommendedPrice;
  const n = payload.whyPrice.comps.length;
  const low = payload.property.recommendedListLow;
  const high = payload.property.recommendedListHigh;
  const isRange = !!(low && high);
  const parts = priceParts(value);
  const countupAttrs = isRange ? {} : priceCountupAttrs(value);
  const stripDollar = (s?: string) => (s ?? "").replace(/^\$/, "");

  return (
    <section className="price" data-testid="fs-price">
      <div className="price__card reveal">
        <div className="price__accentbar" aria-hidden="true" />
        <div className="price__meta">
          <div className="price__label">Recommended List</div>
          {hasCount(n) && (
            <p className="price__sub">
              Based on <b>{priceNoteCountLabel(n)}</b> nearby.
            </p>
          )}
        </div>

        {isRange ? (
          <div
            key="range"
            className="price__range reveal"
            data-testid="fs-price-range"
          >
            <div className="price__rangerow">
              <div className="price__leg">
                <span className="cap">Low</span>
                <span className="val">
                  <span className="cur">$</span>
                  {stripDollar(low)}
                </span>
              </div>
              <div className="price__dash" aria-hidden="true">
                –
              </div>
              <div className="price__leg">
                <span className="cap">High</span>
                <span className="val">
                  <span className="cur">$</span>
                  {stripDollar(high)}
                </span>
              </div>
            </div>
            <div className="price__bar" aria-hidden="true">
              <i />
            </div>
          </div>
        ) : (
          <div key="single" className="price__single reveal" {...countupAttrs}>
            {parts.kind === "grouped" ? (
              <>
                <span className="cur">$</span>
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
        )}
      </div>
    </section>
  );
}
