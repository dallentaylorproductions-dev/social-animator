import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack } from "@/engine/easing";
import { wrapText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

export const testimonialCardTemplate: TemplateConfig = {
  id: "testimonial-card",
  name: "Testimonial Card",
  description:
    "A client quote with attribution. The bread and butter of social proof — every closed deal becomes a post.",
  duration: 8,
  fields: [
    {
      key: "quoteText",
      label: "Quote",
      type: "textarea",
      default:
        "Aaron made us feel like we were his only clients. He answered every late-night text and we closed on our dream home in 24 days.",
    },
    {
      key: "attribution",
      label: "Attribution",
      type: "text",
      default: "— Mark & Lisa T., Beaverton",
    },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    {
      key: "quoteMarkColor",
      label: "Quote mark color",
      type: "color",
      default: "#4ef2d9",
    },
    {
      key: "quoteTextColor",
      label: "Quote text color",
      type: "color",
      default: "#ffffff",
    },
    {
      key: "attributionColor",
      label: "Attribution color",
      type: "color",
      default: "#9ca3af",
    },
  ],
  build(state, size) {
    const { width, height } = size;

    const quoteMarkSize = Math.min(320, height * 0.24);
    const quoteMarkY = 240;

    const quoteFontSize = 52;
    const quoteLineHeight = 72;
    const quoteMaxWidth = width - 240;
    const quoteCenterY = height * 0.55;

    const attributionFontSize = 32;
    const attributionY = height - 220;

    const tracks: Track[] = [];

    // 1. Decorative opening quote mark scales/fades in with overshoot
    tracks.push({
      id: "quoteMark",
      start: 0.2,
      duration: 0.7,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const scale = 0.4 + p * 0.6;
        const alpha = Math.min(1, p * 1.3);
        ctx.globalAlpha = alpha;
        ctx.translate(width / 2, quoteMarkY);
        ctx.scale(scale, scale);
        ctx.fillStyle = state.quoteMarkColor;
        // Georgia gives a more pronounced quote-mark glyph than Inter
        ctx.font = `900 ${quoteMarkSize}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u201C", 0, 0);
      },
    });

    // 2. Quote text rises in
    tracks.push({
      id: "quote",
      start: 0.8,
      duration: 0.8,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 30);
        ctx.fillStyle = state.quoteTextColor;
        ctx.font = `500 ${quoteFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lines = wrapText(ctx, state.quoteText, quoteMaxWidth);
        const totalH = lines.length * quoteLineHeight;
        const startY = quoteCenterY - totalH / 2 + quoteLineHeight / 2;
        lines.forEach((line, i) => {
          ctx.fillText(line, width / 2, startY + i * quoteLineHeight);
        });
      },
    });

    // 3. Attribution rises in last
    tracks.push({
      id: "attribution",
      start: 1.5,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 20);
        ctx.fillStyle = state.attributionColor;
        ctx.font = `400 ${attributionFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.attribution, width / 2, attributionY);
      },
    });

    return new Timeline(tracks);
  },
};
