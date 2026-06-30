/**
 * Buyer Tour Brief — proximity re-pull merge (BUYER_TOUR_BRIEF).
 *
 * The auto-derived proximity layer is AGENT-EDITABLE. When the agent re-pulls
 * Google data (e.g. after adding a home or changing the anchor), a fresh fetch
 * must NEVER clobber a chip the agent has edited or hand-added. This pure merge is
 * the keystone — proven by e2e/buyer-tour.proximity-merge.spec.ts.
 *
 * Rule, per category:
 *   • Every existing chip with `editedByAgent === true` is PRESERVED verbatim.
 *   • For a category that has at least one agent-edited chip, the fresh fetch for
 *     that category is DROPPED (the agent has taken ownership of it).
 *   • For a category with no agent-edited chip, the fresh fetch REPLACES the prior
 *     auto chips.
 *
 * So an agent edit is sticky at the category level: a re-pull refreshes only the
 * categories the agent hasn't touched.
 */

import type { ProximityChip, ProximityCategory } from "./types";

export function mergeEnrichedProximity(
  existing: ProximityChip[],
  fetched: ProximityChip[],
): ProximityChip[] {
  const existingArr = Array.isArray(existing) ? existing : [];
  const fetchedArr = Array.isArray(fetched) ? fetched : [];

  // Categories the agent has taken ownership of.
  const agentOwned = new Set<ProximityCategory>();
  for (const c of existingArr) {
    if (c && c.editedByAgent === true) agentOwned.add(c.category);
  }

  const out: ProximityChip[] = [];

  // 1. Keep every agent-edited chip verbatim (survives the re-pull).
  for (const c of existingArr) {
    if (c && c.editedByAgent === true) out.push(c);
  }

  // 2. Fold in fresh fetches ONLY for categories the agent hasn't owned.
  for (const c of fetchedArr) {
    if (!c) continue;
    if (agentOwned.has(c.category)) continue;
    out.push({ category: c.category, label: c.label, value: c.value });
  }

  return out;
}
