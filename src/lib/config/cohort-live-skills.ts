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
