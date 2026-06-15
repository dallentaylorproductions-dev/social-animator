import { test, expect } from "@playwright/test";

/**
 * Seller State A · Zone 5 — Settings recent listings → public payload PROJECTION.
 *
 * Proves the new wiring slice: the agent-entered Settings `recentListings`
 * (the editable source of truth) flow through the SHARED `brandToPublishInputs`
 * onto `brandWhyUs.recentListings`, and the publish projector emits them into
 * the coverflow payload exactly as the consumer render consumes them. This is
 * the deterministic half of "add in Settings → renders on the page": the
 * allowlist/clamp/cap behaviour itself is proven in publish-allowlist.spec; the
 * coverflow render in state-a-coverflow.spec. Here we close the Settings→payload
 * seam — including the one transform this slice owns: the view count is stored
 * as a formatted string ("41,184") and must reach the projector as an integer.
 */

import { brandToPublishInputs } from "../src/tools/seller-presentation/components/preview/preview-payload";
import { toPublicPayload } from "../src/tools/seller-presentation/output/public-payload";
import type { BrandSettings } from "../src/lib/brand";
import type { SettingsRecentListing } from "../src/lib/seller-presentation/recent-listings";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";

// A minimal invitation-status draft so the State A gate opens (a revealed draft
// drops every State A field, recentListings included).
function invitationDraft(): SellerPresentationDraft {
  return {
    propertyAddress: "1 Main St",
    valuationStatus: "preparing_for_walkthrough",
    comps: [],
    pitchPoints: [],
    commitments: [],
    asks: [],
  } as unknown as SellerPresentationDraft;
}

// A minimal BrandSettings carrying only what `brandToPublishInputs` reads, plus
// the recent listings under test.
function brandWith(recentListings: SettingsRecentListing[]): BrandSettings {
  return {
    logoDataUrl: null,
    agentName: "Aaron Test",
    primaryColor: "#037290",
    accentColor: "#ffffff",
    backgroundColor: "",
    contactEmail: "aaron@example.com",
    contactPhone: "2532028825",
    licenseNumber: "WA-12345",
    brokerage: "Test Realty",
    recentListings,
  };
}

// Project Settings → payload exactly as a State A invitation publish does, with
// both the State A gate and the coverflow flag ON.
function projectListings(recentListings: SettingsRecentListing[]) {
  const { agentContact, brandReviews, brandColors, brandWhyUs } =
    brandToPublishInputs(brandWith(recentListings));
  const payload = toPublicPayload(
    invitationDraft(),
    agentContact,
    brandReviews,
    brandColors,
    false, // whiteLabel
    brandWhyUs,
    false, // compPhotos
    true, // sellerStateA
    true, // listingsCoverflow
  );
  return payload;
}

test.describe("Settings recentListings → payload projection", () => {
  test("a formatted view count ('41,184') projects as an INTEGER on the card", () => {
    const payload = projectListings([
      {
        address: "1240 Hawthorne St",
        city: "Tacoma",
        viewCount: "41,184",
        photoUrl: "https://example.com/listing.webp",
      },
    ]);
    expect(payload.recentListings).toHaveLength(1);
    expect(payload.recentListings?.[0]).toEqual({
      address: "1240 Hawthorne St",
      city: "Tacoma",
      viewCount: 41184,
      photoUrl: "https://example.com/listing.webp",
    });
    expect(Number.isInteger(payload.recentListings?.[0]?.viewCount)).toBe(true);
  });

  test("a listing with no view count projects with NO number (honesty)", () => {
    const payload = projectListings([
      { address: "55 Quiet Ln", city: "Gig Harbor" },
    ]);
    expect(payload.recentListings?.[0]).toEqual({
      address: "55 Quiet Ln",
      city: "Gig Harbor",
    });
    expect(payload.recentListings?.[0]?.viewCount).toBeUndefined();
  });

  test("Street View fallback: pano + coverage flag project, never image bytes", () => {
    const payload = projectListings([
      {
        address: "4 Pano Pl",
        hasStreetView: true,
        streetViewPanoId: "PANO_ABC123",
        streetViewHeading: 200,
      },
    ]);
    expect(payload.recentListings?.[0]).toEqual({
      address: "4 Pano Pl",
      hasStreetView: true,
      streetViewPanoId: "PANO_ABC123",
      streetViewHeading: 200,
    });
    // No uploaded-photo URL on a Street-View-only row.
    expect(payload.recentListings?.[0]?.photoUrl).toBeUndefined();
  });

  test("the array is hard-capped at the cap even from Settings", () => {
    const many: SettingsRecentListing[] = Array.from({ length: 7 }, (_, i) => ({
      address: `${i} Cap St`,
      viewCount: String(i),
    }));
    const payload = projectListings(many);
    expect(payload.recentListings?.length).toBe(5);
  });

  test("no listings → no recentListings key (capability-cards-only)", () => {
    const payload = projectListings([]);
    expect(payload.recentListings).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"recentListings":');
  });

  test("flag OFF → Settings data does not reach the payload (byte-identical)", () => {
    const { agentContact, brandReviews, brandColors, brandWhyUs } =
      brandToPublishInputs(
        brandWith([{ address: "1240 Hawthorne St", viewCount: "41,184" }]),
      );
    const payload = toPublicPayload(
      invitationDraft(),
      agentContact,
      brandReviews,
      brandColors,
      false,
      brandWhyUs,
      false,
      true, // sellerStateA ON
      false, // listingsCoverflow OFF
    );
    expect(payload.recentListings).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"recentListings":');
  });
});
