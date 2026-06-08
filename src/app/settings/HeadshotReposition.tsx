"use client";

import { useRef, useState } from "react";

/**
 * UX-2b — repositionable headshot control. After a headshot is uploaded, this
 * lets the agent drag the photo to set the focal point and zoom in, so an
 * off-center face (Aaron's live-test bug: his face was cut off at the top of
 * the circular frame) can be brought to center.
 *
 * It is a pure DISPLAY transform — it NEVER re-crops or re-uploads the image.
 * It only edits a focal point (`focalX`/`focalY` as 0–100%) and a zoom
 * (`scale`, 1.0–2.0) stored alongside `agentPhotoUrl`. The preview frame here
 * mirrors the agent-band avatar 1:1 (same rounded square, same `cover` +
 * `background-position` + `transform: scale()`), so what the agent sets is what
 * the seller page and /why render.
 *
 * Bounds: focal is clamped to 0–100 and zoom to 1.0–2.0, so the frame can never
 * be dragged or zoomed to expose an empty edge.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 2;
const SCALE_STEP = 0.05;

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export interface HeadshotRepositionValue {
  focalX: number;
  focalY: number;
  scale: number;
}

export function HeadshotReposition({
  photoUrl,
  focalX,
  focalY,
  scale,
  onChange,
  onReset,
}: {
  photoUrl: string;
  focalX: number;
  focalY: number;
  scale: number;
  onChange: (next: HeadshotRepositionValue) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{
    px: number;
    py: number;
    fx: number;
    fy: number;
  } | null>(null);

  const bg = `url("${photoUrl.replace(/"/g, '\\"')}")`;
  const isAdjusted = focalX !== 50 || focalY !== 50 || scale > 1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { px: e.clientX, py: e.clientY, fx: focalX, fy: focalY };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Direct manipulation: dragging the photo right/down should reveal its
    // left/top, which means DECREASING the focal percentage. Convert the
    // pixel delta to a percentage of the frame so a full-frame drag pans the
    // whole image.
    const dxPct = ((e.clientX - start.px) / rect.width) * 100;
    const dyPct = ((e.clientY - start.py) / rect.height) * 100;
    onChange({
      focalX: Math.round(clampPct(start.fx - dxPct)),
      focalY: Math.round(clampPct(start.fy - dyPct)),
      scale,
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="space-y-3" data-testid="brand-headshot-reposition">
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
        Reposition headshot
      </label>

      <div className="flex items-center gap-4">
        {/* The frame mirrors the agent-band avatar (rounded square). The outer
            div is the clip; the inner div carries the photo + transform — the
            same two-layer structure the renderer uses, so the preview is
            faithful. */}
        <div
          data-testid="brand-headshot-reposition-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative h-[140px] w-[140px] flex-none overflow-hidden rounded-[24px] border border-neutral-700 bg-neutral-900 touch-none select-none"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        >
          <div
            data-testid="brand-headshot-reposition-img"
            className="absolute inset-0 bg-no-repeat"
            style={{
              backgroundImage: bg,
              backgroundSize: "cover",
              backgroundPosition: `${focalX}% ${focalY}%`,
              transform: scale > 1 ? `scale(${scale})` : undefined,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
          {/* Center crosshair guide — quiet, so the agent can line up a face. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Drag the photo to center your face in the frame, then zoom in if you
            need to. This only changes how the photo sits — your original image
            isn&apos;t cropped.
          </p>

          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-neutral-500">
              <span>Zoom</span>
              <span className="tabular-nums text-neutral-400">
                {scale.toFixed(2)}×
              </span>
            </div>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={SCALE_STEP}
              value={scale}
              data-testid="brand-headshot-zoom"
              onChange={(e) =>
                onChange({ focalX, focalY, scale: Number(e.target.value) })
              }
              className="w-full accent-mint"
            />
          </div>

          {isAdjusted && (
            <button
              type="button"
              data-testid="brand-headshot-reposition-reset"
              onClick={onReset}
              className="text-[11px] text-neutral-500 hover:text-neutral-300"
            >
              Reset to centered
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
