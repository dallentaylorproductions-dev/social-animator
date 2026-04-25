import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack } from "@/engine/easing";
import { drawWrappedText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

export const gridComparisonTemplate: TemplateConfig = {
  id: "grid-comparison",
  name: "Grid Comparison",
  description:
    "Four tips, features, or comparisons in a 2×2 grid. Perfect for tip lists or before-after splits.",
  duration: 10,
  fields: [
    { key: "title", label: "Title", type: "text", default: "Get Your Home Ready" },
    { key: "card1Icon", label: "Card 1 icon (emoji)", type: "text", default: "🏠" },
    { key: "card1Title", label: "Card 1 title", type: "text", default: "Declutter" },
    {
      key: "card1Body",
      label: "Card 1 body",
      type: "textarea",
      default: "Less is more for showings.",
    },
    { key: "card2Icon", label: "Card 2 icon", type: "text", default: "✨" },
    { key: "card2Title", label: "Card 2 title", type: "text", default: "Deep Clean" },
    {
      key: "card2Body",
      label: "Card 2 body",
      type: "textarea",
      default: "Buyers smell fresh from the front door.",
    },
    { key: "card3Icon", label: "Card 3 icon", type: "text", default: "💡" },
    { key: "card3Title", label: "Card 3 title", type: "text", default: "Light It Up" },
    {
      key: "card3Body",
      label: "Card 3 body",
      type: "textarea",
      default: "Open every blind, every bulb on.",
    },
    { key: "card4Icon", label: "Card 4 icon", type: "text", default: "🌿" },
    { key: "card4Title", label: "Card 4 title", type: "text", default: "Stage Outside" },
    {
      key: "card4Body",
      label: "Card 4 body",
      type: "textarea",
      default: "Curb appeal closes deals.",
    },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "titleColor", label: "Title", type: "color", default: "#ffffff" },
    { key: "accentColor", label: "Accent", type: "color", default: "#4ef2d9" },
    { key: "cardColor", label: "Card", type: "color", default: "#ffffff" },
    { key: "cardTitleColor", label: "Card title", type: "color", default: "#0a0a0a" },
    { key: "cardBodyColor", label: "Card body", type: "color", default: "#3a3a3a" },
  ],
  build(state, size) {
    const { width, height } = size;

    const titleFontSize = 80;
    const titleY = 140;
    const gridGap = 36;
    const sideMargin = 70;
    const cardWidth = (width - sideMargin * 2 - gridGap) / 2;
    const cardHeight = 480;
    const gridX = sideMargin;
    const gridY = Math.max(240, (height - (cardHeight * 2 + gridGap)) / 2 + 60);

    const cardPositions = [
      { x: gridX, y: gridY }, // 0: top-left
      { x: gridX + cardWidth + gridGap, y: gridY }, // 1: top-right
      { x: gridX, y: gridY + cardHeight + gridGap }, // 2: bottom-left
      { x: gridX + cardWidth + gridGap, y: gridY + cardHeight + gridGap }, // 3: bottom-right
    ];

    const cards = [
      { icon: state.card1Icon, title: state.card1Title, body: state.card1Body },
      { icon: state.card2Icon, title: state.card2Title, body: state.card2Body },
      { icon: state.card3Icon, title: state.card3Title, body: state.card3Body },
      { icon: state.card4Icon, title: state.card4Title, body: state.card4Body },
    ];

    // Diagonal entry order: TL → BR → TR → BL
    const entryOrder = [0, 3, 1, 2];

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

    // Center cross connector
    tracks.push({
      id: "connector",
      start: 1.0,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        const centerX = width / 2;
        const centerY = gridY + cardHeight + gridGap / 2;
        const horizontalReach = (cardWidth + gridGap) / 2 - 30;
        const verticalReach = (cardHeight + gridGap) / 2 - 30;

        ctx.strokeStyle = state.accentColor;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";

        ctx.globalAlpha = p * 0.55;
        ctx.beginPath();
        ctx.moveTo(centerX - horizontalReach * p, centerY);
        ctx.lineTo(centerX + horizontalReach * p, centerY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX, centerY - verticalReach * p);
        ctx.lineTo(centerX, centerY + verticalReach * p);
        ctx.stroke();

        ctx.globalAlpha = p;
        ctx.fillStyle = state.accentColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
        ctx.fill();
      },
    });

    entryOrder.forEach((idx, orderIdx) => {
      const cardStart = 0.45 + orderIdx * 0.16;
      const pos = cardPositions[idx];
      const card = cards[idx];

      // Card pop-in (BG + icon + title + body)
      tracks.push({
        id: `card-${idx}`,
        start: cardStart,
        duration: 0.5,
        easing: easeOutBack,
        onUpdate: (p, ctx) => {
          const popScale = 0.6 + p * 0.4;
          ctx.globalAlpha = Math.min(1, p * 1.5);

          const cx = pos.x + cardWidth / 2;
          const cy = pos.y + cardHeight / 2;
          ctx.translate(cx, cy);
          ctx.scale(popScale, popScale);
          ctx.translate(-cx, -cy);

          ctx.fillStyle = state.cardColor;
          ctx.beginPath();
          ctx.roundRect(pos.x, pos.y, cardWidth, cardHeight, 28);
          ctx.fill();

          ctx.font = "120px Inter, 'Apple Color Emoji', system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(card.icon, pos.x + cardWidth / 2, pos.y + 130);

          ctx.fillStyle = state.cardTitleColor;
          ctx.font = `700 42px Inter, system-ui, sans-serif`;
          ctx.fillText(card.title, pos.x + cardWidth / 2, pos.y + 270);

          ctx.fillStyle = state.cardBodyColor;
          ctx.font = `400 26px Inter, system-ui, sans-serif`;
          ctx.textBaseline = "top";
          drawWrappedText(
            ctx,
            card.body,
            pos.x + 28,
            pos.y + 320,
            cardWidth - 56,
            34
          );
        },
      });

      // Glow ring pulse around icon — sonar-style ripple, looping
      tracks.push({
        id: `glow-${idx}`,
        start: cardStart + 0.6 + orderIdx * 0.12,
        duration: 1.6,
        loop: true,
        onUpdate: (p, ctx) => {
          const radius = 50 + p * 50;
          const alpha = (1 - p) * 0.45;
          if (alpha <= 0.01) return;

          ctx.globalAlpha = alpha;
          ctx.strokeStyle = state.accentColor;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(pos.x + cardWidth / 2, pos.y + 130, radius, 0, Math.PI * 2);
          ctx.stroke();
        },
      });
    });

    tracks.push({
      id: "hold",
      start: 0,
      duration: 10,
      onUpdate: () => {},
    });

    return new Timeline(tracks);
  },
};
