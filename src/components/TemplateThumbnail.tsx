"use client";

import { useEffect, useRef } from "react";
import { ALL_TEMPLATES } from "@/templates";
import { getDefaultState } from "@/templates/types";

interface TemplateThumbnailProps {
  templateId: string;
}

/**
 * Static "final-frame" preview of a template, rendered using the template's
 * own build() function. Renders at full 1080×1350 to an offscreen canvas (so
 * templates' absolute pixel layout math works) and then blits that down to a
 * smaller display canvas for the picker card.
 *
 * Takes a templateId (string) rather than the full template config because the
 * config carries a function (`build`) which can't cross the server→client
 * serialization boundary. The lookup happens locally on the client.
 */
export function TemplateThumbnail({ templateId }: TemplateThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const template = ALL_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const fullW = 1080;
    const fullH = 1350;
    const offscreen = document.createElement("canvas");
    offscreen.width = fullW;
    offscreen.height = fullH;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const state = getDefaultState(template);

    const renderFinalFrame = () => {
      offCtx.fillStyle = state.background ?? "#000000";
      offCtx.fillRect(0, 0, fullW, fullH);

      const timeline = template.build(state, { width: fullW, height: fullH });
      timeline.render(timeline.duration, offCtx);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
    };

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(renderFinalFrame);
    } else {
      renderFinalFrame();
    }
  }, [templateId]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={500}
      className="block w-full rounded-md"
      style={{ aspectRatio: "1080 / 1350", backgroundColor: "#000000" }}
      aria-label="Template preview"
    />
  );
}
