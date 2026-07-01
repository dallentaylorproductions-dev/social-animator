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
    startTime: "9:30 AM",
    length: "About 2.5 hrs",
    meetingPoint: "Cafe",
    agentNote: "My note to you.",
    priorities: ["schools", "commute", "parks", "coffee", "grocery"],
    buyerPriorities: ["Short commute", "Home office"],
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

  test("v0.2 fields (buyerPriorities / startTime / length) project field-by-field", () => {
    const draft = maxedDraft();
    const payload = toBuyerTourPublicPayload(draft, { name: "Alex" });
    expect(payload.buyerPriorities).toEqual(["Short commute", "Home office"]);
    expect(payload.startTime).toBe("9:30 AM");
    expect(payload.length).toBe("About 2.5 hrs");

    // Read-time clamp keeps clean values and drops garbage entries.
    const clamped = clampBuyerTourPublicPayload({
      buyerName: "x",
      tourDate: "y",
      priorities: [],
      homes: [],
      buyerPriorities: ["Backyard", "", 42, "Walkable coffee"],
      startTime: "10:00 AM",
      length: "",
    });
    expect(clamped.buyerPriorities).toEqual(["Backyard", "Walkable coffee"]);
    expect(clamped.startTime).toBe("10:00 AM");
    expect(clamped.length).toBeUndefined();
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

  test("schoolLayer: a real boolean projects; a tampered non-boolean drops (never coerced on)", () => {
    const draft = maxedDraft();
    // Draft toggle on → boolean true projects.
    draft.schoolLayer = true;
    expect(toBuyerTourPublicPayload(draft, {}).schoolLayer).toBe(true);
    // Explicit false projects as false.
    draft.schoolLayer = false;
    expect(toBuyerTourPublicPayload(draft, {}).schoolLayer).toBe(false);
    // Absent → undefined (off).
    delete draft.schoolLayer;
    expect(toBuyerTourPublicPayload(draft, {}).schoolLayer).toBeUndefined();
    // A tampered truthy NON-boolean in KV must NOT become `true` (no coercion).
    expect(
      clampBuyerTourPublicPayload({
        buyerName: "x",
        tourDate: "y",
        priorities: [],
        homes: [],
        schoolLayer: "true",
      }).schoolLayer,
    ).toBeUndefined();
    expect(
      clampBuyerTourPublicPayload({
        buyerName: "x",
        tourDate: "y",
        priorities: [],
        homes: [],
        schoolLayer: 1,
      }).schoolLayer,
    ).toBeUndefined();
  });

  test("NO GreatSchools data can enter the payload — the ToS 3.2.2 no-store boundary", () => {
    // Even if GreatSchools-shaped fields are smuggled onto the draft/home/top-level,
    // the field-by-field projection never carries them (no-persistence, made code).
    const GS = "GREATSCHOOLS_SENTINEL_MUST_NOT_STORE";
    const clamped = clampBuyerTourPublicPayload({
      buyerName: "x",
      tourDate: "y",
      priorities: [],
      homes: [
        {
          address: "1 A St",
          whyOnList: "w",
          watchFor: "",
          proximity: [],
          // GreatSchools fields glued onto a home (e.g. a hand-edited KV record).
          ratingBand: GS,
          schools: [{ name: GS, ratingBand: "Above average", profileUrl: GS }],
          gsProfileUrl: GS,
        },
      ],
      // …and at the top level.
      greatSchools: [{ name: GS }],
      schoolData: GS,
    });
    const serialized = JSON.stringify(clamped);
    expect(serialized).not.toContain(GS);
    for (const key of ["ratingBand", "schools", "greatSchools", "schoolData", "gsProfileUrl"]) {
      expect(serialized).not.toContain(`"${key}":`);
    }
    // The one allowed new field is the plain boolean toggle only.
    expect(Object.keys(clamped.homes[0]).sort()).not.toContain("ratingBand");
  });

  test("proximityAll (V1): derives one chip per category, canonical order, projected field-by-field", () => {
    const draft = maxedDraft();
    // A home with several categories incl. a duplicate — proximityAll dedupes to one/cat.
    draft.homes = [
      {
        id: "h1",
        address: "1 A St",
        whyOnList: "w",
        watchFor: "",
        proximity: [
          { category: "commute", label: "Gate", value: "18 min" },
          { category: "schools", label: "Elm", value: "0.3 mi" },
          { category: "parks", label: "Pk", value: "0.4 mi" },
          { category: "coffee", label: "Cafe", value: "0.5 mi" },
          { category: "grocery", label: "Mart", value: "0.6 mi" },
          { category: "schools", label: "Second School", value: "0.9 mi" }, // dup category
        ],
      },
    ] as unknown as BuyerTourDraft["homes"];
    const payload = toBuyerTourPublicPayload(draft, { name: "Alex" });
    const all = payload.homes[0].proximityAll;
    expect(all).toBeDefined();
    // one per category, canonical order (schools, commute, parks, coffee, grocery)
    expect(all?.map((c) => c.category)).toEqual([
      "schools",
      "commute",
      "parks",
      "coffee",
      "grocery",
    ]);
    // the FIRST schools chip wins the dedupe
    expect(all?.find((c) => c.category === "schools")?.label).toBe("Elm");
    // inline `proximity` stays capped at MAX_PUBLIC_CHIPS
    expect(payload.homes[0].proximity.length).toBeLessThanOrEqual(3);

    // Read-time clamp round-trips proximityAll (prefers it over the capped inline set).
    const clamped = clampBuyerTourPublicPayload(payload as unknown);
    expect(clamped.homes[0].proximityAll?.map((c) => c.category)).toEqual([
      "schools",
      "commute",
      "parks",
      "coffee",
      "grocery",
    ]);
  });

  test("proximityAll: a home with nothing to add leaves the field absent (graceful)", () => {
    const clamped = clampBuyerTourPublicPayload({
      buyerName: "x",
      tourDate: "y",
      priorities: [],
      homes: [{ address: "1 A St", whyOnList: "w", watchFor: "", proximity: [] }],
    });
    expect(clamped.homes[0].proximityAll).toBeUndefined();
  });

  test("photo URL allow-list: http(s) + same-origin root-relative pass; js/data/protocol-relative drop", () => {
    const mk = (photoUrl: string) =>
      clampBuyerTourPublicPayload({
        buyerName: "x",
        tourDate: "y",
        priorities: [],
        buyerPriorities: [],
        homes: [
          { address: "1 A St", whyOnList: "w", watchFor: "", proximity: [], photoUrl },
        ],
      }).homes[0].photoUrl;

    // Allowed: absolute http(s) + same-origin root-relative (bundled assets).
    expect(mk("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(mk("/buyer-tour-samples/home-1.svg")).toBe("/buyer-tour-samples/home-1.svg");
    // Dropped: the dangerous + cross-origin forms.
    expect(mk("javascript:alert(1)")).toBeUndefined();
    expect(mk("data:image/png;base64,AAAA")).toBeUndefined();
    expect(mk("//evil.com/a.jpg")).toBeUndefined(); // protocol-relative = cross-origin
    expect(mk("ftp://x/a.jpg")).toBeUndefined();
    expect(mk("not a url")).toBeUndefined();
  });

  test("empty / absent input clamps to a safe minimal payload", () => {
    const payload = clampBuyerTourPublicPayload(null);
    expect(payload.templateVersion).toBe(1);
    expect(payload.homes).toEqual([]);
    expect(payload.priorities).toEqual([]);
    expect(payload.buyerName).toBe("");
  });
});
