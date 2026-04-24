"use client";

import { useEffect, useRef } from "react";
import type { Timeline } from "./timeline";

interface CanvasProps {
  width: number;
  height: number;
  timeline: Timeline;
  background?: string;
  loop?: boolean;
  playKey?: number | string;
  onTick?: (time: number) => void;
  onComplete?: () => void;
}

export function Canvas({
  width,
  height,
  timeline,
  background = "#000000",
  loop = false,
  playKey,
  onTick,
  onComplete,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onTickRef = useRef(onTick);
  const onCompleteRef = useRef(onComplete);

  onTickRef.current = onTick;
  onCompleteRef.current = onComplete;

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

      // Canvas-level loop: restart when we hit timeline.duration
      if (loop && timeline.duration > 0 && currentTime >= timeline.duration) {
        startTs = ts;
        currentTime = 0;
        completedFired = false;
      }

      // Finite playback (no looping tracks, no loop prop): clamp at duration, fire onComplete once
      if (finite && currentTime >= timeline.duration) {
        currentTime = timeline.duration;
        if (!completedFired) {
          completedFired = true;
          onCompleteRef.current?.();
        }
      }

      // Render
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      timeline.render(currentTime, ctx);

      onTickRef.current?.(currentTime);

      // Keep rendering unless we've reached the end of a finite timeline
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
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        maxWidth: `${width}px`,
        aspectRatio: `${width} / ${height}`,
      }}
    />
  );
}
