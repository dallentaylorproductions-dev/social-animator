import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic, easeOutBack } from "@/engine/easing";
import { drawImageCover } from "@/engine/draw";
import type { TemplateConfig } from "./types";

export const beforeAfterTemplate: TemplateConfig = {
  id: "before-after",
  name: "Before / After",
  description:
    "Two photos side by side with a staggered reveal. Perfect for staging, renovations, or curb-appeal transformations.",
  duration: 8,
  fields: [
    { key: "title", label: "Title", type: "text", default: "Staging Magic" },
    { key: "beforePhoto", label: "Before photo", type: "image", default: "" },
    { key: "beforeLabel", label: "Before label", type: "text", default: "BEFORE" },
    { key: "afterPhoto", label: "After photo", type: "image", default: "" },
    { key: "afterLabel", label: "After label", type: "text", default: "AFTER" },
    { key: "background", label: "Background", type: "color", default: "#000000" },
    { key: "titleColor", label: "Title color", type: "color", default: "#ffffff" },
    { key: "labelBg", label: "Label background", type: "color", default: "#4ef2d9" },
    { key: "labelText", label: "Label text", type: "color", default: "#0a0a0a" },
  ],
  build(state, size, assets) {
    const { width, height } = size;
    const beforeImg = assets?.beforePhoto ?? null;
    const afterImg = assets?.afterPhoto ?? null;

    const titleFontSize = 76;
    const titleY = 180;

    // Photos side by side, with a small gap so they read as two distinct images
    const sideMargin = 60;
    const photoGap = 12;
    const photoW = (width - sideMargin * 2 - photoGap) / 2;
    const photoY = 280;
    // Reserve 240px at the bottom for the brand watermark + breathing room
    const photoH = height - photoY - 240;
    const photoCorner = 24;

    const beforeX = sideMargin;
    const afterX = sideMargin + photoW + photoGap;

    // Pill labels overlaid near the bottom of each photo
    const labelFontSize = 28;
    const labelPaddingH = 22;
    const labelPaddingV = 10;
    const labelHeight = labelFontSize + labelPaddingV * 2;
    const labelBottomOffset = 30;
    const labelCenterY =
      photoY + photoH - labelBottomOffset - labelHeight / 2;

    const drawPhoto = (
      ctx: CanvasRenderingContext2D,
      img: HTMLImageElement | null,
      x: number,
      placeholder: string,
      alpha: number
    ) => {
      ctx.globalAlpha = alpha;
      if (img) {
        drawImageCover(ctx, img, x, photoY, photoW, photoH, photoCorner);
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.roundRect(x, photoY, photoW, photoH, photoCorner);
        ctx.fill();

        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.roundRect(x + 4, photoY + 4, photoW - 8, photoH - 8, photoCorner);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#666";
        ctx.font = "26px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(placeholder, x + photoW / 2, photoY + photoH / 2);
      }
    };

    const drawLabel = (
      ctx: CanvasRenderingContext2D,
      text: string,
      photoX: number
    ) => {
      // Caller has already translated to label center; we draw centered around (0, 0)
      ctx.font = `700 ${labelFontSize}px Inter, system-ui, sans-serif`;
      const textW = ctx.measureText(text).width;
      const labelW = textW + labelPaddingH * 2;

      ctx.fillStyle = state.labelBg;
      ctx.beginPath();
      ctx.roundRect(-labelW / 2, -labelHeight / 2, labelW, labelHeight, labelHeight / 2);
      ctx.fill();

      ctx.fillStyle = state.labelText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      // photoX param kept for future use (e.g., asymmetric label positioning)
      void photoX;
    };

    const tracks: Track[] = [];

    // 1. Title rises in
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

    // 2. Before photo fades in
    tracks.push({
      id: "before-photo",
      start: 0.6,
      duration: 0.6,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        drawPhoto(ctx, beforeImg, beforeX, "Add 'before' photo →", p);
      },
    });

    // 3. BEFORE pill pops in with overshoot
    tracks.push({
      id: "before-label",
      start: 1.0,
      duration: 0.4,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const scale = 0.6 + p * 0.4;
        const alpha = Math.min(1, p * 1.5);
        const cx = beforeX + photoW / 2;
        ctx.globalAlpha = alpha;
        ctx.translate(cx, labelCenterY);
        ctx.scale(scale, scale);
        drawLabel(ctx, (state.beforeLabel ?? "BEFORE").toUpperCase(), beforeX);
      },
    });

    // 4. After photo fades in (with anticipation pause)
    tracks.push({
      id: "after-photo",
      start: 1.8,
      duration: 0.6,
      easing: easeOutCubic,
      onUpdate: (p, ctx) => {
        drawPhoto(ctx, afterImg, afterX, "Add 'after' photo →", p);
      },
    });

    // 5. AFTER pill pops in with overshoot
    tracks.push({
      id: "after-label",
      start: 2.2,
      duration: 0.4,
      easing: easeOutBack,
      onUpdate: (p, ctx) => {
        const scale = 0.6 + p * 0.4;
        const alpha = Math.min(1, p * 1.5);
        const cx = afterX + photoW / 2;
        ctx.globalAlpha = alpha;
        ctx.translate(cx, labelCenterY);
        ctx.scale(scale, scale);
        drawLabel(ctx, (state.afterLabel ?? "AFTER").toUpperCase(), afterX);
      },
    });

    return new Timeline(tracks);
  },
};
