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
 * UX-2a — when the payload carries a low–high range (both
 * `property.recommendedListLow` + `…High` set), this renders "$low – $high"
 * STATICALLY (no count-up attrs — the driver animates a single integer). A
 * single-price payload (no range fields) takes the unchanged grouped/count-up
 * branch and renders byte-identical to before.
 *
 * Note copy = the short subordinate credibility form "Based on N recent
 * sales nearby." (n-aware; the full claim lives in §02). The count is
 * `whyPrice.comps.length` — the public payload's already-filtered counted
 * set. Suppressed at n === 0 (no comp to base the price on).
 */
export function Price({ payload }: { payload: PublicPayload }) {
  const value = payload.property.recommendedList || payload.recommendedPrice;
  const n = payload.whyPrice.comps.length;
  // UX-2a — when a low–high range is set, render it STATICALLY (no count-up:
  // the count-up driver animates a single integer). Single price is unchanged
  // (same grouped markup + count-up attrs) so its render stays byte-identical.
  const low = payload.property.recommendedListLow;
  const high = payload.property.recommendedListHigh;
  const isRange = !!(low && high);
  const parts = priceParts(value);
  const countupAttrs = isRange ? {} : priceCountupAttrs(value);

  return (
    <section className="fs-price fs-block" data-testid="fs-price">
      <div className="fs-wrap">
        <Eyebrow label="Recommended list" />
        <div className="fs-price__inner">
          {isRange ? (
            // UX-2a-followup — distinct stable `key` per mode. The count-up
            // driver (motion.ts) imperatively rewrites the single-price
            // branch's `[data-price-digits]` innerHTML; without a key swap,
            // React would REUSE this <div> when the mode flips and try to
            // reconcile those driver-mutated children → `removeChild`
            // NotFoundError. Keying forces a clean unmount/remount of the
            // whole subtree (one removeChild of a node React still owns),
            // so the single→range transition never crashes.
            <div
              key="range"
              className="fs-price__big fs-price__big--range reveal"
              data-testid="fs-price-range"
            >
              <span>{low}</span>
              <span className="fs-price__range-dash" aria-hidden="true">
                –
              </span>
              <span>{high}</span>
            </div>
          ) : (
            <div key="single" className="fs-price__big reveal" {...countupAttrs}>
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
          )}
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
