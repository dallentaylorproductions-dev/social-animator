import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic } from "@/engine/easing";
import { drawWrappedText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

export const numberedProcessTemplate: TemplateConfig = {
  id: "numbered-process",
  name: "Numbered Process",
  description:
    "Walk viewers through up to 5 steps with a connecting path. Great for buyer guides or relocation playbooks.",
  duration: 12,
  fields: [
    { key: "title", label: "Title", type: "text", default: "Buying Your First Home" },
    { key: "step1Title", label: "Step 1 title", type: "text", default: "Get Pre-Approved" },
    {
      key: "step1Body",
      label: "Step 1 body",
      type: "textarea",
      default: "Lock in your budget before you start touring.",
    },
    { key: "step2Title", label: "Step 2 title", type: "text", default: "Define Your Wishlist" },
    {
      key: "step2Body",
      label: "Step 2 body",
      type: "textarea",
      default: "Bedrooms, location, deal-breakers — clarity wins.",
    },
    { key: "step3Title", label: "Step 3 title", type: "text", default: "Tour Strategically" },
    {
      key: "step3Body",
      label: "Step 3 body",
      type: "textarea",
      default: "Five homes is enough to know what you actually want.",
    },
    { key: "step4Title", label: "Step 4 title", type: "text", default: "Make a Strong Offer" },
    {
      key: "step4Body",
      label: "Step 4 body",
      type: "textarea",
      default: "Price, terms, and timeline — package matters.",
    },
    { key: "step5Title", label: "Step 5 title", type: "text", default: "Close With Confidence" },
    {
      key: "step5Body",
      label: "Step 5 body",
      type: "textarea",
      default: "Inspection, appraisal, signing day. We've got you.",
    },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "titleColor", label: "Title color", type: "color", default: "#ffffff" },
    {
      key: "accentColor",
      label: "Accent (badges + path)",
      type: "color",
      default: "#4ef2d9",
    },
    { key: "cardColor", label: "Card", type: "color", default: "#ffffff" },
    { key: "cardTitleColor", label: "Card title", type: "color", default: "#0a0a0a" },
    { key: "cardBodyColor", label: "Card body", type: "color", default: "#3a3a3a" },
  ],
  build(state, size) {
    const { width, height } = size;

    const allSteps = [
      { title: state.step1Title, body: state.step1Body },
      { title: state.step2Title, body: state.step2Body },
      { title: state.step3Title, body: state.step3Body },
      { title: state.step4Title, body: state.step4Body },
      { title: state.step5Title, body: state.step5Body },
    ];
    const steps = allSteps.filter((s) => (s.title ?? "").trim().length > 0);
    const stepCount = steps.length;

    const titleFontSize = 88;
    const titleY = 130;
    const cardX = 220;
    const cardWidth = width - 280;
    const cardHeight = 180;
    const badgeRadius = 56;
    const badgeX = 130;
    const stepStartY = 290;
    const stepEndY = height - 240;
    const stepSpacing =
      stepCount > 1 ? Math.min(220, (stepEndY - stepStartY) / (stepCount - 1)) : 0;

    const cardTitleSize = 38;
    const cardBodySize = 26;
    const cardTitleLineHeight = 46;
    const cardBodyLineHeight = 34;
    const cardPadding = 28;

    const tracks: Track[] = [];

    tracks.push({
      id: "title",
      start: 0.2,
      duration: 0.6,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.fillStyle = state.titleColor;
        ctx.font = `bold ${titleFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.title, width / 2, titleY);
      },
    });

    steps.forEach((step, i) => {
      const stepY = stepStartY + i * stepSpacing;
      const start = 0.6 + i * 0.22;

      tracks.push({
        id: `step-${i}`,
        start,
        duration: 0.5,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          const slideOffset = (1 - p) * 60;
          ctx.globalAlpha = p;
          ctx.translate(0, slideOffset);

          ctx.fillStyle = state.cardColor;
          ctx.beginPath();
          ctx.roundRect(cardX, stepY - cardHeight / 2, cardWidth, cardHeight, 24);
          ctx.fill();

          ctx.fillStyle = state.cardTitleColor;
          ctx.font = `700 ${cardTitleSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(step.title, cardX + cardPadding, stepY - cardHeight / 2 + cardPadding);

          ctx.fillStyle = state.cardBodyColor;
          ctx.font = `400 ${cardBodySize}px Inter, system-ui, sans-serif`;
          drawWrappedText(
            ctx,
            step.body,
            cardX + cardPadding,
            stepY - cardHeight / 2 + cardPadding + cardTitleLineHeight + 4,
            cardWidth - cardPadding * 2,
            cardBodyLineHeight
          );

          ctx.fillStyle = state.accentColor;
          ctx.beginPath();
          ctx.arc(badgeX, stepY, badgeRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#0a0a0a";
          ctx.font = `900 52px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), badgeX, stepY);
        },
      });
    });

    if (stepCount > 1) {
      const pathStart = 0.6 + stepCount * 0.22 + 0.1;

      tracks.push({
        id: "path",
        start: pathStart,
        duration: 0.8,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          const totalSegments = stepCount - 1;
          let totalLength = 0;
          const segLengths: number[] = [];
          for (let i = 0; i < totalSegments; i++) {
            const segLen = stepSpacing - 2 * badgeRadius;
            segLengths.push(segLen);
            totalLength += segLen;
          }
          const drawnLength = p * totalLength;

          ctx.strokeStyle = state.accentColor;
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 10]);
          ctx.lineCap = "round";

          ctx.beginPath();
          let remaining = drawnLength;
          for (let i = 0; i < totalSegments; i++) {
            const segStart = stepStartY + i * stepSpacing + badgeRadius;
            const drawHere = Math.min(remaining, segLengths[i]);
            if (drawHere > 0) {
              ctx.moveTo(badgeX, segStart);
              ctx.lineTo(badgeX, segStart + drawHere);
            }
            remaining -= drawHere;
            if (remaining <= 0) break;
          }
          ctx.stroke();
        },
      });

      const travelerStart = pathStart + 0.8;
      tracks.push({
        id: "traveler",
        start: travelerStart,
        duration: 2,
        loop: true,
        onUpdate: (p, ctx) => {
          const totalSegments = stepCount - 1;
          const segLen = stepSpacing - 2 * badgeRadius;
          const totalPathLength = totalSegments * segLen;
          let dist = p * totalPathLength;
          let yPos = stepStartY + badgeRadius;
          for (let i = 0; i < totalSegments; i++) {
            if (dist <= segLen) {
              yPos = stepStartY + i * stepSpacing + badgeRadius + dist;
              break;
            }
            dist -= segLen;
            yPos = stepStartY + (i + 1) * stepSpacing + badgeRadius;
          }

          ctx.fillStyle = state.accentColor;
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(badgeX, yPos, 22, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(badgeX, yPos, 11, 0, Math.PI * 2);
          ctx.fill();
        },
      });
    }

    tracks.push({
      id: "hold",
      start: 0,
      duration: 12,
      onUpdate: () => {
        /* pads timeline.duration */
      },
    });

    return new Timeline(tracks);
  },
};
