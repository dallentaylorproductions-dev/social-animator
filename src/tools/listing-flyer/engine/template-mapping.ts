import { type FlyerDraft, type FlyerPhoto } from "./types";
import { type BrandSettings } from "@/lib/brand";
import {
  type TemplateState,
  type TemplateAssets,
} from "@/templates/types";
import { pickContrastText, pickContrastMuted } from "./contrast";

/**
 * Maps the flyer form shape to the listing-showcase template's input.
 *
 * `brand` here is expected to be the EFFECTIVE brand (per-flyer color
 * overrides already merged in by the caller in page.tsx). The mapper just
 * reads brand.primaryColor / brand.accentColor / brand.backgroundColor
 * directly — no separate override args.
 *
 * Color flow:
 *   - background           → brand.backgroundColor (flyer override or default)
 *   - primary brand fills  → brand.primaryColor (status badge, price, feature
 *     bullets, accent items)
 *   - text colors          → auto-flipped against background luminance, same
 *     formula as the PDF, so light text auto-applies on dark backgrounds and
 *     vice versa
 *   - status badge text    → contrast-flipped against primary (the badge fill)
 */
export function mapFlyerToShowcase(
  draft: FlyerDraft,
  photos: FlyerPhoto[],
  brand: BrandSettings,
  brandLogoImg: HTMLImageElement | null
): { state: TemplateState; assets: TemplateAssets } {
  const primary = brand.primaryColor || "#4ef2d9";
  const background = brand.backgroundColor || "#0a0a0a";

  // Auto-flip text colors based on background luminance — exactly the same
  // helpers the PDF uses, so PDF and MP4 stay visually consistent under any
  // background choice.
  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const badgeTextColor = pickContrastText(primary);

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

    // Stringified — TemplateState is Record<string, string>. The template's
    // build() parses this back to a number, falling back to its own default
    // (8s) for standalone callers that don't set this field.
    duration: String(draft.duration),

    agentName: brand.agentName || "",
    agentBrokerage: brand.brokerage || "",
    agentPhone: brand.contactPhone || "",
    agentLicense: brand.licenseNumber || "",

    background,
    statusColor: primary,
    statusTextColor: badgeTextColor,
    addressColor: textPrimary,
    cityStateColor: textMuted,
    priceColor: primary,
    statsColor: textPrimary,
    featureColor: primary,
    featureTextColor: textPrimary,
    agentNameColor: textPrimary,
    agentMutedColor: textMuted,
  };

  const assets: TemplateAssets = {
    heroPhoto: photos[0]?.img ?? null,
    agentLogo: brandLogoImg,
  };

  return { state, assets };
}
