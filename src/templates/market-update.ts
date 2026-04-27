import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic } from "@/engine/easing";
import type { TemplateConfig } from "./types";

interface ParsedStat {
  prefix: string;
  target: number;
  suffix: string;
  decimals: number;
}

function parseStatValue(value: string): ParsedStat {
  const cleaned = (value ?? "").replace(/,/g, "");
  const match = cleaned.match(/^([^\d.-]*)([-+]?\d*\.?\d+)(.*)$/);
  const prefix = match?.[1] ?? "";
  const numStr = match?.[2] ?? "";
  const target = parseFloat(numStr || "0");
  const suffix = match?.[3] ?? "";
  const decimals = numStr.includes(".")
    ? numStr.split(".")[1]?.length ?? 0
    : 0;
  return { prefix, target, suffix, decimals };
}

function formatStat(value: number, decimals: number): string {
  if (decimals > 0) return value.toFixed(decimals);
  return Math.round(value).toLocaleString();
}

export const marketUpdateTemplate: TemplateConfig = {
  id: "market-update",
  name: "Market Update",
  description:
    "Four key market stats in a 2×2 grid. Perfect for monthly or quarterly market summaries — average price, days on market, inventory, and more.",
  duration: 8,
  fields: [
    { key: "title", label: "Title", type: "text", default: "Market Update" },
    {
      key: "subtitle",
      label: "Subtitle (city, period)",
      type: "text",
      default: "Beaverton · Q1 2026",
    },
    { key: "stat1Label", label: "Stat 1 label", type: "text", default: "Avg Sale Price" },
    { key: "stat1Value", label: "Stat 1 value", type: "text", default: "$542K" },
    { key: "stat2Label", label: "Stat 2 label", type: "text", default: "Days on Market" },
    { key: "stat2Value", label: "Stat 2 value", type: "text", default: "12" },
    { key: "stat3Label", label: "Stat 3 label", type: "text", default: "Median Price" },
    { key: "stat3Value", label: "Stat 3 value", type: "text", default: "$489K" },
    { key: "stat4Label", label: "Stat 4 label", type: "text", default: "Inventory" },
    { key: "stat4Value", label: "Stat 4 value", type: "text", default: "47" },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "titleColor", label: "Title color", type: "color", default: "#ffffff" },
    { key: "subtitleColor", label: "Subtitle color", type: "color", default: "#9ca3af" },
    { key: "labelColor", label: "Stat labels", type: "color", default: "#9ca3af" },
    { key: "valueColor", label: "Stat values", type: "color", default: "#4ef2d9" },
  ],
  build(state, size) {
    const { width, height } = size;

    const titleFontSize = 76;
    const subtitleFontSize = 32;
    const labelFontSize = 26;
    const valueFontSize = 100;

    const titleY = 180;
    const subtitleY = 280;

    // 2x2 grid layout (with brand safe-zone at bottom)
    const gridTop = 420;
    const gridBottom = height - 220;
    const gridGap = 60;
    const sideMargin = 80;
    const cellWidth = (width - sideMargin * 2 - gridGap) / 2;
    const cellHeight = (gridBottom - gridTop - gridGap) / 2;

    const cellPositions = [
      { x: sideMargin, y: gridTop },
      { x: sideMargin + cellWidth + gridGap, y: gridTop },
      { x: sideMargin, y: gridTop + cellHeight + gridGap },
      { x: sideMargin + cellWidth + gridGap, y: gridTop + cellHeight + gridGap },
    ];

    const stats = [
      { label: state.stat1Label, parsed: parseStatValue(state.stat1Value) },
      { label: state.stat2Label, parsed: parseStatValue(state.stat2Value) },
      { label: state.stat3Label, parsed: parseStatValue(state.stat3Value) },
      { label: state.stat4Label, parsed: parseStatValue(state.stat4Value) },
    ];

    const tracks: Track[] = [];

    // Title fades + rises in
    tracks.push({
      id: "title",
      start: 0.2,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 20);
        ctx.fillStyle = state.titleColor;
        ctx.font = `bold ${titleFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.title, width / 2, titleY);
      },
    });

    // Subtitle fades in slightly behind the title
    tracks.push({
      id: "subtitle",
      start: 0.35,
      duration: 0.5,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - p) * 16);
        ctx.fillStyle = state.subtitleColor;
        ctx.font = `500 ${subtitleFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.subtitle, width / 2, subtitleY);
      },
    });

    // Stats: stagger fade-in then count up the value
    stats.forEach((stat, idx) => {
      const pos = cellPositions[idx];
      const cellCenterX = pos.x + cellWidth / 2;
      const labelY = pos.y + cellHeight * 0.32;
      const valueY = pos.y + cellHeight * 0.62;
      const cellStart = 0.6 + idx * 0.18;

      tracks.push({
        id: `stat-${idx}`,
        start: cellStart,
        duration: 1.2,
        // No track-level easing — we apply easeOutCubic per phase below
        onUpdate: (p, ctx) => {
          // Phase 1 (0–30% of progress): fade in + rise
          const fadeP = Math.min(1, p / 0.3);
          const fadeAlpha = easeOutCubic(fadeP);
          ctx.globalAlpha = fadeAlpha;
          ctx.translate(0, (1 - fadeAlpha) * 16);

          // Label
          ctx.fillStyle = state.labelColor;
          ctx.font = `600 ${labelFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            (stat.label ?? "").toUpperCase(),
            cellCenterX,
            labelY
          );

          // Phase 2 (30–100%): count up from 0 to target
          const countP = p < 0.3 ? 0 : (p - 0.3) / 0.7;
          const easedCount = easeOutCubic(Math.min(1, countP));
          const currentValue = stat.parsed.target * easedCount;
          const formatted = formatStat(currentValue, stat.parsed.decimals);

          ctx.fillStyle = state.valueColor;
          ctx.font = `900 ${valueFontSize}px Inter, system-ui, sans-serif`;
          ctx.fillText(
            `${stat.parsed.prefix}${formatted}${stat.parsed.suffix}`,
            cellCenterX,
            valueY
          );
        },
      });
    });

    return new Timeline(tracks);
  },
};
