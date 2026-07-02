import { test, expect } from "@playwright/test";
import {
  describeMissingBuyerTourInputs,
  type BuyerTourDraft,
} from "../src/tools/buyer-tour-brief/engine/types";
import {
  draftFromPublicPayload,
  toBuyerTourPublicPayload,
  type BuyerTourPublicPayload,
} from "../src/tools/buyer-tour-brief/output/public-payload";

/**
 * Buyer Tour Brief — BUILDER_V2 pure locks (BUYER_TOUR_BUILDER_V2, DARK).
 *
 * Two data spines under the V2 builder-friction pass:
 *   • Lever 3 — the SOFTENED publish gate: `describeMissingBuyerTourInputs` requires
 *     the per-home "why" by DEFAULT (today / flag off) and drops that requirement
 *     under `{ requireWhy: false }` (the V2 publish route), while the address stays
 *     required in BOTH modes.
 *   • Lever 2 reopen — `draftFromPublicPayload`, which reconstructs an editable draft
 *     from a published tour's public payload for the "no local draft" reopen path.
 *
 * No render — this is the logic the route + workspace lean on.
 */

function draft(overrides: Partial<BuyerTourDraft> = {}): BuyerTourDraft {
  return {
    buyerName: "The Rivas family",
    tourDate: "Saturday, July 12",
    priorities: ["schools", "commute"],
    buyerPriorities: ["Short commute"],
    homes: [
      { id: "a", address: "1 Oak St", whyOnList: "Single level", watchFor: "", proximity: [] },
      { id: "b", address: "2 Elm St", whyOnList: "Big yard", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "New kitchen", watchFor: "", proximity: [] },
    ],
    ...overrides,
  };
}

/* ---- Lever 3: the softened "why" publish gate ----------------------------- */

test("why is required by DEFAULT (today's builder / flag off)", () => {
  const d = draft({
    homes: [
      { id: "a", address: "1 Oak St", whyOnList: "", watchFor: "", proximity: [] },
      { id: "b", address: "2 Elm St", whyOnList: "", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "", watchFor: "", proximity: [] },
    ],
  });
  const missing = describeMissingBuyerTourInputs(d);
  expect(missing).toContain("home 1 why it's on the list");
  expect(missing).toContain("home 2 why it's on the list");
  expect(missing).toContain("home 3 why it's on the list");
});

test("explicit requireWhy: true matches the default (byte-identical to today)", () => {
  const d = draft({
    homes: [
      { id: "a", address: "1 Oak St", whyOnList: "", watchFor: "", proximity: [] },
      { id: "b", address: "2 Elm St", whyOnList: "x", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "y", watchFor: "", proximity: [] },
    ],
  });
  expect(describeMissingBuyerTourInputs(d)).toEqual(
    describeMissingBuyerTourInputs(d, { requireWhy: true }),
  );
});

test("requireWhy: false (V2 publish) lets a tour publish with addresses only", () => {
  const d = draft({
    homes: [
      { id: "a", address: "1 Oak St", whyOnList: "", watchFor: "", proximity: [] },
      { id: "b", address: "2 Elm St", whyOnList: "", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "", watchFor: "", proximity: [] },
    ],
  });
  const missing = describeMissingBuyerTourInputs(d, { requireWhy: false });
  expect(missing).toHaveLength(0);
});

test("address stays required even when why is softened", () => {
  const d = draft({
    homes: [
      { id: "a", address: "", whyOnList: "", watchFor: "", proximity: [] },
      { id: "b", address: "2 Elm St", whyOnList: "", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "", watchFor: "", proximity: [] },
    ],
  });
  const missing = describeMissingBuyerTourInputs(d, { requireWhy: false });
  expect(missing).toContain("home 1 address");
  // ...but not the softened why.
  expect(missing.some((m) => m.includes("why"))).toBe(false);
});

test("buyer name + tour date + min-homes stay required in both modes", () => {
  const d = draft({ buyerName: "", tourDate: "", homes: draft().homes.slice(0, 2) });
  const missing = describeMissingBuyerTourInputs(d, { requireWhy: false });
  expect(missing).toContain("buyer name");
  expect(missing).toContain("tour date");
  expect(missing).toContain("at least 3 homes");
});

