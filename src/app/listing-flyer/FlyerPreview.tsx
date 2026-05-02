"use client";

import { type FlyerDraft, type FlyerPhoto } from "@/tools/listing-flyer/engine/types";
import { type BrandSettings } from "@/lib/brand";

interface FlyerPreviewProps {
  draft: FlyerDraft;
  photos: FlyerPhoto[];
  brand: BrandSettings;
}

/**
 * HTML/CSS approximation of the PDF flyer. NOT the actual export — that's
 * generated via @react-pdf/renderer in H-1b. This is just a live preview so
 * the agent can see the result while typing.
 *
 * Designed at US Letter portrait aspect (8.5 × 11 = 0.773). Renders inside a
 * fixed-aspect container so the proportions match the PDF.
 */
export function FlyerPreview({ draft, photos, brand }: FlyerPreviewProps) {
  const heroPhoto = photos[0];
  const additionalPhotos = photos.slice(1);
  const primary = brand.primaryColor || "#4ef2d9";

  // Stats row text — only render parts that are filled in
  const statsParts: string[] = [];
  if (draft.beds) statsParts.push(`${draft.beds} BED${draft.beds === "1" ? "" : "S"}`);
  if (draft.baths) statsParts.push(`${draft.baths} BATH${draft.baths === "1" ? "" : "S"}`);
  if (draft.sqft) statsParts.push(`${draft.sqft} SQ FT`);

  return (
    <div
      className="bg-white text-neutral-900 shadow-2xl mx-auto overflow-hidden"
      style={{
        aspectRatio: "8.5 / 11",
        maxWidth: "100%",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      {/* Header band */}
      <div
        className="px-5 py-3 flex items-center gap-3 text-white"
        style={{ backgroundColor: brand.accentColor || "#0a0a0a" }}
      >
        {brand.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoDataUrl}
            alt="Brand logo"
            className="h-8 w-auto object-contain"
          />
        ) : (
          <div
            className="h-8 w-8 rounded-sm flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: primary, color: "#000" }}
          >
            LOGO
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold truncate">
            {brand.agentName || "Your name"}
          </p>
          <p className="text-[8px] opacity-70 truncate">
            {brand.brokerage || "Brokerage"}
          </p>
        </div>
        <div className="text-right text-[8px] opacity-80 leading-tight">
          {brand.contactPhone && <div>{brand.contactPhone}</div>}
          {brand.contactEmail && <div>{brand.contactEmail}</div>}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {draft.status && (
          <span
            className="inline-block text-[8px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
            style={{ backgroundColor: primary, color: "#000" }}
          >
            {draft.status}
          </span>
        )}

        {/* Hero photo */}
        <div
          className="mt-3 w-full bg-neutral-200 rounded-sm overflow-hidden"
          style={{ aspectRatio: "16 / 10" }}
        >
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroPhoto.url}
              alt="Hero"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px]">
              Hero photo
            </div>
          )}
        </div>

        {/* Address + price */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">
              {draft.addressLine1 || "Street address"}
            </h1>
            {draft.addressLine2 && (
              <p className="text-[10px] text-neutral-600 truncate">
                {draft.addressLine2}
              </p>
            )}
          </div>
          <p
            className="text-xl font-extrabold whitespace-nowrap"
            style={{ color: primary }}
          >
            {draft.price || "$—"}
          </p>
        </div>

        {/* Stats */}
        {statsParts.length > 0 && (
          <p className="mt-2 text-[10px] font-semibold tracking-wide text-neutral-700">
            {statsParts.join("  •  ")}
          </p>
        )}

        {/* Features */}
        {draft.features.filter((f) => f.trim()).length > 0 && (
          <ul className="mt-3 space-y-1">
            {draft.features
              .filter((f) => f.trim())
              .map((feature, i) => (
                <li
                  key={i}
                  className="text-[9px] text-neutral-700 flex items-start gap-2"
                >
                  <span
                    className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: primary }}
                  />
                  {feature}
                </li>
              ))}
          </ul>
        )}

        {/* Photo grid */}
        {additionalPhotos.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {additionalPhotos.map((photo) => (
              <div
                key={photo.id}
                className="bg-neutral-200 rounded-sm overflow-hidden"
                style={{ aspectRatio: "4 / 3" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer band */}
      <div
        className="absolute-not-really mt-auto px-5 py-2 text-white text-[7px] flex items-center justify-between"
        style={{ backgroundColor: brand.accentColor || "#0a0a0a" }}
      >
        <span className="truncate">
          {brand.agentName || "Your name"}
          {brand.licenseNumber && ` · ${brand.licenseNumber}`}
        </span>
        <span className="opacity-70 truncate">
          {[brand.contactPhone, brand.contactEmail].filter(Boolean).join("  ·  ")}
        </span>
      </div>
    </div>
  );
}
