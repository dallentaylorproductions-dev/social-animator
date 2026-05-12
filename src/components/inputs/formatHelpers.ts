/**
 * Shared format helpers for the auto-formatting input family
 * (CurrencyInput, NumberInput, PhoneInput).
 *
 * Storage contract: each component stores ONLY raw digits in form state
 * (no $, commas, parens, hyphens). The functions below derive the
 * formatted display string from that raw digit string and vice versa.
 * Downstream render pipelines (PDF templates, MP4 canvas, etc.) keep
 * reading the raw value exactly as before.
 */

/** Strip all non-digit characters and return the resulting string. */
export function stripToDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Format a raw integer-string as "$1,234,567". Empty input returns the
 * empty string (don't show "$0" or "$" for an empty field — placeholder
 * does that job). Non-numeric input is treated as empty.
 */
export function formatCurrency(raw: string): string {
  const digits = stripToDigits(raw);
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return "$" + n.toLocaleString("en-US");
}

/**
 * Format a raw integer-string with thousands separators ("2,840").
 * Empty input returns empty string.
 */
export function formatNumberWithCommas(raw: string): string {
  const digits = stripToDigits(raw);
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

/**
 * Walk a formatted display string and find the character index that
 * sits immediately AFTER the `rawIndex`-th digit. Used by the live-
 * formatting inputs (CurrencyInput, PhoneInput) to restore the caret
 * after re-rendering with newly-inserted formatting characters.
 *
 * Examples (formatted = "$685,000"):
 *   rawIndex=0 → 1   (caret right after the "$", before any digit)
 *   rawIndex=1 → 2   (after "6")
 *   rawIndex=2 → 3   (after "8")
 *   rawIndex=3 → 4   (after "5")
 *   rawIndex=4 → 6   (after the first "0" — skips the comma)
 *   rawIndex=6 → 8   (after the last "0")
 *
 * If `rawIndex` is 0, caret lands AFTER any leading non-digit prefix
 * (e.g., after the "$" or "(" so the user sees the caret inside the
 * formatted shell, not before it).
 */
export function caretAfterNthDigit(
  formatted: string,
  rawIndex: number
): number {
  if (rawIndex <= 0) {
    // Caret lands after the leading non-digit prefix, if any.
    let i = 0;
    while (i < formatted.length && !/\d/.test(formatted[i])) i++;
    return i;
  }
  let digitCount = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      digitCount++;
      if (digitCount === rawIndex) return i + 1;
    }
  }
  return formatted.length;
}
