import type { PublicPayload } from "../public-payload";
import {
  detectReviewsSource,
  reviewsCardCopy,
  seeAllReviewsCopy,
} from "../presentation-page";
import { Eyebrow } from "./Eyebrow";

/**
 * §04 · Reviews — DARK beat (one of the 4 full-bleed dark beats). Editorial
 * pull-quotes on the left, a confidence card on the right. OPTIONAL with the
 * same three states v1 resolves from the payload:
 *  - ready       : typed reviews → stars + pull-quotes + confidence card.
 *  - outlink-only: no typed reviews but an outlink set → compact CTA card.
 *  - off         : neither → section omitted entirely (page reads complete).
 *
 * D1 visual defaults (real fields are D4): clean 5.0 stars + a platform LOGO
 * SLOT (the detected source as a wordmark stand-in — D4 swaps the official brand
 * SVGs, respecting each platform's usage rules; the slot is omitted when no
 * outlink source is known). No fabricated review COUNT is shown — that field is
 * D4; D1 never invents a number.
 *
 * Quote marks = --decorative; stars = --signature; the only brand-colored text
 * run is the link (--signature-link, surfaced as on-dark here).
 *
 * B0c — `eyebrowIndex` (default "04") is an additive override; pass `""` to drop
 * the index on the un-numbered standalone page.
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
          <Eyebrow index={eyebrowIndex} label="In their words" onDark />
          <a
            className="fs-reviews__card reveal"
            href={outlink.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="fs-reviews-outlink"
          >
            <Stars />
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
        <Eyebrow index={eyebrowIndex} label="In their words" onDark />
        {/* B0b — an agent-constant reviews headline overrides the default lead
            when set; absent → the original copy renders. */}
        <h2 className="fs-headline reveal">
          {payload.reviewsHeadline ? (
            payload.reviewsHeadline
          ) : (
            <>
              From families <em>like yours</em>.
            </>
          )}
        </h2>

        <div className="fs-reviews__layout">
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
                  {i === 0 && <Stars className="fs-quote__stars" />}
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

          {/* Confidence card — D1 visual defaults (5.0 + stars + logo slot + the
              see-all link). The review COUNT is a D4 field; never invented here. */}
          <aside className="fs-conf reveal" data-testid="fs-reviews-confidence">
            <div className="fs-conf__rating">5.0</div>
            <Stars className="fs-conf__stars" />
            {sourceName && (
              <div
                className="fs-conf__logos"
                data-testid="fs-reviews-logo-slot"
                data-source={sourceName}
              >
                <span className="fs-conf__logo">{sourceName}</span>
              </div>
            )}
            {outlink && (
              <a
                className="fs-conf__link"
                href={outlink.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="fs-reviews-outlink"
              >
                {seeAll}{" "}
                <span className="fs-conf__arr" aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

/**
 * Five filled stars — the D1 visual-default rating mark. `--signature`-colored,
 * one consistent shape. The real per-source rating is a D4 field; D1 shows the
 * clean 5.0 the design calls for.
 */
function Stars({ className }: { className?: string }) {
  return (
    <div
      className={`fs-stars${className ? ` ${className}` : ""}`}
      aria-label="Five out of five stars"
      role="img"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true" className="fs-star">
          <path d="M12 3.2l2.6 5.6 6 .6-4.5 4.1 1.3 5.9L12 16.9 6.6 19.4l1.3-5.9L3.4 9.4l6-.6Z" />
        </svg>
      ))}
    </div>
  );
}
