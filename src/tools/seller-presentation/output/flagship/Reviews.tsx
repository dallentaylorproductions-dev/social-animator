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
 * (pull-quotes + a confidence card with rating, source slot, and the see-all
 * link). A clean 5.0, no invented review count, and the detected source surfaced
 * per each platform's trademark guidance (see the source treatment below).
 * Flexes out entirely when there are neither quotes nor an outlink.
 */
export function Reviews({
  payload,
  eyebrowIndex,
  sourceLogos = false,
  reviewsAsOf,
}: {
  payload: PublicPayload;
  eyebrowIndex?: string;
  /**
   * REVIEW_SOURCE_LOGOS_ENABLED - when true, surface the detected review source
   * with a compliant treatment: Zillow as a text label only (no logo, per
   * Zillow's text-only trademark terms), Google with the official four-color "G"
   * down in the link row (never beside the stars, per Google's attribution
   * guidance). Defaults false so a flag-off render (and every existing caller)
   * is byte-identical to today's text wordmark.
   */
  sourceLogos?: boolean;
  /**
   * Month + year for the "as of" line a Google aggregate rating must carry
   * (e.g. "Jun 2026"). Resolved by the caller from the payload or the page's
   * published date. Only surfaced for the Google treatment.
   */
  reviewsAsOf?: string;
}) {
  void eyebrowIndex;
  const reviews = payload.reviews ?? [];
  const outlink = payload.reviewsOutlink;
  if (reviews.length === 0 && !outlink) return null;

  const sourceName = outlink ? detectReviewsSource(outlink.url) : null;
  // Flag + source gate. `treatment` is non-null only when the flag is on AND the
  // detected source is one we have a compliant treatment for; any other source
  // (or flag off) keeps today's text wordmark (graceful, byte-identical).
  const treatment: "zillow" | "google" | null = sourceLogos
    ? sourceName === "Zillow"
      ? "zillow"
      : sourceName === "Google"
        ? "google"
        : null
    : null;

  // Top-right note. Zillow carries the first (and only) "Zillow®" on the page
  // (text-only, per Zillow's terms). Google shows the required "as of <date>"
  // for its aggregate rating - NOT a logo, and never beside the stars.
  const note =
    treatment === "zillow"
      ? "on Zillow®"
      : treatment === "google" && reviewsAsOf
        ? `as of ${reviewsAsOf}`
        : null;

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
        {/* B0b — an agent-constant reviews headline (preserved): surfaced as the
            section head when set; absent → just the eyebrow, as the prototype. */}
        {payload.reviewsHeadline && (
          <h2 className="head">{payload.reviewsHeadline}</h2>
        )}
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
            {/* REVIEW_SOURCE_LOGOS - the compliant top-right source note (Zillow
                text label / Google "as of" date). NEVER a logo here - the Google
                "G" lives down in the link row, away from the stars. Calm
                scroll-in (fade + slight rise) keyed off the card's `.reveal.in`
                in flagship.css, reusing the page motion island (no observer). */}
            {note && (
              <span
                className="rev-source-note"
                data-testid="fs-reviews-source-note"
                data-source={sourceName ?? undefined}
              >
                {note}
              </span>
            )}
          </div>
          {sourceName && !treatment && (
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
                {/* Google attribution: the official "G", unmodified, left of the
                    link text and vertically centered to it - in the link row,
                    not beside the rating. Decorative (the text already says "on
                    Google"); a missing asset renders nothing, never a broken
                    image. */}
                {treatment === "google" && (
                  /* eslint-disable-next-line @next/next/no-img-element -- a tiny static brand SVG; a plain img degrades gracefully on a 404 (empty alt collapses, no broken glyph) and needs no optimizer */
                  <img
                    className="rev-source-g"
                    data-testid="fs-reviews-source-g"
                    src="/review-sources/google-g.svg"
                    alt=""
                    aria-hidden="true"
                    width={20}
                    height={20}
                  />
                )}
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
