/**
 * Skills that are LIVE for the current cohort. Every other dashboard grid
 * tool renders as a non-clickable "Coming soon" tile. Graduate a tool to
 * the cohort = add its skill id here + redeploy (one-line change, no
 * dashboard rebuild).
 *
 * Swappable like COHORT_EXAMPLE_URL — this is a cohort-phase gate, not a
 * permanent state. The tools still exist at their routes; the gate is
 * purely dashboard-presentational (we just don't surface the half-baked
 * ones as clickable while the cohort is forming feedback on the two we
 * want usage data on).
 *
 * NOTE: ids MUST match ALL_SKILLS records exactly. Social Studio is NOT
 * here — it's the separate flagship marquee (links to /social-animator),
 * not a registry-bound grid tile, so it's never gated by this list.
 */
export const COHORT_LIVE_SKILLS: readonly string[] = ["seller-presentation"];

/**
 * True when a skill id is recommendable to a cohort agent — i.e. live as
 * a Coming-soon-free destination. The dashboard hero "Up next" filters
 * its candidate workflows (primary CTA) and chains (queue chips) through
 * this so a cohort agent is never sent to a gated tool.
 *
 * Two live buckets:
 *   1. Skills in COHORT_LIVE_SKILLS (the registry-bound grid gate).
 *   2. Social Studio templates — id prefix "social-animator-". Social
 *      Studio is the live flagship marquee (linked from /social-animator);
 *      the individual templates aren't rendered as gated grid tiles, so
 *      recommending one for the hero counts as routing into the live
 *      Social Studio surface, not into a Coming-soon tool.
 */
export function isLiveSkillForCohort(skillId: string): boolean {
  if (COHORT_LIVE_SKILLS.includes(skillId)) return true;
  if (skillId.startsWith("social-animator-")) return true;
  return false;
}
