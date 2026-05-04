import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack, linear } from "@/engine/easing";
import { drawImageCover, drawImageContain, wrapText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

/**
 * Listing Showcase — social-native 8s reveal.
 *
 * Layout (vertically stacked, three regions):
 *   1. Hero photo with Ken Burns zoom (top — fixed fraction of canvas height)
 *   2. Info block (badge → address → city → price → stats), compact stack
 *   3. Bottom section: features (left column, up to 5) + agent info (right
 *      column: logo, name, brokerage, phone, license #)
 *
 * Aspect awareness: hero gets a fixed PROPORTION of canvas height instead of
 * "whatever's left after content stacks". That keeps the hero usable at both
 * 9:16 (Reel/Story) and 1:1 (Square) — center-cropping a phone-shaped photo
 * into a reasonable rectangle, instead of squeezing it to a thin band at 1:1.
 *
 * Pacing — compressed from the original 14s "luxury" version to 8s for
 * social-native viewing. Reels/Stories want info up FAST so the viewer
 * has time to read; H-1.5v further tightened entries to land within the
 * first 3.3s, leaving ~4.7s of static dwell — the inverse of the old
 * "5.4s entry, 2.6s dwell" ratio that read as too leisurely on social.
 *
 *   t=0–8s    hero Ken Burns zoom (1.0 → 1.08, linear over full duration)
 *   t=0.3s    status badge slides in from left
 *   t=0.7s    address rises in
 *   t=0.9s    city/state rises in
 *   t=1.3s    price reveal with overshoot + count-up
 *   t=1.9s    stats stagger in (beds → baths → sqft, 0.10s offset)
 *   t=2.4s    features stagger in (left column, 0.15s offset, MAX 5)
 *   t=2.7s    agent info card fades in (right column, slight rise)
 *   t=3.3s    last entry lands; static dwell to t=8s
 */
const DURATION = 8;

export const listingShowcaseTemplate: TemplateConfig = {
  id: "listing-showcase",
  name: "Listing Showcase",
  description:
    "Luxury-paced 14-second reveal of a single listing — slow zoom, dramatic price moment, feature highlights with agent contact card. Pairs with the Listing Flyer tool.",
  duration: DURATION,
  fields: [
    { key: "heroPhoto", label: "Hero photo", type: "image", default: "" },
    { key: "agentLogo", label: "Agent logo (optional)", type: "image", default: "" },
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
      label: "Feature bullets (one per line — up to 5)",
      type: "textarea",
      default:
        "Chef's kitchen with quartz counters\nPrimary suite with spa bath\nFinished basement",
    },
    {
      key: "agentName",
      label: "Agent name",
      type: "text",
      default: "",
    },
    {
      key: "agentBrokerage",
      label: "Brokerage",
      type: "text",
      default: "",
    },
    {
      key: "agentPhone",
      label: "Agent phone",
      type: "text",
      default: "",
    },
    {
      key: "agentLicense",
      label: "License # (optional)",
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
    { key: "agentNameColor", label: "Agent name", type: "color", default: "#ffffff" },
    { key: "agentMutedColor", label: "Agent body text", type: "color", default: "#9ca3af" },
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
    agentName: "Jordan Reeves",
    agentBrokerage: "Skyline Realty",
    agentPhone: "(503) 555-0188",
  },
  build(state, size, assets) {
    const { width, height } = size;
    const heroImg = assets?.heroPhoto ?? null;
    const agentLogoImg = assets?.agentLogo ?? null;

    // ── Aspect-aware layout ─────────────────────────────────────────────
    // Square (1:1) is height-constrained — compress vertical sizing.
    const isShort = height < 1300;

    // Square (1:1) gets a slightly tighter horizontal margin so the hero box
    // has more horizontal room to work with. With center-cropping a typical
    // landscape phone photo (4:3) into a wider box, more of the photo's
    // useful content (the front door, key features) stays visible.
    const horizontalMargin = isShort ? 40 : 60;
    const topMargin = isShort ? 60 : 80;
    const bottomMargin = isShort ? 50 : 60;

    // Hero: fixed proportion of canvas height. Pre-H-1.5 the height was
    // computed as "whatever's left after the content stack" and squashed to
    // a 300px sliver at 1:1 — center-cropping that thin band lost the front
    // of the house. Anchoring to a canvas-height proportion keeps the hero
    // usably tall at every aspect, and drawImageCover then center-crops both
    // axes to keep the subject framed.
    // 9:16 hero bumped from 0.46 → 0.52 to (a) make the hero more visually
    // dominant (it's the focal point of a real-estate flyer) and (b) absorb
    // the vertical slack that opened up when CHANGE 14 anchored the bottom
    // row to the frame bottom — without the bump, 9:16 had ~220pt of empty
    // canvas between the stats line and the features list.
    const heroH = Math.floor(height * (isShort ? 0.42 : 0.52));
    const heroX = horizontalMargin;
    const heroY = topMargin;
    const heroW = width - horizontalMargin * 2;
    const heroCorner = isShort ? 24 : 32;

    // Info block: badge / address / city / price / stats
    const badgeFontSize = isShort ? 26 : 32;
    const badgePaddingH = isShort ? 20 : 24;
    const badgePaddingV = isShort ? 9 : 12;
    const badgeHeight = badgeFontSize + badgePaddingV * 2;

    const addressFontSize = isShort ? 42 : 56;
    const cityStateFontSize = isShort ? 24 : 32;
    // Price was a billboard at 88/120pt — still the dominant info-side
    // element at 72/96pt, but no longer crowding everything else.
    const priceFontSize = isShort ? 72 : 96;
    const statsFontSize = isShort ? 24 : 30;

    // Inter-group gaps tightened ~25% to remove dead vertical space between
    // sections without crossing into "cramped". Hero, badge, address, price,
    // stats, and bottom block read as a deliberate rhythm now.
    const gapHeroToBadge = isShort ? 21 : 30;
    const gapBadgeToAddress = isShort ? 14 : 21;
    const gapAddressToCity = isShort ? 11 : 17;
    const gapCityToPrice = isShort ? 17 : 27;
    const gapPriceToStats = isShort ? 18 : 27;

    const contentX = horizontalMargin;
    const heroBottom = heroY + heroH;
    const badgeY = heroBottom + gapHeroToBadge;
    const addressY = badgeY + badgeHeight + gapBadgeToAddress + addressFontSize / 2;
    const cityStateY = addressY + addressFontSize / 2 + gapAddressToCity + cityStateFontSize / 2;
    const priceY = cityStateY + cityStateFontSize / 2 + gapCityToPrice + priceFontSize / 2;
    const statsY = priceY + priceFontSize / 2 + gapPriceToStats + statsFontSize / 2;

    // Two-column split with a gap in the middle. On 9:16, feature bullets
    // ("Indoor Pool", "Open Bar") are short and don't need an even half of
    // the canvas width — so we give the agent column more room. On 1:1 the
    // 50/50 split was truncating "Chef's kitchen with quartz counters" once
    // CHANGE 14 bumped the feature font; rebalance to 55/45 so longer
    // feature copy renders in full while leaving enough agent-side budget
    // for "Aaron Thomas Home Team".
    const columnGap = isShort ? 40 : 60;
    const featuresColRatio = isShort ? 0.55 : 0.35;
    const usableW = width - horizontalMargin * 2 - columnGap;
    const featuresColW = Math.floor(usableW * featuresColRatio);
    const agentColW = usableW - featuresColW;
    const leftColX = horizontalMargin;
    const rightColX = horizontalMargin + featuresColW + columnGap;

    // Features (left column). Bumped ~17-20% over the H-1.5o sizes once the
    // bottom section started anchoring to the frame bottom — the freed-up
    // slack absorbs the bigger type without crowding hero/info above.
    const featureFontSize = isShort ? 28 : 36;
    const featureLineHeight = isShort ? 44 : 58;
    const featureBulletRadius = isShort ? 6 : 8;

    // Agent info (right column) — header row (logo + name side-by-side) on
    // top, then a tight stack of brokerage / phone / license below. Header
    // row height = logo size; logo and name are vertical-center-aligned.
    const logoSize = isShort ? 48 : 64;
    const logoToNameGap = 12;
    const agentNameSize = isShort ? 28 : 38;
    // Secondary agent text bumped a second time after the bottom section
    // gained vertical slack from frame-bottom anchoring. Header is still
    // dominant — name > brokerage > phone > license.
    const agentBrokerageSize = isShort ? 25 : 31;
    const agentPhoneSize = isShort ? 25 : 31;
    const agentLicenseSize = isShort ? 19 : 25;
    const agentRowGap = isShort ? 4 : 6;

    // ── Parse features ──────────────────────────────────────────────────
    const featureLines = (state.features ?? "")
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5); // matches MAX_FEATURES — PDF and MP4 are now in parity

    // ── Bottom section anchor ───────────────────────────────────────────
    // Anchor the bottom row to the frame bottom (with bottomMargin inset)
    // instead of stacking it at gapStatsToBottom below the info block.
    // With 5 features instead of 3, the bottom row got taller; bottom-
    // anchoring lets the row push UP into the slack space rather than
    // crowding stats/price above. The empty space between the info block
    // and the bottom row absorbs whatever's left.
    const hasAgentContent = !!(
      state.agentName?.trim() ||
      state.agentBrokerage?.trim() ||
      state.agentPhone?.trim() ||
      agentLogoImg
    );
    const featureColH =
      featureLines.length > 0
        ? logoSize / 2 +
          (featureLines.length - 1) * featureLineHeight +
          featureFontSize / 2
        : 0;
    const agentColH = hasAgentContent
      ? logoSize +
        (state.agentBrokerage?.trim() ? agentRowGap + agentBrokerageSize : 0) +
        (state.agentPhone?.trim() ? agentRowGap + agentPhoneSize : 0) +
        (state.agentLicense?.trim() ? agentRowGap + agentLicenseSize : 0)
      : 0;
    const bottomRowH = Math.max(featureColH, agentColH);

    // Anchor strategy differs by aspect:
    //   1:1 (isShort): height-constrained — anchor bottom row to frame
    //     bottom (with bottomMargin inset) so it pushes UP into whatever
    //     slack is left between info block and bottom margin.
    //   9:16 (tall):  was creating a 220pt void mid-canvas with the same
    //     bottom-anchor strategy. Switch to info-block-anchored: bottom row
    //     flows directly under stats with the same gap rhythm as the rest
    //     of the info block. With the heroH 0.46→0.52 bump, the slack now
    //     sits as breathing room at the BOTTOM of the frame (~120-150pt),
    //     reading as deliberate margin rather than mid-page emptiness.
    const gapStatsToBottom = isShort ? 17 : 27;
    const statsEndY = statsY + statsFontSize / 2;
    const bottomSectionY = isShort
      ? height - bottomMargin - bottomRowH
      : statsEndY + gapStatsToBottom;

    // ── Parse price for count-up ────────────────────────────────────────
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

    // ── 1. Hero photo with Ken Burns zoom ───────────────────────────────
    tracks.push({
      id: "hero",
      start: 0,
      duration: DURATION,
      easing: linear,
      onUpdate: (p, ctx) => {
        const zoom = 1.0 + 0.08 * p;
        const cx = heroX + heroW / 2;
        const cy = heroY + heroH / 2;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(heroX, heroY, heroW, heroH, heroCorner);
        ctx.clip();

        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);

        if (heroImg) {
          // drawImageCover always center-crops both axes; combined with the
          // 0.46-of-canvas hero height, 1:1 now keeps the middle band of a
          // typical landscape phone photo instead of a thin sliver.
          drawImageCover(ctx, heroImg, heroX, heroY, heroW, heroH, 0);
        } else {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(heroX, heroY, heroW, heroH);
          ctx.fillStyle = "#666";
          ctx.font = `${isShort ? 22 : 28}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Add a hero photo →", cx, cy);
        }
        ctx.restore();
      },
    });

    // ── 2. Status badge ─────────────────────────────────────────────────
    tracks.push({
      id: "badge",
      start: 0.3,
      duration: 0.25,
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

    // ── 3. Address ──────────────────────────────────────────────────────
    tracks.push({
      id: "address",
      start: 0.7,
      duration: 0.25,
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

    // ── 4. City/state ───────────────────────────────────────────────────
    tracks.push({
      id: "cityState",
      start: 0.9,
      duration: 0.25,
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

    // ── 5. Price (overshoot + count-up) ─────────────────────────────────
    tracks.push({
      id: "price",
      start: 1.3,
      duration: 0.3,
      onUpdate: (p, ctx) => {
        const scaleEased = easeOutBack(Math.min(1, p));
        const scale = 0.7 + scaleEased * 0.3;

        const countEased = easeOutCubic(Math.min(1, p));
        const currentValue = priceTarget * countEased;
        const formatted =
          priceDecimals > 0
            ? currentValue.toFixed(priceDecimals)
            : Math.round(currentValue).toLocaleString();

        ctx.globalAlpha = Math.min(1, p * 1.3);
        ctx.translate(contentX, priceY);
        ctx.scale(scale, scale);
        ctx.fillStyle = state.priceColor;
        ctx.font = `900 ${priceFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${pricePrefix}${formatted}${priceSuffix}`, 0, 0);
      },
    });

    // ── 6. Stats stagger ────────────────────────────────────────────────
    const statItems = [
      { label: "BED", value: state.beds, plural: "BEDS" },
      { label: "BATH", value: state.baths, plural: "BATHS" },
      { label: "SQ FT", value: state.sqft, plural: "SQ FT" },
    ].filter((s) => (s.value ?? "").trim().length > 0);

    statItems.forEach((stat, i) => {
      tracks.push({
        id: `stat-${i}`,
        start: 1.9 + i * 0.1,
        duration: 0.25,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = p;
          ctx.translate(0, (1 - p) * 14);
          ctx.fillStyle = state.statsColor;
          ctx.font = `500 ${statsFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const before = statItems
            .slice(0, i)
            .map((s) =>
              `${s.value} ${s.value === "1" ? s.label : s.plural}  •  `
            )
            .join("");
          const beforeWidth = ctx.measureText(before).width;
          const text = `${stat.value} ${
            stat.value === "1" ? stat.label : stat.plural
          }${i < statItems.length - 1 ? "  •  " : ""}`;
          ctx.fillText(text, contentX + beforeWidth, statsY);
        },
      });
    });

    // ── 7. Features (left column, max 3, no fade-out) ───────────────────
    // First-feature optical center anchors to the agent column's header row
    // center (bottomSectionY + logoSize/2). Without this, features sat at
    // bottomSectionY + featureLineHeight/2 (e.g. y=+25) while the agent
    // header centered at bottomSectionY + logoSize/2 (e.g. y=+32) — visibly
    // off by a few pixels even though both columns "started" at the same Y.
    const firstFeatureCenterY = bottomSectionY + logoSize / 2;

    featureLines.forEach((line, i) => {
      tracks.push({
        id: `feature-${i}`,
        start: 2.4 + i * 0.15,
        duration: 0.3,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = p;
          ctx.translate(0, (1 - p) * 14);

          const y = firstFeatureCenterY + i * featureLineHeight;
          // Bullet
          ctx.fillStyle = state.featureColor;
          ctx.beginPath();
          ctx.arc(leftColX + featureBulletRadius + 2, y, featureBulletRadius, 0, Math.PI * 2);
          ctx.fill();
          // Text
          ctx.fillStyle = state.featureTextColor;
          ctx.font = `500 ${featureFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const textX = leftColX + featureBulletRadius * 2 + 16;
          const maxW = featuresColW - (featureBulletRadius * 2 + 16);
          // Single-line truncate-via-wrap (we render only the first wrapped
          // line so each feature stays on its own row even with long copy)
          const lines = wrapText(ctx, line, maxW);
          if (lines.length > 0) {
            ctx.fillText(lines[0], textX, y);
          }
        },
      });
    });

    // ── 8. Agent info card (right column, fade in + stay visible) ──────
    if (hasAgentContent) {
      tracks.push({
        id: "agentCard",
        start: 2.7,
        duration: 0.4,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = p;
          ctx.translate(0, (1 - p) * 20);

          // Top-anchored: same Y as the first feature line so both columns
          // start at the same horizontal level. No bottom-of-frame anchoring.
          let cursorY = bottomSectionY;

          // Agent column's right boundary = canvas right edge minus the
          // shared horizontalMargin. All agent content is truncated to this
          // limit so long names/brokerages don't crowd the canvas right edge
          // (which previously made the column visibly closer to the edge
          // than the features-column gutter on the left).
          const truncateToWidth = (text: string, maxW: number): string => {
            if (ctx.measureText(text).width <= maxW) return text;
            let truncated = text;
            while (
              truncated.length > 1 &&
              ctx.measureText(truncated + "…").width > maxW
            ) {
              truncated = truncated.slice(0, -1);
            }
            return truncated + "…";
          };

          // ── Header row: logo + name side-by-side ─────────────────────
          // Logo and name are vertically centered on each other so they
          // read as one unit ("[LOGO] Aaron Thomas Home Team"), not as
          // logo-stacked-above-name.
          const headerRowHeight = state.agentName?.trim() || agentLogoImg
            ? logoSize
            : 0;
          const headerCenterY = cursorY + logoSize / 2;
          let textStartX = rightColX;
          let usedLogoW = 0;

          if (agentLogoImg) {
            const aspect =
              agentLogoImg.naturalWidth /
              Math.max(1, agentLogoImg.naturalHeight);
            usedLogoW = Math.min(agentColW * 0.45, logoSize * Math.min(2.2, aspect));
            drawImageContain(
              ctx,
              agentLogoImg,
              rightColX,
              cursorY,
              usedLogoW,
              logoSize,
              0
            );
            textStartX = rightColX + usedLogoW + logoToNameGap;
          }

          if (state.agentName?.trim()) {
            ctx.fillStyle = state.agentNameColor;
            ctx.font = `700 ${agentNameSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            // Available width = column right edge minus where text starts.
            const nameMaxW = rightColX + agentColW - textStartX;
            ctx.fillText(
              truncateToWidth(state.agentName, nameMaxW),
              textStartX,
              headerCenterY
            );
          }

          if (headerRowHeight > 0) {
            // Same gap below the header as between body lines — uniform
            // spacing reads as one tight group rather than "header, then
            // a paragraph below".
            cursorY += headerRowHeight + agentRowGap;
          }

          // ── Brokerage ────────────────────────────────────────────────
          if (state.agentBrokerage?.trim()) {
            ctx.fillStyle = state.agentMutedColor;
            ctx.font = `500 ${agentBrokerageSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(
              truncateToWidth(state.agentBrokerage, agentColW),
              rightColX,
              cursorY
            );
            cursorY += agentBrokerageSize + agentRowGap;
          }

          // ── Phone (with optional inline license #) ───────────────────
          // Format license as "License #1234" so it doesn't read as a
          // stray number. Inline with phone if it fits in the column,
          // else fall through to its own line.
          const phoneText = state.agentPhone?.trim() ?? "";
          const licenseText = state.agentLicense?.trim()
            ? `License #${state.agentLicense.trim().replace(/^#/, "")}`
            : "";

          if (phoneText) {
            ctx.fillStyle = state.agentNameColor;
            ctx.font = `500 ${agentPhoneSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";

            const combined = licenseText
              ? `${phoneText}  ·  ${licenseText}`
              : phoneText;

            if (licenseText && ctx.measureText(combined).width > agentColW) {
              // Won't fit on one line — render phone now, license below.
              ctx.fillText(
                truncateToWidth(phoneText, agentColW),
                rightColX,
                cursorY
              );
              cursorY += agentPhoneSize + agentRowGap;
              ctx.fillStyle = state.agentMutedColor;
              ctx.font = `400 ${agentLicenseSize}px Inter, system-ui, sans-serif`;
              ctx.fillText(
                truncateToWidth(licenseText, agentColW),
                rightColX,
                cursorY
              );
            } else {
              ctx.fillText(
                truncateToWidth(combined, agentColW),
                rightColX,
                cursorY
              );
            }
          } else if (licenseText) {
            // No phone, license alone
            ctx.fillStyle = state.agentMutedColor;
            ctx.font = `400 ${agentLicenseSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(
              truncateToWidth(licenseText, agentColW),
              rightColX,
              cursorY
            );
          }
        },
      });
    }

    return new Timeline(tracks);
  },
};
