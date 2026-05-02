import { type FlyerDraft, type FlyerPhoto } from "./types";
import { type BrandSettings } from "@/lib/brand";
import {
  type TemplateState,
  type TemplateAssets,
} from "@/templates/types";

/**
 * Bridge from the listing-flyer form shape (FlyerDraft + photos + brand
 * profile) to the listing-showcase template's (state, assets) input. Used by
 * the MP4 export path so we don't have two competing data models for the
 * same listing.
 */
export function mapFlyerToShowcase(
  draft: FlyerDraft,
  photos: FlyerPhoto[],
  brand: BrandSettings
): { state: TemplateState; assets: TemplateAssets } {
  const primary = brand.primaryColor || "#4ef2d9";

  const state: TemplateState = {
    // Image keys are present-but-empty — assets passed separately via build()
    heroPhoto: "",
    photo2: "",
    photo3: "",
    photo4: "",
    photo5: "",

    status: draft.status || "Just Listed",
    address: draft.addressLine1 || "",
    cityState: draft.addressLine2 || "",
    price: draft.price || "",
    beds: draft.beds || "",
    baths: draft.baths || "",
    sqft: draft.sqft || "",

    features: draft.features
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .join("\n"),

    agentName: brand.agentName || "",
    agentPhone: brand.contactPhone || "",

    background: "#0a0a0a",
    statusColor: primary,
    statusTextColor: "#0a0a0a",
    addressColor: "#ffffff",
    cityStateColor: "#9ca3af",
    priceColor: primary,
    statsColor: "#ffffff",
    featureColor: primary,
    featureTextColor: "#ffffff",
    agentCardColor: "#171717",
    agentCardTextColor: "#ffffff",
  };

  const assets: TemplateAssets = {
    heroPhoto: photos[0]?.img ?? null,
    photo2: photos[1]?.img ?? null,
    photo3: photos[2]?.img ?? null,
    photo4: photos[3]?.img ?? null,
    photo5: photos[4]?.img ?? null,
  };

  return { state, assets };
}
