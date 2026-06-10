"use client";

import { useRef } from "react";
import {
  DEFAULT_VIDEO_FRAMING,
  type VideoFraming,
} from "@/tools/seller-presentation/engine/types";

/**
 * VideoFramingField — the Instagram-style inlay framing control
 * (P2-VIDEO-2). The §01 agent-note inlay FILLS its fixed-aspect frame with
 * `object-fit: cover` (no letterbox); an automatic cover would chop the
 * agent's head, so this lets the agent drag to reposition (and zoom) their
 * face inside the frame. The chosen framing is stored on the video block and
 * baked into the published page — the consumer inlay shows the exact same
 * crop. Fullscreen is unaffected: the buyer always sees the full uploaded
 * video at native aspect (the renderer resets framing in `:fullscreen`).
 *
 * The preview here uses the SAME CSS recipe as the renderer
 * (`AgentNote.video__player`): `object-fit: cover` + `object-position:
 * focalX% focalY%` + `transform: scale(zoom)` inside an `overflow: hidden`
 * frame — so what the agent frames is exactly what ships (WYSIWYG).
 *
 * `object-position` is aspect-independent, so one focal point drives BOTH the
 * 4/5 (default) and 3/4 (≥720px container) consumer frames; the control
 * renders at 4/5 (the default) as a representative surface.
 *
 * Touch-first (agents frame on their phones): a single pointer handler covers
 * mouse + touch + pen, and `touch-action: none` on the frame keeps a drag
 * from scrolling the page.
 */

interface VideoFramingFieldProps {
  label?: string;
  /** Hosted video URL to frame. The field renders nothing when empty. */
  videoUrl: string;
  /** Effective poster (so the frame shows a still even before any decode). */
  posterUrl?: string;
  /** Current framing, or undefined → the unframed default is shown. */
  framing: VideoFraming | undefined;
  /** Called with the complete, updated framing on every drag / zoom / reset. */
  onChange: (framing: VideoFraming) => void;
  testIdPrefix?: string;
  helpText?: string;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export function VideoFramingField({
  label = "Framing",
  videoUrl,
  posterUrl,
  framing,
  onChange,
  testIdPrefix,
  helpText = "Drag to position the face inside the frame. This is exactly how the inlay will look — fullscreen always shows your full video.",
}: VideoFramingFieldProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  // Drag origin: pointer x/y at press + the focal point at that instant.
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(
    null,
  );

  if (!videoUrl) return null;

  // Resolve per-field so an undefined/partial framing renders the default.
  const current: VideoFraming = {
    focalX: framing?.focalX ?? DEFAULT_VIDEO_FRAMING.focalX,
    focalY: framing?.focalY ?? DEFAULT_VIDEO_FRAMING.focalY,
    zoom: framing?.zoom ?? DEFAULT_VIDEO_FRAMING.zoom,
  };

  const tid = (suffix: string) =>
    testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      fx: current.focalX,
      fy: current.focalY,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = drag.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!st || !rect) return;
    // Content-follows-finger: dragging right reveals the LEFT of the source,
    // so the focal % moves opposite the pointer delta. Normalize the delta to
    // the frame size so the sensitivity is resolution-independent.
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    const nx = clamp(st.fx - (dx / rect.width) * 100, 0, 100);
    const ny = clamp(st.fy - (dy / rect.height) * 100, 0, 100);
    onChange({
      focalX: Math.round(nx),
      focalY: Math.round(ny),
      zoom: current.zoom,
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onZoom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const z = clamp(parseFloat(e.target.value), 1, 3);
    onChange({ ...current, zoom: Math.round(z * 100) / 100 });
  };

  const reset = () => onChange({ ...DEFAULT_VIDEO_FRAMING });

  const isFramed =
    current.focalX !== DEFAULT_VIDEO_FRAMING.focalX ||
    current.focalY !== DEFAULT_VIDEO_FRAMING.focalY ||
    current.zoom !== DEFAULT_VIDEO_FRAMING.zoom;

  return (
    <div className="video-framing" data-testid={testIdPrefix}>
      <span className="field-label">{label}</span>
      <div
        ref={frameRef}
        className="video-framing__frame"
        data-testid={tid("frame")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Drag to position the video inside the frame"
      >
        <video
          className="video-framing__media"
          data-testid={tid("media")}
          src={videoUrl}
          {...(posterUrl ? { poster: posterUrl } : {})}
          muted
          playsInline
          preload="metadata"
          // SAME recipe as AgentNote.video__player so the control is WYSIWYG.
          style={{
            objectFit: "cover",
            objectPosition: `${current.focalX}% ${current.focalY}%`,
            transform: `scale(${current.zoom})`,
          }}
        />
        <span className="video-framing__grid" aria-hidden="true" />
      </div>
      <div className="video-framing__controls">
        <label className="video-framing__zoom">
          <span className="video-framing__zoom-label">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={current.zoom}
            onChange={onZoom}
            data-testid={tid("zoom")}
            aria-label="Zoom"
          />
        </label>
        <button
          type="button"
          className="video-framing__reset"
          onClick={reset}
          disabled={!isFramed}
          data-testid={tid("reset")}
        >
          Reset framing
        </button>
      </div>
      {helpText ? <p className="hint">{helpText}</p> : null}
    </div>
  );
}
