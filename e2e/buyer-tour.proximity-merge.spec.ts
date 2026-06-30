import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief — proximity re-pull merge (BUYER_TOUR_BRIEF).
 *
 * The keystone: an agent-edited / hand-added chip must SURVIVE a fresh Google
 * re-pull, while untouched categories refresh. Pure-Node test.
 */

import { mergeEnrichedProximity } from "../src/tools/buyer-tour-brief/engine/proximity-merge";
import type { ProximityChip } from "../src/tools/buyer-tour-brief/engine/types";

test.describe("buyer-tour proximity merge", () => {
  test("an agent-edited chip survives a re-pull; its category is not clobbered", () => {
    const existing: ProximityChip[] = [
      {
        category: "commute",
        label: "JBLM gate",
        value: "15 min drive (agent set)",
        editedByAgent: true,
      },
      { category: "coffee", label: "Auto Cafe", value: "0.4 mi" }, // auto, untouched
    ];
    const fetched: ProximityChip[] = [
      { category: "commute", label: "JBLM gate", value: "12 min drive" }, // fresh
      { category: "coffee", label: "New Auto Cafe", value: "0.2 mi" }, // fresh
      { category: "schools", label: "Cedar Elementary", value: "0.3 mi" }, // new layer
    ];

    const merged = mergeEnrichedProximity(existing, fetched);

    // The agent's commute chip survives verbatim.
    const commute = merged.filter((c) => c.category === "commute");
    expect(commute).toHaveLength(1);
    expect(commute[0].value).toBe("15 min drive (agent set)");
    expect(commute[0].editedByAgent).toBe(true);

    // The untouched coffee category refreshes to the fresh fetch.
    const coffee = merged.filter((c) => c.category === "coffee");
    expect(coffee).toHaveLength(1);
    expect(coffee[0].label).toBe("New Auto Cafe");
    expect(coffee[0].value).toBe("0.2 mi");

    // A brand-new fetched layer is folded in.
    expect(merged.some((c) => c.category === "schools")).toBe(true);
  });

  test("with no agent edits, a re-pull fully replaces the auto chips", () => {
    const existing: ProximityChip[] = [
      { category: "parks", label: "Old Park", value: "0.9 mi" },
    ];
    const fetched: ProximityChip[] = [
      { category: "parks", label: "New Park", value: "0.3 mi" },
    ];
    const merged = mergeEnrichedProximity(existing, fetched);
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe("New Park");
  });

  test("an empty re-pull preserves agent-edited chips and drops stale auto chips", () => {
    const existing: ProximityChip[] = [
      { category: "commute", label: "Gate", value: "10 min", editedByAgent: true },
      { category: "coffee", label: "Auto", value: "0.5 mi" },
    ];
    const merged = mergeEnrichedProximity(existing, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].category).toBe("commute");
    expect(merged[0].editedByAgent).toBe(true);
  });
});
