import type { ConfidenceLevel } from '../engine/types';

/**
 * Confidence-keyed price-range bracket spreads.
 * Source: prior ATHT build's production-tuned values.
 *
 * A high-confidence comp set tightens the range to plus/minus 2.5% — reads as
 * "we earned this number." A low-confidence set widens to plus/minus 5%,
 * signaling the agent has thinner data and should communicate uncertainty.
 */
export const RANGE_SPREAD_BY_CONFIDENCE: Record<ConfidenceLevel, number> = {
  high: 0.025,
  medium: 0.035,
  low: 0.05,
};

/**
 * Given a recommended list price (formatted string like "$685,000") and a
 * confidence level, return the bracketed range as a tuple of formatted
 * strings (low, high). Returns null if the price can't be parsed.
 *
 * Defense-at-boundary: coalesces missing confidence to 'medium' so
 * historical drafts without the field still render a valid range.
 */
export function computeRangeFromConfidence(
  recommendedListPrice: string,
  confidence: ConfidenceLevel | undefined,
): { low: string; high: string } | null {
  const numeric = parseInt(recommendedListPrice.replace(/[^0-9]/g, ''), 10);
  if (!numeric || Number.isNaN(numeric)) return null;

  const spread = RANGE_SPREAD_BY_CONFIDENCE[confidence ?? 'medium'];
  const lowN = Math.round(numeric * (1 - spread));
  const highN = Math.round(numeric * (1 + spread));
  const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
  return { low: fmt(lowN), high: fmt(highN) };
}
