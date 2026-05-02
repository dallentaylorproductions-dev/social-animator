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
/**
 * Maps the flyer form shape to the listing-showcase template's input.
 *
 * `brand` here is expected to be the EFFECTIVE brand (per-flyer color
 * overrides already merged in by the caller). The mapper just reads
 * brand.primaryColor / brand.accentColor — no separate override args.
 */
export function mapFlyerToShowcase(
  draft: FlyerDraft,
  photos: FlyerPhoto[],
  brand: BrandSettings,
  brandLogoImg: HTMLImageElement | null
): { state: TemplateState; assets: TemplateAssets } {
  const primary = brand.primaryColor || "#4ef2d9";

  const state: TemplateState = {
    // Image keys are present-but-empty — assets passed separately via build()
    heroPhoto: "",
    agentLogo: "",

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
    agentBrokerage: brand.brokerage || "",
    agentPhone: brand.contactPhone || "",
    agentLicense: brand.licenseNumber || "",

    background: "#0a0a0a",
    statusColor: primary,
    statusTextColor: "#0a0a0a",
    addressColor: "#ffffff",
    cityStateColor: "#9ca3af",
    priceColor: primary,
    statsColor: "#ffffff",
    featureColor: primary,
    featureTextColor: "#ffffff",
    agentNameColor: "#ffffff",
    agentMutedColor: "#9ca3af",
  };

  const assets: TemplateAssets = {
    heroPhoto: photos[0]?.img ?? null,
    agentLogo: brandLogoImg,
  };

  return { state, assets };
}