/* ---- Lever 2 reopen: draftFromPublicPayload ------------------------------- */

test("draftFromPublicPayload round-trips the buyer-facing fields of a published tour", () => {
  const source = draft({
    startTime: "9:30 AM",
    agentNote: "Planned this around your commute.",
    schoolLayer: true,
    commuteAnchor: { label: "Work", address: "500 Private Rd", lat: 30.1, lng: -97.7 },
    homes: [
      {
        id: "a",
        address: "1 Oak St",
        price: 735000,
        beds: 3,
        baths: 2,
        sqft: 2840,
        whyOnList: "Single level like you wanted",
        watchFor: "Steep driveway",
        proximity: [
          { category: "commute", label: "Downtown", value: "12 min", editedByAgent: true },
        ],
      },
      { id: "b", address: "2 Elm St", whyOnList: "Big yard", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "New kitchen", watchFor: "", proximity: [] },
    ],
  });
  const payload = toBuyerTourPublicPayload(source, { name: "Dana" }, "#0d9488");
  const reopened = draftFromPublicPayload(payload);

  expect(reopened.buyerName).toBe("The Rivas family");
  expect(reopened.tourDate).toBe("Saturday, July 12");
  expect(reopened.startTime).toBe("9:30 AM");
  expect(reopened.agentNote).toBe("Planned this around your commute.");
  expect(reopened.schoolLayer).toBe(true);
  expect(reopened.homes).toHaveLength(3);
  expect(reopened.homes[0].address).toBe("1 Oak St");
  expect(reopened.homes[0].price).toBe(735000);
  expect(reopened.homes[0].sqft).toBe(2840);
  expect(reopened.homes[0].whyOnList).toBe("Single level like you wanted");
  expect(reopened.homes[0].watchFor).toBe("Steep driveway");
  expect(reopened.homes[0].proximity[0]).toMatchObject({
    category: "commute",
    label: "Downtown",
    value: "12 min",
  });
});

test("draftFromPublicPayload keeps the commute-anchor label + coord but NOT the raw address", () => {
  const source = draft({
    commuteAnchor: { label: "Work", address: "500 Private Rd", lat: 30.1, lng: -97.7 },
  });
  const payload = toBuyerTourPublicPayload(source);
  const reopened = draftFromPublicPayload(payload);
  expect(reopened.commuteAnchor?.label).toBe("Work");
  expect(reopened.commuteAnchor?.lat).toBeCloseTo(30.1);
  // The agent-private raw address was dropped at publish and cannot be recovered.
  expect(reopened.commuteAnchor?.address).toBe("");
});

test("reconstructed chips are marked editedByAgent so a re-pull merges, not clobbers", () => {
  const source = draft({
    homes: [
      {
        id: "a",
        address: "1 Oak St",
        whyOnList: "x",
        watchFor: "",
        proximity: [{ category: "parks", label: "River Park", value: "0.3 mi" }],
      },
      { id: "b", address: "2 Elm St", whyOnList: "y", watchFor: "", proximity: [] },
      { id: "c", address: "3 Fir St", whyOnList: "z", watchFor: "", proximity: [] },
    ],
  });
  const payload = toBuyerTourPublicPayload(source);
  const reopened = draftFromPublicPayload(payload);
  const chip = reopened.homes[0].proximity[0];
  expect(chip.editedByAgent).toBe(true);
});

test("a reconstructed draft passes the SOFTENED publish gate (addresses present)", () => {
  const payload: BuyerTourPublicPayload = toBuyerTourPublicPayload(
    draft({
      homes: [
        { id: "a", address: "1 Oak St", whyOnList: "", watchFor: "", proximity: [] },
        { id: "b", address: "2 Elm St", whyOnList: "", watchFor: "", proximity: [] },
        { id: "c", address: "3 Fir St", whyOnList: "", watchFor: "", proximity: [] },
      ],
    }),
  );
  const reopened = draftFromPublicPayload(payload);
  expect(describeMissingBuyerTourInputs(reopened, { requireWhy: false })).toHaveLength(0);
});
