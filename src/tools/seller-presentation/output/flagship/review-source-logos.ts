/**
 * Review-source brand logos (flag REVIEW_SOURCE_LOGOS_ENABLED).
 *
 * Maps the friendly source LABEL that `detectReviewsSource` already resolves
 * from the agent's review link ("Zillow", "Google", ...) to the matching
 * official brand mark in `public/review-sources/`. The card renders the logo
 * inside a light app-badge chip (see `.rev-source-logo` in flagship.css) so the
 * unmodified mark reads cleanly on the dark review card for both Zillow (blue)
 * and Google (multicolor) - referential use to link the seller to the agent's
 * reviews on that platform.
 *
 * Only the sources we hold a brand mark for appear here; any other detected
 * label (Realtor.com, Yelp, ...) resolves to `null`, so the card gracefully
 * falls back to today's text wordmark rather than inventing a logo. An unknown
 * source (`detectReviewsSource` returned null) likewise yields no logo.
 *
 * The assets are referenced by their public path. A MISSING file never renders
 * a broken image: the chip paints the mark as a CSS `background-image`, so an
 * absent asset simply leaves the (light) chip empty rather than the browser's
 * broken-image glyph. Pure + dependency-free so it is safe to import from both
 * the server renderer and a plain test.
 */
export interface ReviewSourceLogo {
  /** Public path to the unmodified brand mark (transparent PNG). */
  src: string;
  /** The brand label, for the chip's accessible name. */
  label: string;
}

const REVIEW_SOURCE_LOGOS: Record<string, ReviewSourceLogo> = {
  Zillow: { src: "/review-sources/zillow.png", label: "Zillow" },
  Google: { src: "/review-sources/google.png", label: "Google" },
};

/**
 * The brand mark for a detected review source label, or `null` when there is
 * none (no label, or a source we hold no mark for). Keyed by the exact label
 * `detectReviewsSource` returns.
 */
export function resolveReviewSourceLogo(
  sourceName: string | null | undefined,
): ReviewSourceLogo | null {
  if (!sourceName) return null;
  return REVIEW_SOURCE_LOGOS[sourceName] ?? null;
}
