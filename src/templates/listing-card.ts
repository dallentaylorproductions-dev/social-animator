import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack } from "@/engine/easing";
import { drawImageCover } from "@/engine/draw";
import type { TemplateConfig } from "./types";

export const listingCardTemplate: TemplateConfig = {
  id: "listing-card",
  name: "Listing Card",
  description:
    "Showcase a property with photo, status, address, and price. Perfect for new listings, just-solds, and open houses.",
  duration: 8,
  sampleAssets: { heroPhoto: "/sample-assets/exterior.webp" },
  sampleState: {
    status: "Just Listed",
    address: "1247 Maple Heights Dr",
    cityState: "Beaverton, OR",
    price: "$685,000",
    beds: "4",
    baths: "3",
    sqft: "2,840",
  },
  fields: [
    { key: "heroPhoto", label: "Listing photo", type: "image", default: "" },
    {
      key: "status",
      label: "Status (e.g. Just Listed, Just Sold, Open House)",
      type: "text",
      default: "Just Listed",
    },
    { key: "price", label: "Price", type: "text", default: "$650,000" },
    { key: "address", label: "Street address", type: "text", default: "123 Maple Street" },
    { key: "cityState", label: "City, state, zip", type: "text", default: "Anytown, USA" },
    { key: "beds", label: "Beds", type: "text", default: "3" },
    { key: "baths", label: "Baths", type: "text", default: "2" },
    { key: "sqft", label: "Sq ft", type: "text", default: "1,840" },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "statusColor", label: "Status badge", type: "color", default: "#4ef2d9" },
    { key: "statusTextColor", label: "Status text", type: "color", default: "#0a0a0a" },
    { key: "addressColor", label: "Address", type: "color", default: "#ffffff" },
    { key: "cityStateColor", label: "City/state", type: "color", default: "#9ca3af" },
    { key: "priceColor", label: "Price", type: "color", default: "#4ef2d9" },
    { key: "statsColor", label: "Stats", type: "color", default: "#ffffff" },
  ],
  build(state, size, assets) {
    const { width, height } = size;
    const heroImg = assets?.heroPhoto ?? null;

    // Layout constants (designed for 1080-wide canvas)
    const topMargin = 80;
    const bottomMargin = 80;

    const badgeFontSize = 32;
    const badgePaddingH = 24;
    const badgePaddingV = 12;
    const badgeHeight = badgeFontSize + badgePaddingV * 2;

    const addressFontSize = 52;
    const cityStateFontSize = 30;
    const priceFontSize = 110;
    const statsFontSize = 28;

    const gapPhotoToBadge = 60;
    const gapBadgeToAddress = 46;
    const gapAddressToCity = 28;
    const gapCityToPrice = 50;
    const gapPriceToStats = 56;

    const contentBlockHeight =
      badgeHeight +
      gapBadgeToAddress +
      addressFontSize +
      gapAddressToCity +
      cityStateFontSize +
      gapCityToPrice +
      priceFontSize +
      gapPriceToStats +
      statsFontSize;

    // Photo height adapts to remaining canvas space
    const photoH = Math.max(
      300,
      height - topMargin - bottomMargin - contentBlockHeight - gapPhotoToBadge
    );

    const photoX = 60;
    const photoY = topMargin;
    const photoW = width - 120;
    const photoCorner = 28;

    const contentX = photoX;
    const badgeY = photoY + photoH + gapPhotoToBadge;
    const addressY =
      badgeY + badgeHeight + gapBadgeToAddress + addressFontSize / 2;
    const cityStateY =
      addressY + addressFontSize / 2 + gapAddressToCity + cityStateFontSize / 2;
    const priceY =
      cityStateY + cityStateFontSize / 2 + gapCityToPrice + priceFontSize / 2;
    const statsY =
      priceY + priceFontSize / 2 + gapPriceToStats + statsFontSize / 2;

    // Parse price for count-up (handles "$650,000", "$1.2M", "650K", etc.)
    const cleanedPrice = (state.price ?? "").replace(/,/g, "");
    const priceMatch = cleanedPrice.match(/^([^\d.-]*)([-+]?\d*\.?\d+)(.*)$/);
    const pricePrefix = priceMatch?.[1] ?? "";
    const priceNumStr = priceMatch?.[2] ?? "";
    const priceTarget = parseFloat(priceNumStr || "0");
    const priceSuffix = priceMatch?.[3] ?? "";
    const priceDecimals = priceNumStr.includes(".")
      ? priceNumStr.split(".")[1]?.length ?? 0
      : 0;

    const tracks: Track[] = [];

    // 1. Photo slides up + fades in
    tracks.push({
      id: "photo",
      start: 0.2,
      duration: 0.7,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 40);
        if (heroImg) {
          drawImageCover(ctx, heroImg, photoX, photoY, photoW, photoH, photoCorner);
        } else {
          ctx.fillStyle = "#1a1a1a";
          ctx.beginPath();
          ctx.roundRect(photoX, photoY, photoW, photoH, photoCorner);
          ctx.fill();
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 8]);
          ctx.beginPath();
          ctx.roundRect(photoX + 4, photoY + 4, photoW - 8, photoH - 8, photoCorner);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#666";
          ctx.font = "32px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            "Add a listing photo →",
            photoX + photoW / 2,
            photoY + photoH / 2
          );
        }
      },
    });

    // 2. Status badge pops in from the left with overshoot
    tracks.push({
      id: "badge",
      start: 0.6,
      duration: 0.55,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const offsetX = (1 - p) * -200;
        ctx.translate(offsetX, 0);
        ctx.globalAlpha = Math.min(1, p * 1.5);

        const badgeText = (state.status ?? "").toUpperCase();
        ctx.font = `700 ${badgeFontSize}px Inter, system-ui, sans-serif`;
        const textW = ctx.measureText(badgeText).width;
        const badgeW = textW + badgePaddingH * 2;
        const badgeXPos = contentX;

        ctx.fillStyle = state.statusColor;
        ctx.beginPath();
        ctx.roundRect(badgeXPos, badgeY, badgeW, badgeHeight, badgeHeight / 2);
        ctx.fill();

        ctx.fillStyle = state.statusTextColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          badgeText,
          badgeXPos + badgeW / 2,
          badgeY + badgeHeight / 2
        );
      },
    });

    // 3. Address rises in
    tracks.push({
      id: "address",
      start: 0.95,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 24);
        ctx.fillStyle = state.addressColor;
        ctx.font = `700 ${addressFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(state.address, contentX, addressY);
      },
    });

    // 4. City/state rises in
    tracks.push({
      id: "city",
      start: 1.1,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 18);
        ctx.fillStyle = state.cityStateColor;
        ctx.font = `400 ${cityStateFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(state.cityState, contentX, cityStateY);
      },
    });

    // 5. Price counts up
    tracks.push({
      id: "price",
      start: 1.35,
      duration: 1.4,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        const currentValue = priceTarget * p;
        const formatted =
          priceDecimals > 0
            ? currentValue.toFixed(priceDecimals)
            : Math.round(currentValue).toLocaleString();

        ctx.fillStyle = state.priceColor;
        ctx.font = `900 ${priceFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `${pricePrefix}${formatted}${priceSuffix}`,
          contentX,
          priceY
        );
      },
    });

    // 6. Stats row rises in
    tracks.push({
      id: "stats",
      start: 2.75,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 18);
        ctx.fillStyle = state.statsColor;
        ctx.font = `500 ${statsFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const beds = state.beds ? `${state.beds} BEDS` : "";
        const baths = state.baths ? `${state.baths} BATHS` : "";
        const sqft = state.sqft ? `${state.sqft} SQ FT` : "";
        const parts = [beds, baths, sqft].filter(Boolean);
        ctx.fillText(parts.join("  •  "), contentX, statsY);
      },
    });

    return new Timeline(tracks);
  },
};
