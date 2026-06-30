import { test, expect } from "@playwright/test";

/**
 * Buyer Tour Brief — public-payload allow-list proof (BUYER_TOUR_BRIEF).
 *
 * The privacy boundary made code. The publish route calls
 * `toBuyerTourPublicPayload(draft, agentContact)` and passes ONLY the result to
 * `publishHandout`. This spec builds a maximally-populated draft with SENTINEL
 * strings in every private slot + rogue keys glued on, and asserts none of them
 * survive serialization. It also proves the read-time clamp re-drops a tampered
 * KV record.
 *
 * Pure-Node test — no browser, no HTTP. Privacy doesn't ride on routing.
 */

import {
  clampBuyerTourPublicPayload,
  toBuyerTourPublicPayload,
} from "../src/tools/buyer-tour-brief/output/public-payload";
import type { BuyerTourDraft } from "../src/tools/buyer-tour-brief/engine/types";

const S = {
  anchorAddress: "PRIVATE_SENTINEL_ANCHOR_ADDRESS",
  editedFlag: "PRIVATE_SENTINEL_EDITED_FLAG",
  rogueHomeKey: "PRIVATE_SENTINEL_ROGUE_HOME",
  rogueTopKey: "PRIVATE_SENTINEL_ROGUE_TOP",
  rogueAgentKey: "PRIVATE_SENTINEL_ROGUE_AGENT",
  dataUrlPhoto: "data:image/png;base64,PRIVATE_SENTINEL_DATAURL",
};

function maxedDraft(): BuyerTourDraft {
  return {
    buyerName: "Jordan",
    tourDate: "Saturday",
    meetingPoint: "Cafe",
    agentNote: "My note to you.",
    priorities: ["schools", "commute", "parks", "coffee", "grocery"],
    // The commute anchor's raw ADDRESS is agent-private and must never publish.
    commuteAnchor: {
      label: "JBLM gate",
      address: S.anchorAddress,
      lat: 47.08,
      lng: -122.58,
    },
    homes: [
      {
        id: "h1",
        address: "1 Cedar St",
        lat: 47.27,
        lng: -122.49,
        price: 600000,
        beds: 3,
        baths: 2,
        sqft: 1800,
        // A data: URL must be dropped (only hosted http(s) survives).
        photoUrl: S.dataUrlPhoto,
        whyOnList: "single level",
        watchFor: "steep driveway",
        proximity: [
          // editedByAgent is agent-private bookkeeping — must not publish.
          {
            category: "commute",
            label: "JBLM gate",
            value: "22 min drive",
            editedByAgent: true,
          },
        ],
        // Rogue key smuggled onto a home.
        notes: S.rogueHomeKey,
      } as unknown as BuyerTourDraft["homes"][number],
    ],
  };
}

test.describe("buyer-tour public-payload allow-list", () => {
  test("private + rogue fields never survive serialization", () => {
    const draft = maxedDraft();
    const agent = {
      name: "Alex",
      phone: "253-555-0142",
      // Rogue key smuggled onto a tampered agent record.
      negotiationNotes: S.rogueAgentKey,
    } as unknown as Parameters<typeof toBuyerTourPublicPayload>[1];
    const payload = toBuyerTourPublicPayload(draft, agent);
    const serialized = JSON.stringify(payload);

    for (const sentinel of [
      S.anchorAddress,
      S.rogueHomeKey,
      S.rogueAgentKey,
      S.dataUrlPhoto,
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
    // Bookkeeping + private key NAMES must be absent too.
    for (const key of ["editedByAgent", "address", "notes", "negotiationNotes"]) {
      // `address` is a home field name; assert it appears only as the public home
      // address, never on the commute anchor. Easiest: the anchor object has only
      // label + lat/lng.
      if (key === "address") continue;
      expect(serialized).not.toContain(`"${key}":`);
    }

    // The anchor publishes LABEL + coords only — no raw address.
    expect(payload.commuteAnchor?.label).toBe("JBLM gate");
    expect(
      (payload.commuteAnchor as unknown as Record<string, unknown>).address,
    ).toBeUndefined();

    // The data: URL photo was dropped.
    expect(payload.homes[0].photoUrl).toBeUndefined();
    // Stop order is 1-based + assigned by the serializer.
    expect(payload.homes[0].stop).toBe(1);
  });

  test("read-time clamp drops a hand-edited KV record's rogue keys", () => {
    const tampered = {
      templateVersion: 99,
      buyerName: "Jordan",
      tourDate: "Saturday",
      priorities: ["schools", "bogus-layer"],
      secretInternalField: S.rogueTopKey,
      commuteAnchor: { label: "Gate", address: S.anchorAddress, lat: 1, lng: 2 },
      agent: { name: "Alex", apiToken: S.rogueAgentKey },
      homes: [
        {
          address: "1 Cedar St",
          whyOnList: "x",
          watchFor: "y",
          proximity: [
            {
              category: "commute",
              label: "Gate",
              value: "5 min",
              editedByAgent: true,
            },
          ],
          internalScore: S.rogueHomeKey,
        },
      ],
    };
    const payload = clampBuyerTourPublicPayload(tampered);
    const serialized = JSON.stringify(payload);

    expect(payload.templateVersion).toBe(1);
    for (const sentinel of [
      S.rogueTopKey,
      S.rogueAgentKey,
      S.rogueHomeKey,
      S.anchorAddress,
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
    // The bogus layer is dropped; only the valid one survives, in canonical order.
    expect(payload.priorities).toEqual(["schools"]);
    expect(serialized).not.toContain("editedByAgent");
    expect(
      (payload.commuteAnchor as unknown as Record<string, unknown>).address,
    ).toBeUndefined();
  });

  test("brandAccent: a valid hex projects; an invalid / rogue value drops", () => {
    const draft = maxedDraft();
    // Valid #rrggbb survives.
    expect(toBuyerTourPublicPayload(draft, {}, "#7c3aed").brandAccent).toBe(
      "#7c3aed",
    );
    // Short #rgb survives.
    expect(toBuyerTourPublicPayload(draft, {}, "#abc").brandAccent).toBe("#abc");
    // A non-hex string (e.g. an injection attempt) drops to undefined — never
    // rendered straight into CSS.
    expect(
      toBuyerTourPublicPayload(draft, {}, "javascript:alert(1)").brandAccent,
    ).toBeUndefined();
    // Read-time clamp re-drops a tampered accent.
    expect(
      clampBuyerTourPublicPayload({
        buyerName: "x",
        tourDate: "y",
        priorities: [],
        homes: [],
        brandAccent: "rgb(0,0,0); content:bad",
      }).brandAccent,
    ).toBeUndefined();
  });

  test("empty / absent input clamps to a safe minimal payload", () => {
    const payload = clampBuyerTourPublicPayload(null);
    expect(payload.templateVersion).toBe(1);
    expect(payload.homes).toEqual([]);
    expect(payload.priorities).toEqual([]);
    expect(payload.buyerName).toBe("");
  });
});
