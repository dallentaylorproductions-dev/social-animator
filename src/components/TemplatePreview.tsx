"use client";

import { useEffect, useRef } from "react";
import { ALL_TEMPLATES } from "@/templates";
import {
  getDefaultState,
  type TemplateAssets,
  type TemplateState,
} from "@/templates/types";

interface TemplatePreviewProps {
  templateId: string;
  /** ms to offset this preview's clock from t=0, so a grid of previews
   * doesn't visually phase-lock. Picker passes index * 250. */
  startOffsetMs?: number;
}

// Picker thumbnails are designed against the Feed canvas (1080×1350). The
// template's build() expects this absolute pixel space; we render at full
// resolution to an offscreen, then blit-and-downsample to the small display
// canvas.
const FULL_W = 1080;
const FULL_H = 1350;

// 24fps is plenty for a small looping preview and saves significant CPU on
// mobile compared to native 60fps.
const TARGET_FRAME_MS = 1000 / 24;

const SKELETON_BG = "#1a1a1a";

/** Replicates TemplateEditor's gradient logic so previews match what the
 * editor would render. Returns undefined for solid (canvas falls back to
 * fillRect with the solid color). */
function makePaintBackground(
  state: TemplateState,
  width: number,
  height: number
): ((ctx: CanvasRenderingContext2D) => void) | undefined {
  if (state.backgroundStyle !== "gradient") return undefined;
  const bg1 = state.background ?? "#000000";
  const bg2 = state.backgroundColor2 ?? bg1;
  return (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, bg1);
    grad.addColorStop(1, bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  };
}

/**
 * Live looping preview for a template — used on the picker page. Renders the
 * template's animation continuously to a small canvas, with sample assets
 * preloaded so photo-based templates look like real listings.
 *
 * Pauses automatically when scrolled off-screen (IntersectionObserver) or
 * when the tab is backgrounded (visibilitychange). Resumes from where it left
 * off, not from t=0, so animations don't all snap-restart on tab refocus.
 */
export function TemplatePreview({
  templateId,
  startOffsetMs = 0,
}: TemplatePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const template = ALL_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    // Initial skeleton so the canvas isn't blank/white during asset load
    ctx.fillStyle = SKELETON_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Merged state: template defaults overridden by sampleState (preview-only)
    const state: TemplateState = {
      ...getDefaultState(template),
      ...(template.sampleState ?? {}),
    };

    // Offscreen render target (full template resolution). Persistent across
    // frames so we don't re-allocate every render.
    const offscreen = document.createElement("canvas");
    offscreen.width = FULL_W;
    offscreen.height = FULL_H;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "high";

    const paintBackground = makePaintBackground(state, FULL_W, FULL_H);
    const solidBackground = state.background ?? "#000000";

    // Mutable loop state (let-bindings inside the effect)
    let cancelled = false;
    let rafId = 0;
    let mountTime = performance.now();
    // Time-offset accumulator. When paused, we save the current animation t
    // here so resume picks up where we stopped.
    let timeOffset = startOffsetMs / 1000;
    let lastRenderTime = 0;
    let isIntersecting = true;
    let isPageVisible = !document.hidden;

    // Build the timeline AFTER we have assets. Stash here so render() can use it.
    type RenderableTimeline = ReturnType<typeof template.build>;
    let timeline: RenderableTimeline | null = null;

    const renderFrame = (now: DOMHighResTimeStamp) => {
      if (cancelled || !timeline) return;

      // 24fps cap: skip rendering if we just rendered, but keep RAF spinning
      if (lastRenderTime > 0 && now - lastRenderTime < TARGET_FRAME_MS) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      lastRenderTime = now;

      const elapsed = (now - mountTime) / 1000 + timeOffset;
      const t = elapsed % timeline.duration;

      // Background
      if (paintBackground) {
        paintBackground(offCtx);
      } else {
        offCtx.fillStyle = solidBackground;
        offCtx.fillRect(0, 0, FULL_W, FULL_H);
      }

      timeline.render(t, offCtx);

      // Blit offscreen → display canvas (downsample with high-quality smoothing)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

      rafId = requestAnimationFrame(renderFrame);
    };

    const startLoop = () => {
      if (rafId !== 0 || !timeline) return;
      if (!isIntersecting || !isPageVisible) return;
      // Reset mountTime so timeOffset (the saved t) stays accurate
      mountTime = performance.now();
      lastRenderTime = 0;
      rafId = requestAnimationFrame(renderFrame);
    };

    const stopLoop = () => {
      if (rafId === 0 || !timeline) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
      // Save current t into timeOffset so resume picks up here
      const elapsed = (performance.now() - mountTime) / 1000 + timeOffset;
      timeOffset = elapsed % timeline.duration;
    };

    // ── Asset loading ────────────────────────────────────────────────────
    const sampleAssets = template.sampleAssets ?? {};
    const assetEntries = Object.entries(sampleAssets);

    const loadPromises = assetEntries.map(([key, src]) => {
      return new Promise<[string, HTMLImageElement | null]>((resolve) => {
        const img = new Image();
        img.onload = () => resolve([key, img]);
        img.onerror = () => resolve([key, null]);
        img.src = src;
      });
    });

    Promise.all(loadPromises).then((results) => {
      if (cancelled) return;
      const assets: TemplateAssets = {};
      for (const [key, img] of results) {
        assets[key] = img;
      }
      timeline = template.build(
        state,
        { width: FULL_W, height: FULL_H },
        assets
      );
      // mountTime gets reset in startLoop, but reset here too so the first
      // frame after asset-load doesn't have a huge time jump
      mountTime = performance.now();
      startLoop();
    });

    // ── Pause/resume hooks ──────────────────────────────────────────────
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          isIntersecting = entry.isIntersecting;
          if (isIntersecting) startLoop();
          else stopLoop();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(wrapper);

    const handleVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) startLoop();
      else stopLoop();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (rafId !== 0) cancelAnimationFrame(rafId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [templateId, startOffsetMs]);

  return (
    <div ref={wrapperRef} className="block w-full">
      <canvas
        ref={canvasRef}
        width={400}
        height={500}
        className="block w-full rounded-md"
        style={{
          aspectRatio: `${FULL_W} / ${FULL_H}`,
          backgroundColor: SKELETON_BG,
        }}
        aria-label="Template preview animation"
      />
    </div>
  );
}
