import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic } from "@/engine/easing";
import type { TemplateConfig } from "./types";

export const statHighlightTemplate: TemplateConfig = {
  id: "stat-highlight",
  name: "Stat Highlight",
  description:
    "One huge number to anchor a market update or milestone post. Counts up from zero on entry.",
  duration: 8,
  fields: [
    { key: "stat", label: "Stat (e.g. $650K, 47%, 3 Homes)", type: "text", default: "$2.4M" },
    { key: "context", label: "Context line (above)", type: "text", default: "Average Sale Price" },
    {
      key: "supporting",
      label: "Supporting line (below)",
      type: "textarea",
      default: "In our market, last quarter.",
    },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "statColor", label: "Stat color", type: "color", default: "#4ef2d9" },
    { key: "contextColor", label: "Context color", type: "color", default: "#ffffff" },
    { key: "supportingColor", label: "Supporting color", type: "color", default: "#9ca3af" },
  ],
  build(state, size) {
    const { width, height } = size;

    // Parse stat into prefix + numeric value + suffix.
    // E.g. "$2.4M" → { prefix:"$", value:2.4, suffix:"M", decimals:1 }
    const match = state.stat.match(/^([^\d.-]*)([-+]?\d*\.?\d+)(.*)$/);
    const prefix = match?.[1] ?? "";
    const numStr = match?.[2] ?? "";
    const targetValue = parseFloat(numStr || "0");
    const suffix = match?.[3] ?? "";
    const decimals = numStr.includes(".")
      ? numStr.split(".")[1]?.length ?? 0
      : 0;

    const contextFontSize = 56;
    const statFontSize = 280;
    const supportingFontSize = 56;
    const verticalGap = 70;

    const totalContentHeight =
      contextFontSize + verticalGap + statFontSize + verticalGap + supportingFontSize * 2;
    const topY = (height - totalContentHeight) / 2;

    const contextY = topY + contextFontSize / 2;
    const statY = contextY + contextFontSize / 2 + verticalGap + statFontSize / 2;
    const supportingY = statY + statFontSize / 2 + verticalGap + supportingFontSize;

    const tracks: Track[] = [];

    // Context rises in
    tracks.push({
      id: "context",
      start: 0.2,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 30);
        ctx.fillStyle = state.contextColor;
        ctx.font = `600 ${contextFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          (state.context ?? "").toUpperCase(),
          width / 2,
          contextY
        );
      },
    });

    // Stat counts up
    tracks.push({
      id: "stat",
      start: 0.5,
      duration: 1.8,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        const currentValue = targetValue * p;
        const formatted =
          decimals > 0
            ? currentValue.toFixed(decimals)
            : Math.round(currentValue).toLocaleString();

        ctx.fillStyle = state.statColor;
        ctx.font = `900 ${statFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${prefix}${formatted}${suffix}`, width / 2, statY);
      },
    });

    // Supporting rises in
    tracks.push({
      id: "supporting",
      start: 2.4,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 30);
        ctx.fillStyle = state.supportingColor;
        ctx.font = `400 ${supportingFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.supporting ?? "", width / 2, supportingY);
      },
    });

    // Hold to full duration
    tracks.push({
      id: "hold",
      start: 0,
      duration: 8,
      onUpdate: () => {},
    });

    return new Timeline(tracks);
  },
};
