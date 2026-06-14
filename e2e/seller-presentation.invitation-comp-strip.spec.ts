import { test, expect } from "@playwright/test";

/**
 * Seller Presentation - Phase 2 (SP-AUTOFILL): the prepared invitation carries
 * NO comp price (pure-Node, no browser).
 *
 * Phase 2 auto-pulls nearby recent sales WITH their sold prices and stores the
 * full data on the PRIVATE draft (to seed Stage 2's pricing later). This spec
 * proves the public projection withholds every price path from a State A
 * publish, so a prepared invitation can never surface a comp price - while a
 * revealed / flag-off publish is byte-identical to today (full comp data).
 *
 * Guards three leak paths at once:
 *   1. whyPrice.comps[].soldPrice (the brief's nearby-sales cards)
 *   2. payload.comps[].soldPrice (feeds StateAPage's `nearbySoldRange` line)
 *   3. areaStats derived FROM comps (a comp-derived medianSale dollar figure)
 * and confirms Street View thumbnail data still passes through (image + street).
 */

import {
  toPublicPayload,
} from "../src/tools/seller-presentation/output/public-payload";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";
import type { Comp } from "../src/tools/seller-intelligence-report/engine/types";

const AGENT = { name: "Aaron Test", email: "aaron@example.com" };

/** A fully-priced, Street-View-resolved auto-pulled comp (what RentCast +
 *  client resolution produce in Phase 2). */
function pulledComp(over: Partial<Comp> = {}): Comp {
  return {
    address: "742 N Cedar St, Tacoma, WA 98406",
    soldPrice: "$685,000",
    soldDate: "2026-04-12T00:00:00.000Z",
    squareFeet: "2,210",
    yearBuilt: 1996,
    source: "imported",
    streetViewPanoId: "PANO_CEDAR",
    hasStreetView: true,
    streetViewHeading: 123,
    houseLat: 47.26,
    houseLng: -122.46,
    ...over,
  };
}

function draftWith(
  comps: Comp[],
  over: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft {
  return {
    propertyAddress: "1234 Test Drive NE",
    comps,
    pitchPoints: [],
    commitments: [],
    asks: [],
    valuationStatus: "preparing_for_walkthrough",
    appointmentAt: "2026-06-20T14:00",
    ...over,
  };
}

/** toPublicPayload positional args: (draft, agent, reviews, colors, whiteLabel,
 *  whyUs, compPhotos, sellerStateA). */
function project(
  draft: SellerPresentationDraft,
  { compPhotos, sellerStateA }: { compPhotos: boolean; sellerStateA: boolean },
) {
  return toPublicPayload(draft, AGENT, {}, {}, false, {}, compPhotos, sellerStateA);
}

test.describe("Invitation publish - comp prices are withheld", () => {
  test("State A (flag on + invitation): soldPrice stripped, street + thumb kept", () => {
    const payload = project(draftWith([pulledComp()]), {
      compPhotos: true,
      sellerStateA: true,
    });

    // Address survives; price does NOT (both comp arrays share the projection).
    expect(payload.whyPrice.comps).toHaveLength(1);
    expect(payload.whyPrice.comps[0].address).toBe(
      "742 N Cedar St, Tacoma, WA 98406",
    );
    expect(payload.whyPrice.comps[0].soldPrice).toBe("");
    expect(payload.comps[0].soldPrice).toBe("");
    // Analytic fields are omitted entirely in the invitation projection.
    expect(payload.whyPrice.comps[0].soldDate).toBeUndefined();
    expect(payload.whyPrice.comps[0].sqft).toBeUndefined();
    expect(payload.whyPrice.comps[0].yearBuilt).toBeUndefined();

    // Street View thumbnail data still passes through (image + street name).
    expect(payload.whyPrice.comps[0].streetViewPanoId).toBe("PANO_CEDAR");
    expect(payload.whyPrice.comps[0].hasStreetView).toBe(true);
    expect(payload.whyPrice.comps[0].streetViewHeading).toBe(123);

    // No dollar string anywhere in the serialized comps.
    const compsJson = JSON.stringify(payload.comps);
    expect(compsJson).not.toContain("$685,000");
    expect(compsJson).not.toContain("685000");
  });

  test("no comp-derived medianSale reaches a State A payload", () => {
    // Two priced comps would normally derive an areaStats.medianSale dollar
    // figure; in an invitation publish nothing should be derived from comps.
    const payload = project(
      draftWith([pulledComp(), pulledComp({ soldPrice: "$640,000" })]),
      { compPhotos: true, sellerStateA: true },
    );
    const serialized = JSON.stringify(payload.areaStats ?? {});
    expect(serialized).not.toContain("$685,000");
    expect(serialized).not.toContain("$640,000");
  });

  test("revealed (flag on, NOT invitation) keeps full comp data - unchanged", () => {
    const payload = project(
      draftWith([pulledComp()], { valuationStatus: "revealed" }),
      { compPhotos: true, sellerStateA: true },
    );
    expect(payload.comps[0].soldPrice).toBe("$685,000");
    expect(payload.comps[0].soldDate).toBe("2026-04-12T00:00:00.000Z");
    expect(payload.comps[0].sqft).toBe("2,210");
    expect(payload.comps[0].yearBuilt).toBe(1996);
  });

  test("flag OFF: invitation status is ignored, full comp data projected (byte-identical)", () => {
    const payload = project(draftWith([pulledComp()]), {
      compPhotos: true,
      sellerStateA: false,
    });
    expect(payload.comps[0].soldPrice).toBe("$685,000");
    expect(payload.comps[0].sqft).toBe("2,210");
  });
});
