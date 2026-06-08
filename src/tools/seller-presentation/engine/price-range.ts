/**
 * UX-2a — optional recommended-price RANGE (low–high).
 *
 * Pure helpers shared by the wizard input, the publish projection, the
 * seller-page hero, the prep PDF, and the live preview so every surface
 * agrees on ONE definition of "is a range active" and renders the same
 * "$low – $high" string. Aaron's ask: "there'll be times where I use this
 * when I haven't seen the house — you can put your range down."
 *
 * Contract (deliberately additive — single price stays the default):
 *  - A range is ACTIVE iff BOTH low and high are non-empty. A draft with
 *    only the single `recommendedPrice` (every pre-UX-2a draft) has no
 *    low/high, so `isPriceRangeActive` is false and every surface renders
 *    the single price byte-identical to today.
 *  - Low/high arrive already formatted by `CurrencyInput` ("$720,000").
 *    `priceToInt` strips to a comparable integer for the low ≤ high check;
 *    an incomplete range (only one side filled) is NOT yet invalid — the
 *    publish gate just treats it as "no price" until both sides land.
 *  - The display separator is an EN-dash (U+2013), never an em-dash
 *    (truthful-copy CI forbids em-dashes in user-facing copy).
 */

/** Strip a CurrencyInput-formatted string ("$720,000") to an integer, or null. */
export function priceToInt(v?: string): number | null {
  if (!v) return null;
  const digits = v.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** True iff BOTH low and high are non-empty — the single signal every surface reads. */
export function isPriceRangeActive(low?: string, high?: string): boolean {
  return !!(low?.trim() && high?.trim());
}

/**
 * True unless BOTH sides are filled AND low > high. An incomplete range
 * (one side empty) is not "invalid" — it's just not active yet — so the
 * wizard only surfaces the calm low>high hint once both numbers exist.
 */
export function isPriceRangeValid(low?: string, high?: string): boolean {
  const lo = priceToInt(low);
  const hi = priceToInt(high);
  if (lo === null || hi === null) return true;
  return lo <= hi;
}

/** "$720,000 – $780,000" — low/high already carry the "$"; en-dash join. */
export function formatPriceRangeDisplay(low: string, high: string): string {
  return `${low.trim()} – ${high.trim()}`;
}

/**
 * Midpoint integer as a plain string ("750000") for the area chart's fixed
 * reference chip — fed through the chart's existing `parsePriceToNumber →
 * formatCompact` so the chip reads one compact number (e.g. "$750k"). The
 * chart line is a FIXED reference banner (A7d.10, not data-scaled), so a
 * range needs NO geometry change: the midpoint is the chip's single value.
 * Null when either side won't parse.
 */
export function priceRangeMidpoint(low?: string, high?: string): string | null {
  const lo = priceToInt(low);
  const hi = priceToInt(high);
  if (lo === null || hi === null) return null;
  return String(Math.round((lo + hi) / 2));
}
