import type { PublicPayload } from "../public-payload";
import {
  detectReviewsSource,
  seeAllReviewsCopy,
} from "../presentation-page";

/** Five filled stars (the prototype's text-mark rating). */
function Stars({ className = "" }: { className?: string }) {
  return (
    <span className={"stars " + className} aria-label="Five out of five stars" role="img">
      ★★★★★
    </span>
  );
}

/**
 * §04 · Reviews — DARK beat, ported from the prototype's `Reviews` DOM
 * (pull-quotes + a confidence card with rating, platform LOGO slot, and the
 * see-all link). D1 visual defaults (real rating/count + official logos are D4):
 * a clean 5.0, no invented review count, and a wordmark stand-in for the detected
 * source. Flexes out entirely when there are neither quotes nor an outlink.
 */
export function Reviews({
  payload,
  eyebrowIndex,
}: {
  payload: PublicPayload;
  eyebrowIndex?: string;
}) {
  void eyebrowIndex;
  const reviews = payload.reviews ?? [];
  const outlink = payload.reviewsOutlink;
  if (reviews.length === 0 && !outlink) return null;

  const sourceName = outlink ? detectReviewsSource(outlink.url) : null;
  const seeAll = seeAllReviewsCopy(sourceName);
  const agentFirst = (payload.agent?.name ?? "").trim().split(/\s+/)[0] || "us";
  const hasQuotes = reviews.length > 0;
  const variant = hasQuotes ? undefined : "outlink-only";

  return (
    <section
      className="section reviews z-ink"
      data-testid="fs-reviews"
      {...(variant ? { "data-variant": variant } : {})}
    >
      <div className="reveal">
        <div className="eyebrow on-dark">
          In Their Words <span className="rule" aria-hidden="true" />
        </div>
      </div>
      <div className="reviews__layout">
        <div className="reveal">
          {hasQuotes &&
            reviews.map((r, i) => {
              const attribution = [
                r.attributionStreet ? `SOLD ON ${r.attributionStreet}` : null,
                r.attributionYear,
                r.attributionName,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={i}>
                  <Stars />
                  <p className="review__q">
                    <span className="mark" aria-hidden="true">
                      &ldquo;
                    </span>
                    {r.body}
                    <span className="mark" aria-hidden="true">
                      &rdquo;
                    </span>
                  </p>
                  <div className="review__attr">
                    {attribution || r.attributionName}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="rev-conf reveal" data-testid="fs-reviews-confidence">
          <div className="rev-conf__rating">
            <span className="rev-conf__num">5.0</span>
            <Stars className="sm" />
          </div>
          {sourceName && (
            <div
              className="rev-logos"
              data-testid="fs-reviews-logo-slot"
              data-source={sourceName}
            >
              <span className="plogo">
                <span className="plogo__name">{sourceName}</span>
              </span>
            </div>
          )}
          {outlink && (
            <a
              className="zillow"
              href={outlink.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="fs-reviews-outlink"
            >
              <span className="lead">
                Read {agentFirst}&apos;s reviews
                {sourceName ? ` on ${sourceName}` : ""}
              </span>
              <span className="go">{seeAll} →</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
