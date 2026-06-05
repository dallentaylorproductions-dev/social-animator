/**
 * Flagship (v2) derived copy — pure, n-aware grammar for the §02 count
 * block and the price-section note. Kept as pure functions (no React) so
 * the e2e suite can assert the 0 / 1 / N grammar in a node context without
 * a browser.
 *
 * The COUNT (the number of comps that anchor the price) is the only input.
 * In the public payload, comps are ALREADY filtered to the counted set
 * (`toPublicPayload` drops `counted === false` at projection — the
 * median-engine filter), so the caller passes `whyPrice.comps.length`
 * directly: it IS the counted-comp count, never the raw draft length.
 */

/**
 * §02 count-block sentence — the "B-side" married to the big derived digit.
 * The digit is rendered separately (the numeral slot), so this sentence
 * carries NO number; read together it is "{N} recent sales nearby anchor
 * this number." n-aware: singular verb + noun at n === 1.
 *
 *   n === 1 → "recent sale nearby anchors this number."
 *   n  >  1 → "recent sales nearby anchor this number."
 *
 * "nearby" is one word (the production "near by" typo is NOT reproduced).
 */
export function countSentence(n: number): string {
  return n === 1
    ? "recent sale nearby anchors this number."
    : "recent sales nearby anchor this number.";
}

/**
 * Price-section note — the short subordinate credibility tag shown at the
 * price reveal (the full claim lives in §02). The returned label is the
 * emphasized run; the renderer wraps it as: Based on <b>{label}</b> nearby.
 *
 *   n === 1 → "1 recent sale"
 *   n  >  1 → "{n} recent sales"
 */
export function priceNoteCountLabel(n: number): string {
  return n === 1 ? "1 recent sale" : `${n} recent sales`;
}

/**
 * Whether the derived count block + price note render at all. At n === 0
 * there is no comp to anchor the number, so both the giant digit and the
 * "Based on N recent sales nearby." claim are suppressed (rendering "0
 * recent sales anchor this number." would be neither true nor graceful).
 * The §02 section itself still renders when a rationale / agent message is
 * present; it simply omits the count statement.
 */
export function hasCount(n: number): boolean {
  return n >= 1;
}
