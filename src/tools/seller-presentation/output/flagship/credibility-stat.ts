import type { PublicPayload } from "../public-payload";

/**
 * Seller State A · the agent track-record credibility stat (e.g. the 101.3%
 * average sale-to-list figure).
 *
 * v1.5x — RELOCATED out of the trust strip into the Appointment Brief's
 * neighborhood-activity column, where it sits as the second of two stacked proof
 * panels (the market `+X%` trend over the agent's own track-record figure). It
 * reads the SAME existing payload field (`whyUs.performanceStats`) it always has,
 * so there is no new public field and no serializer change; only the render site
 * moved. Lifted to this shared helper so both the (now reviews-only) trust strip
 * and the brief read it from one place.
 *
 * Picks the first percentage stat (the sale-to-list figure), else the first stat.
 * Returns null when no stat carries a value, so the proof panel flexes out.
 */
export function credibilityStat(
  payload: PublicPayload,
): { value: string; label: string } | null {
  const stats = payload.whyUs?.performanceStats ?? [];
  const pct = stats.find((s) =>
    /%/.test((s.yourValue ?? "") + (s.unit ?? "")),
  );
  const stat = pct ?? stats[0];
  if (!stat?.yourValue?.trim()) return null;
  const metric = stat.label?.trim();
  const first = payload.agent.name?.trim().split(/\s+/)[0];
  // "Marisol's average sale-to-list across recent listings." First-name
  // possessive + the metric lowercased so it reads as one natural phrase.
  const phrase = metric
    ? `${lowerFirst(metric)} across recent listings`
    : "track record across recent listings";
  const label = first ? `${first}'s ${phrase}` : capitalize(phrase);
  return { value: stat.yourValue, label };
}

/** "Average sale-to-list" -> "average sale-to-list" (only the first letter). */
function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "average …" -> "Average …" (only the first letter), for the no-name fallback. */
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
