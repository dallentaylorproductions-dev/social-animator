import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack, linear } from "@/engine/easing";
import { drawImageCover, wrapText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

/**
 * Listing Showcase — luxury-paced 14s reveal of a single listing. Modeled on
 * Listing Card but slower and more dramatic, designed to be watched (not
 * scrolled past). Powers the MP4 export from the Listing Flyer Generator
 * tool, but also fully usable standalone in Social Animator.
 *
 * Pacing:
 *   t=0–14s  hero photo Ken Burns zoom (1.0 → 1.08)
 *   t=1.0s   status badge slides in from left
 *   t=2.0s   address rises in
 *   t=2.3s   city/state rises in
 *   t=4.0s   price reveal with overshoot
 *   t=6.0s   stats stagger in (beds → baths → sqft, 0.2s offset each)
 *   t=8.0s   features reveal one by one (0.4s offset each, up to 5)
 *   t=12.0s  agent contact card slides up from bottom (if name or phone set)
 *   t=13.0s  final hold
 */
const DURATION = 14;

export const listingShowcaseTemplate: TemplateConfig = {
  id: "listing-showcase",
  name: "Listing Showcase",
  description:
    "Luxury-paced 14-second reveal of a single listing — slow zoom, dramatic price moment, feature highlights. Pairs with the Listing Flyer tool.",
  duration: DURATION,
  fields: [
    { key: "heroPhoto", label: "Hero photo", type: "image", default: "" },
    { key: "photo2", label: "Photo 2 (optional)", type: "image", default: "" },
    { key: "photo3", label: "Photo 3 (optional)", type: "image", default: "" },
    { key: "photo4", label: "Photo 4 (optional)", type: "image", default: "" },
    { key: "photo5", label: "Photo 5 (optional)", type: "image", default: "" },
    {
      key: "status",
      label: "Status",
      type: "text",
      default: "Just Listed",
    },
    { key: "address", label: "Street address", type: "text", default: "1247 Maple Heights Dr" },
    { key: "cityState", label: "City, state, zip", type: "text", default: "Beaverton, OR 97005" },
    { key: "price", label: "Price", type: "text", default: "$685,000" },
    { key: "beds", label: "Beds", type: "text", default: "4" },
    { key: "baths", label: "Baths", type: "text", default: "3" },
    { key: "sqft", label: "Sq ft", type: "text", default: "2,840" },
    {
      key: "features",
      label: "Feature bullets (one per line)",
      type: "textarea",
      default:
        "Chef's kitchen with quartz counters\nPrimary suite with spa bath\nFinished basement\nFenced backyard\n2-car garage",
    },
    {
      key: "agentName",
      label: "Agent name (end-card, optional)",
      type: "text",
      default: "",
    },
    {
      key: "agentPhone",
      label: "Agent phone (end-card, optional)",
      type: "text",
      default: "",
    },
    { key: "background", label: "Background", type: "color", default: "#0a0a0a" },
    { key: "statusColor", label: "Status badge", type: "color", default: "#4ef2d9" },
    { key: "statusTextColor", label: "Status text", type: "color", default: "#0a0a0a" },
    { key: "addressColor", label: "Address", type: "color", default: "#ffffff" },
    { key: "cityStateColor", label: "City/state", type: "color", default: "#9ca3af" },
    { key: "priceColor", label: "Price", type: "color", default: "#4ef2d9" },
    { key: "statsColor", label: "Stats", type: "color", default: "#ffffff" },
    { key: "featureColor", label: "Feature bullets", type: "color", default: "#4ef2d9" },
    { key: "featureTextColor", label: "Feature text", type: "color", default: "#ffffff" },
    { key: "agentCardColor", label: "Agent card", type: "color", default: "#171717" },
    { key: "agentCardTextColor", label: "Agent card text", type: "color", default: "#ffffff" },
  ],
  sampleAssets: { heroPhoto: "/sample-assets/exterior.webp" },
  sampleState: {
    status: "Just Listed",
    address: "1247 Maple Heights Dr",
    cityState: "Beaverton, OR 97005",
    price: "$685,000",
    beds: "4",
    baths: "3",
    sqft: "2,840",
  },
  build(state, size, assets) {
    const { width, height } = size;
    const heroImg = assets?.heroPhoto ?? null;

    // Layout — same proportions as listing-card so the user-experience is
    // familiar across both templates.
    const topMargin = 80;
    const bottomMargin = 80;

    const badgeFontSize = 32;
    const badgePaddingH = 24;
    const badgePaddingV = 12;
    const badgeHeight = badgeFontSize + badgePaddingV * 2;

    const addressFontSize = 56;
    const cityStateFontSize = 32;
    const priceFontSize = 120;
    const statsFontSize = 30;
    const featureFontSize = 28;
    const featureLineHeight = 42;

    const gapPhotoToBadge = 56;
    const gapBadgeToAddress = 40;
    const gapAddressToCity = 24;
    const gapCityToPrice = 44;
    const gapPriceToStats = 40;
    const gapStatsToFeatures = 32;

    // Estimate features block height (assumes one wrapped line per feature).
    const featureLines = (state.features ?? "")
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const featuresBlockHeight = featureLines.length * featureLineHeight;

    const contentBlockHeight =
      badgeHeight +
      gapBadgeToAddress +
      addressFontSize +
      gapAddressToCity +
      cityStateFontSize +
      gapCityToPrice +
      priceFontSize +
      gapPriceToStats +
      statsFontSize +
      (featuresBlockHeight > 0 ? gapStatsToFeatures + featuresBlockHeight : 0);

    const photoH = Math.max(
      300,
      height - topMargin - bottomMargin - contentBlockHeight - gapPhotoToBadge
    );
    const photoX = 60;
    const photoY = topMargin;
    const photoW = width - 120;
    const photoCorner = 32;

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
    const featuresStartY =
      statsY + statsFontSize / 2 + gapStatsToFeatures + featureLineHeight / 2;

    // Price count-up (same parser as Stat Highlight / Listing Card)
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

    // 1. Hero photo with Ken Burns zoom — runs the full duration so the
    //    image is always visible. Linear easing for a constant-rate zoom feel.
    tracks.push({
      id: "hero",
      start: 0,
      duration: DURATION,
      easing: linear,
      onUpdate: (p, ctx) => {
        const zoom = 1.0 + 0.08 * p; // 1.00 → 1.08
        const cx = photoX + photoW / 2;
        const cy = photoY + photoH / 2;

        ctx.save();
        // Clip to the rounded photo box so the zoom doesn't bleed onto
        // content below.
        ctx.beginPath();
        ctx.roundRect(photoX, photoY, photoW, photoH, photoCorner);
        ctx.clip();

        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);

        if (heroImg) {
          drawImageCover(ctx, heroImg, photoX, photoY, photoW, photoH, 0);
        } else {
          // Placeholder when no photo is uploaded
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(photoX, photoY, photoW, photoH);
          ctx.fillStyle = "#666";
          ctx.font = "28px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Add a hero photo →", cx, cy);
        }
        ctx.restore();
      },
    });

    // 2. Status badge (slides in from left at t=1s)
    tracks.push({
      id: "badge",
      start: 1.0,
      duration: 0.5,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const offsetX = (1 - p) * -200;
        ctx.translate(offsetX, 0);
        ctx.globalAlpha = Math.min(1, p * 1.5);

        const badgeText = (state.status ?? "").toUpperCase();
        ctx.font = `700 ${badgeFontSize}px Inter, system-ui, sans-serif`;
        const textW = ctx.measureText(badgeText).width;
        const badgeW = textW + badgePaddingH * 2;

        ctx.fillStyle = state.statusColor;
        ctx.beginPath();
        ctx.roundRect(contentX, badgeY, badgeW, badgeHeight, badgeHeight / 2);
        ctx.fill();

        ctx.fillStyle = state.statusTextColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, contentX + badgeW / 2, badgeY + badgeHeight / 2);
      },
    });

    // 3. Address (rises in at t=2s)
    tracks.push({
      id: "address",
      start: 2.0,
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

    // 4. City/state (rises in at t=2.3s)
    tracks.push({
      id: "cityState",
      start: 2.3,
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

    // 5. Price (dramatic reveal at t=4s — overshoot scale + count-up)
    tracks.push({
      id: "price",
      start: 4.0,
      duration: 0.7,
      // No track-level easing; we apply easeOutBack to scale and easeOutCubic
      // to the count-up separately.
      onUpdate: (p, ctx) => {
        // Scale flourish: easeOutBack 0.7 → 1.0
        const scaleEased = easeOutBack(Math.min(1, p));
        const scale = 0.7 + scaleEased * 0.3;

        // Count-up runs slightly into the reveal so the final number lands
        // crisp at p=1.
        const countEased = easeOutCubic(Math.min(1, p));
        const currentValue = priceTarget * countEased;
        const formatted =
          priceDecimals > 0
            ? currentValue.toFixed(priceDecimals)
            : Math.round(currentValue).toLocaleString();

        ctx.globalAlpha = Math.min(1, p * 1.3);
        // Anchor scale around price's left baseline so it grows rightward
        ctx.translate(contentX, priceY);
        ctx.scale(scale, scale);
        ctx.fillStyle = state.priceColor;
        ctx.font = `900 ${priceFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${pricePrefix}${formatted}${priceSuffix}`, 0, 0);
      },
    });

    // 6. Stats — stagger beds → baths → sqft at t=6s, 0.2s offset each
    const statItems = [
      { label: "BED", value: state.beds, plural: "BEDS" },
      { label: "BATH", value: state.baths, plural: "BATHS" },
      { label: "SQ FT", value: state.sqft, plural: "SQ FT" },
    ].filter((s) => (s.value ?? "").trim().length > 0);

    statItems.forEach((stat, i) => {
      tracks.push({
        id: `stat-${i}`,
        start: 6.0 + i * 0.2,
        duration: 0.5,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = p;
          ctx.translate(0, (1 - p) * 14);
          ctx.fillStyle = state.statsColor;
          ctx.font = `500 ${statsFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          // Render only the items up through this index — earlier items are
          // already painted by their own tracks. We need to compute x-offset
          // for this single item: bed first, then bath, then sqft.
          const before = statItems
            .slice(0, i)
            .map((s) =>
              `${s.value} ${s.value === "1" ? s.label : s.plural}  •  `
            )
            .join("");
          ctx.font = `500 ${statsFontSize}px Inter, system-ui, sans-serif`;
          const beforeWidth = ctx.measureText(before).width;
          const text = `${stat.value} ${
            stat.value === "1" ? stat.label : stat.plural
          }${i < statItems.length - 1 ? "  •  " : ""}`;
          ctx.fillText(text, contentX + beforeWidth, statsY);
        },
      });
    });

    // 7. Features — one by one starting at t=8s, 0.4s apart. Each track
    //    extends to the end of the timeline so we can run a fade-out phase
    //    just before the contact card slides in (otherwise the card visually
    //    covers the feature bullets at its final resting position).
    //
    //    Phases per feature:
    //      [start, start+0.4]                  fade in (rise + alpha)
    //      [start+0.4, DURATION-2.5]           hold visible
    //      [DURATION-2.5, DURATION-2.0]        fade out
    //      [DURATION-2.0, DURATION]            invisible (card slides in)
    const fadeInDur = 0.4;
    const fadeOutStartT = DURATION - 2.5;
    const fadeOutEndT = DURATION - 2.0;

    featureLines.forEach((line, i) => {
      const featureStartT = 8.0 + i * 0.4;
      const trackDuration = Math.max(0.001, DURATION - featureStartT);

      tracks.push({
        id: `feature-${i}`,
        start: featureStartT,
        duration: trackDuration,
        // No track-level easing; we apply easing per-phase inside onUpdate.
        onUpdate: (p, ctx) => {
          // Recover absolute time from track-relative progress.
          const t = featureStartT + p * trackDuration;

          let alpha: number;
          let translateY = 0;
          if (t < featureStartT + fadeInDur) {
            const inP = (t - featureStartT) / fadeInDur;
            alpha = easeOutCubic(inP);
            translateY = (1 - inP) * 12;
          } else if (t < fadeOutStartT) {
            alpha = 1;
          } else if (t < fadeOutEndT) {
            const outP = (t - fadeOutStartT) / (fadeOutEndT - fadeOutStartT);
            alpha = 1 - easeOutCubic(outP);
          } else {
            return; // fully invisible — skip painting
          }

          if (alpha <= 0) return;

          ctx.globalAlpha = alpha;
          if (translateY !== 0) ctx.translate(0, translateY);

          const y = featuresStartY + i * featureLineHeight;
          // Bullet
          ctx.fillStyle = state.featureColor;
          ctx.beginPath();
          ctx.arc(contentX + 8, y, 7, 0, Math.PI * 2);
          ctx.fill();
          // Text
          ctx.fillStyle = state.featureTextColor;
          ctx.font = `500 ${featureFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const maxW = width - contentX - 80;
          const lines = wrapText(ctx, line, maxW);
          lines.forEach((wrapped, lineIdx) => {
            ctx.fillText(wrapped, contentX + 32, y + lineIdx * featureLineHeight);
          });
        },
      });
    });

    // 8. Agent contact card — slides up from bottom at t=12s if either
    //    agentName or agentPhone is set. Otherwise skip; the brand watermark
    //    in the corner already handles agent identity.
    const hasAgent = !!(
      state.agentName?.trim() || state.agentPhone?.trim()
    );
    if (hasAgent) {
      const cardHeight = 140;
      const cardMargin = 60;
      const cardX = cardMargin;
      const cardY = height - cardMargin - cardHeight;
      const cardWidth = width - cardMargin * 2;

      tracks.push({
        id: "agentCard",
        start: DURATION - 2.0,
        duration: 2.0,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          // Slide up from below the bottom edge
          const offsetY = (1 - p) * (cardHeight + cardMargin + 40);
          ctx.translate(0, offsetY);
          ctx.globalAlpha = p;

          // Card background
          ctx.fillStyle = state.agentCardColor;
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 16);
          ctx.fill();

          // Agent name (left)
          ctx.fillStyle = state.agentCardTextColor;
          ctx.font = `700 36px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          if (state.agentName?.trim()) {
            ctx.fillText(
              state.agentName,
              cardX + 32,
              cardY + cardHeight / 2 - (state.agentPhone ? 18 : 0)
            );
          }

          // Phone (right or below name)
          if (state.agentPhone?.trim()) {
            ctx.font = `400 28px Inter, system-ui, sans-serif`;
            ctx.fillText(
              state.agentPhone,
              cardX + 32,
              cardY +
                cardHeight / 2 +
                (state.agentName ? 22 : 0)
            );
          }
        },
      });
    }

    return new Timeline(tracks);
  },
};
