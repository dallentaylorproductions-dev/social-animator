"use client";

import { useEffect, useRef, forwardRef } from "react";
import type { Timeline } from "./timeline";
import { drawBrandOverlay } from "@/lib/brand";

interface CanvasProps {
  width: number;
  height: number;
  timeline: Timeline;
  background?: string;
  loop?: boolean;
  playKey?: number | string;
  onTick?: (time: number) => void;
  onComplete?: () => void;
  brandLogo?: HTMLImageElement | null;
  brandName?: string;
}

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(function Canvas(
  {
    width,
    height,
    timeline,
    background = "#000000",
    loop = false,
    playKey,
    onTick,
    onComplete,
    brandLogo,
    brandName,
  },
  forwardedRef
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onTickRef = useRef(onTick);
  const onCompleteRef = useRef(onComplete);

  onTickRef.current = onTick;
  onCompleteRef.current = onComplete;

  const brandLogoRef = useRef(brandLogo);
  const brandNameRef = useRef(brandName);
  brandLogoRef.current = brandLogo;
  brandNameRef.current = brandName;

  const setRef = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (typeof forwardedRef === "function") {
      forwardedRef(el);
    } else if (forwardedRef) {
      forwardedRef.current = el;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    let rafId = 0;
    let startTs: number | null = null;
    let completedFired = false;
    const hasLoopingTrack = timeline.tracks.some((t) => t.loop);
    const finite = !loop && !hasLoopingTrack && timeline.duration > 0;

    const frame = (ts: DOMHighResTimeStamp) => {
      if (startTs === null) startTs = ts;
      let currentTime = (ts - startTs) / 1000;

      if (loop && timeline.duration > 0 && currentTime >= timeline.duration) {
        startTs = ts;
        currentTime = 0;
        completedFired = false;
      }

      if (finite && currentTime >= timeline.duration) {
        currentTime = timeline.duration;
        if (!completedFired) {
          completedFired = true;
          onCompleteRef.current?.();
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      timeline.render(currentTime, ctx);

      // Heartbeat pixel: writes a near-zero-alpha 1px rect at (0,0) every frame
      // to force canvas.captureStream() to register a content change. Without
      // this, exports come out shorter than the requested duration whenever
      // the visible animation goes static (e.g. during a long hold-at-end).
      ctx.fillStyle = `rgba(0,0,0,${((currentTime * 1000) % 1) * 0.001 + 0.0005})`;
      ctx.fillRect(0, 0, 1, 1);

      // Brand overlay (fades in over the first 0.5s of any timeline)
      const brandAlpha = Math.min(1, currentTime / 0.5);
      drawBrandOverlay(
        ctx,
        width,
        height,
        brandLogoRef.current ?? null,
        brandNameRef.current ?? "",
        brandAlpha
      );

      onTickRef.current?.(currentTime);

      const shouldContinue = !finite || currentTime < timeline.duration;
      if (shouldContinue) {
        rafId = requestAnimationFrame(frame);
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [timeline, width, height, background, loop, playKey]);

  return (
    <canvas
      ref={setRef}
      style={{
        display: "block",
        width: "100%",
        maxWidth: `${width}px`,
        aspectRatio: `${width} / ${height}`,
      }}
    />
  );
});
