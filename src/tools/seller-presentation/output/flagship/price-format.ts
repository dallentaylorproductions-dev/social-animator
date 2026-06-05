/**
 * Flagship (v2) price formatting — pure helpers that mirror the v1
 * PricePanel / PriceDisplay shape so the SHARED motion driver
 * (`motion.ts` → `startPriceCountup`) drives the flagship price reveal
 * unchanged. The driver reads `[data-price-countup]` + `data-price-final`
 * and mutates `[data-price-digits]`, restoring at rest a grouped span tree
 * with `.sep`-classed commas. The flagship Price section reproduces that
 * exact contract (attributes + `[data-price-digits]` + `.sep` commas), so
 * no fork of the driver is needed and the at-rest HTML matches the
 * animated end-state.
 */

/** Parse "$642,000" / "$642k" / "642000" → a number, or null. */
export function parsePriceToNumber(v: string | undefined): number | null {
  if (!v) return null;
  const stripped = v.replace(/[^0-9.kKmM]/g, "");
  if (!stripped) return null;
  const lower = stripped.toLowerCase();
  if (lower.endsWith("k")) {
    const n = parseFloat(lower.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  if (lower.endsWith("m")) {
    const n = parseFloat(lower.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000_000 : null;
  }
  const n = parseFloat(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * Count-up gating — identical rule to v1 PricePanel (A7c.8): the
 * scroll-triggered climb is opt-in ONLY for clean integer dollar amounts
 * (e.g. "$675,000"), and only when ≥ 100 so the digit-count floor leaves
 * a non-zero climb range. Fancy inputs ("$675k", "Call for price",
 * decimals) get the static SSR render with no count-up attributes.
 */
export function priceCountupAttrs(value: string): Record<string, string> {
  const cleanInteger = /^\$?\s*\d{1,3}(?:,\d{3})*$/.test((value ?? "").trim());
  const finalNumeric = cleanInteger ? parsePriceToNumber(value) : null;
  return finalNumeric !== null && finalNumeric >= 100
    ? {
        "data-price-countup": "",
        "data-price-final": String(Math.floor(finalNumeric)),
      }
    : {};
}

export type PriceParts =
  | { kind: "grouped"; groups: string[]; tail: string }
  | { kind: "raw"; raw: string };

/**
 * Split a formatted price into the flagship shape: a brick "$" + grouped
 * digits with muted comma separators. Mirrors v1 PriceDisplay's regex +
 * grouping so the `[data-price-digits]` span tree matches what
 * `startPriceCountup` restores at rest (`<span>687</span><span><span
 * class="sep">,</span>298</span>`). Non-matching inputs fall back to the
 * raw string (rendered statically, no count-up).
 */
export function priceParts(value: string): PriceParts {
  const raw = (value ?? "").trim();
  if (!raw) return { kind: "raw", raw: "—" };
  const match = raw.match(/^\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)(.*)$/);
  if (!match) return { kind: "raw", raw };
  const [, digits, tail] = match;
  return { kind: "grouped", groups: digits.split(","), tail };
}
