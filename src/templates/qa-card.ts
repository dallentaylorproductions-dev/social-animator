import { Timeline } from "@/engine/timeline";
import { easeOutCubic, easeOutBack } from "@/engine/easing";
import { drawWrappedText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

export const qaCardTemplate: TemplateConfig = {
  id: "qa-card",
  name: "Q&A Card",
  description: "Pose a question, reveal the answer. Great for market tips and buyer FAQs.",
  duration: 10,
  fields: [
    { key: "titleText", label: "Title", type: "text", default: "Q&A" },
    {
      key: "questionText",
      label: "Question",
      type: "textarea",
      default: "When is the best time to list a home in our area?",
    },
    {
      key: "answerText",
      label: "Answer",
      type: "textarea",
      default: "Spring. Buyers move fast, inventory stays tight — our strongest market window.",
    },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "titleColor", label: "Title color", type: "color", default: "#ffffff" },
    { key: "questionPanelColor", label: "Question panel", type: "color", default: "#4bc9f0" },
    { key: "questionTextColor", label: "Question text", type: "color", default: "#ffffff" },
    { key: "answerPanelColor", label: "Answer panel", type: "color", default: "#4ef2d9" },
    { key: "answerTextColor", label: "Answer text", type: "color", default: "#0a1a1a" },
  ],
  build(state, size) {
    const { width, height } = size;

    // Layout (designed against 1080-wide canvas)
    const titleFontSize = 180;
    const cardTextSize = 48;
    const cardLineHeight = 62;
    const cardPaddingV = 48;
    const cardPaddingH = 56;
    const cardWidth = width - 260;
    const cardX = 130;
    const cardHeight = 340;
    const answerOffsetX = 60;
    const titleToCardGap = 80;
    const betweenCardsGap = 60;
    const cornerRadius = 28;

    const totalHeight =
      titleFontSize + titleToCardGap + cardHeight + betweenCardsGap + cardHeight;
    const topY = Math.max(60, (height - totalHeight) / 2);
    const titleCenterY = topY + titleFontSize / 2;
    const questionCardY = topY + titleFontSize + titleToCardGap;
    const answerCardY = questionCardY + cardHeight + betweenCardsGap;
    const answerCardX = cardX + answerOffsetX;

    return new Timeline([
      // Title scales in with a slight overshoot
      {
        id: "title",
        start: 0.2,
        duration: 0.7,
        easing: easeOutBack,
        onUpdate: (p, ctx) => {
          const scale = 0.3 + p * 0.7;
          ctx.globalAlpha = Math.min(1, p * 1.3);
          ctx.translate(width / 2, titleCenterY);
          ctx.scale(scale, scale);
          ctx.fillStyle = state.titleColor;
          ctx.font = `900 ${titleFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(state.titleText, 0, 0);
        },
      },

      // Question card slides in from the left
      {
        id: "question",
        start: 0.85,
        duration: 0.8,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          const offsetX = (1 - p) * -(cardX + cardWidth + 100);
          ctx.translate(offsetX, 0);
          ctx.fillStyle = state.questionPanelColor;
          ctx.beginPath();
          ctx.roundRect(cardX, questionCardY, cardWidth, cardHeight, cornerRadius);
          ctx.fill();
          ctx.fillStyle = state.questionTextColor;
          ctx.font = `bold ${cardTextSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          drawWrappedText(
            ctx,
            state.questionText,
            cardX + cardPaddingH,
            questionCardY + cardPaddingV,
            cardWidth - cardPaddingH * 2,
            cardLineHeight
          );
        },
      },

      // Answer card slides in from the right
      {
        id: "answer",
        start: 1.65,
        duration: 0.8,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          const offsetX = (1 - p) * (width + 100);
          ctx.translate(offsetX, 0);
          ctx.fillStyle = state.answerPanelColor;
          ctx.beginPath();
          ctx.roundRect(answerCardX, answerCardY, cardWidth, cardHeight, cornerRadius);
          ctx.fill();
          ctx.fillStyle = state.answerTextColor;
          ctx.font = `500 ${cardTextSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          drawWrappedText(
            ctx,
            state.answerText,
            answerCardX + cardPaddingH,
            answerCardY + cardPaddingV,
            cardWidth - cardPaddingH * 2,
            cardLineHeight
          );
        },
      },

      // Hold track: extends timeline.duration to the template's 6s so the final frame lingers
      {
        id: "hold",
        start: 2.45,
        duration: 7.55,
        onUpdate: () => {
          /* no-op; just pads timeline.duration */
        },
      },
    ]);
  },
};
