import type { PublicPayload } from "../public-payload";
import {
  detectReviewsSource,
  reviewsCardCopy,
  seeAllReviewsCopy,
} from "../presentation-page";
import { Eyebrow } from "./Eyebrow";

/**
 * §04 · Reviews — paper band, classic editorial pull-quotes. OPTIONAL with
 * the same three states v1 resolves from the payload:
 *  - ready      : typed reviews → pull-quotes + (optional) "see all" link.
 *  - outlink-only: no typed reviews but an outlink set → compact CTA card.
 *  - off        : neither → section omitted entirely (page reads complete).
 * Quote marks = --decorative; attribution rule = --signature; the only
 * brand-colored text run on the page is the link (--signature-link).
 *
 * B0c — `eyebrowIndex` (default "04") is an additive override; pass `""` to
 * drop the index on the un-numbered standalone page. Default keeps the seller
 * page byte-identical.
 */
export function Reviews({
  payload,
  eyebrowIndex = "04",
}: {
  payload: PublicPayload;
  eyebrowIndex?: string;
}) {
  const reviews = payload.reviews ?? [];
  const outlink = payload.reviewsOutlink;
  if (reviews.length === 0 && !outlink) return null;

  const sourceName = outlink ? detectReviewsSource(outlink.url) : null;
  const seeAll = seeAllReviewsCopy(sourceName);

  if (reviews.length === 0 && outlink) {
    const agentFirst = (payload.agent?.name ?? "").trim().split(/\s+/)[0];
    const cardCopy = reviewsCardCopy(agentFirst, sourceName);
    return (
      <section
        className="fs-reviews fs-reviews--outlink fs-block"
        data-testid="fs-reviews"
        data-variant="outlink-only"
      >
        <div className="fs-wrap">
          <Eyebrow index={eyebrowIndex} label="In their words" />
          <a
            className="fs-reviews__card reveal"
            href={outlink.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="fs-reviews-outlink"
          >
            <span className="fs-reviews__card-copy">{cardCopy}</span>
            <span className="fs-reviews__card-meta">{seeAll}</span>
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="fs-reviews fs-block" data-testid="fs-reviews">
      <div className="fs-wrap">
        <Eyebrow index={eyebrowIndex} label="In their words" />
        {/* B0b — an agent-constant reviews headline overrides the default lead
            when set; absent → the original copy renders byte-identical. */}
        <h2 className="fs-headline reveal">
          {payload.reviewsHeadline ? (
            payload.reviewsHeadline
          ) : (
            <>
              From families <em>like yours</em>.
            </>
          )}
        </h2>
        <div className="fs-reviews__list">
          {reviews.map((r, i) => {
            const attribution = [
              r.attributionStreet ? `Sold on ${r.attributionStreet}` : null,
              r.attributionYear,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <figure className="fs-quote reveal" key={i}>
                <blockquote className="fs-quote__body">
                  <span className="fs-quote__mark" aria-hidden="true">
                    &ldquo;
                  </span>
                  {r.body}
                  <span className="fs-quote__mark" aria-hidden="true">
                    &rdquo;
                  </span>
                </blockquote>
                <figcaption className="fs-quote__by">
                  <span className="fs-quote__rule" aria-hidden="true" />
                  <span className="fs-quote__nm">{r.attributionName}</span>
                  {attribution && <span> · {attribution}</span>}
                </figcaption>
              </figure>
            );
          })}
        </div>
        {outlink && (
          <a
            className="fs-brandlink reveal"
            href={outlink.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="fs-reviews-outlink"
          >
            {seeAll}{" "}
            <span className="fs-brandlink__arr" aria-hidden="true">
              →
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
