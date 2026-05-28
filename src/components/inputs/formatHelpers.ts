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

/**
 * Strip all non-digit characters and return the resulting string.
 *
 * A7c.4.1 hardened: accepts `string | undefined | null` and returns
 * "" for non-string input. Callers in the comp-row family pre-`??`
 * their values to "" already; this is belts-and-braces so a future
 * caller that forgets the coalesce can't take down the wizard with
 * `undefined.replace(...)`.
 */
export function stripToDigits(input: string | undefined | null): string {
  if (typeof input !== "string") return "";
  return input.replace(/\D/g, "");
}

/**
 * Format a raw integer-string as "$1,234,567". Empty / non-string input
 * returns the empty string (don't show "$0" or "$" for an empty field
 * — placeholder does that job). Non-numeric input is treated as empty.
 *
 * A7c.4.1: tolerant of `undefined | null` after the input layer hardening.
 */
export function formatCurrency(raw: string | undefined | null): string {
  const digits = stripToDigits(raw);
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return "$" + n.toLocaleString("en-US");
}

/**
 * Format a raw integer-string with thousands separators ("2,840").
 * Empty / non-string input returns empty string.
 *
 * A7c.4.1: tolerant of `undefined | null`.
 */
export function formatNumberWithCommas(
  raw: string | undefined | null,
): string {
  const digits = stripToDigits(raw);
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

/**
 * Voice-input compat (Commit 9): convert spoken-number text to digits.
 *
 * Handles "six hundred eighty five thousand dollars" → 685000. Falls
 * back to null when the input has no recognizable number-word so
 * callers can short-circuit and treat the input as ordinary text.
 *
 * Covers the common dictated-currency cases (ones, tens, hundreds,
 * thousands, millions). Edge cases like "six point five million" or
 * fractional decimals fall through to manual entry — acceptable v1.
 */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  million: 1000000,
};

export function wordsToNumber(text: string): number | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/-/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const hasNumberWord = tokens.some(
    (t) => t in NUMBER_WORDS || t in MULTIPLIERS
  );
  if (!hasNumberWord) return null;

  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token === "and") continue;
    if (token in NUMBER_WORDS) {
      current += NUMBER_WORDS[token];
    } else if (token in MULTIPLIERS) {
      const mult = MULTIPLIERS[token];
      if (mult === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * mult;
        current = 0;
      }
    }
    // Ignore unrecognized words (e.g. "dollars", "usd", "bucks").
  }
  return total + current;
}

/**
 * Detect whether a string contains alphabetic word-form numeric input
 * (vs pure digits/symbols). Cheap guard so the word-to-number path
 * only runs when it might actually fire.
 */
export function looksLikeWordNumber(raw: string): boolean {
  return /[a-z]{2,}/i.test(raw);
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
