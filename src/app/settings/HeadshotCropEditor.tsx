"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * UX-2b-followup — the familiar modal crop EDITOR for the agent headshot.
 *
 * UX-2b shipped the reposition DATA (focal point + zoom, a pure CSS display
 * transform stored alongside the photo) and its render on the seller page +
 * /why. Those are reused untouched. What this replaces is only the Settings
 * INPUT: the old inline tiny-circle + slider (no confirm step) left agents
 * unsure it worked. This is the standard reassuring pattern people already know
 * from iOS Photos / LinkedIn / Gravatar:
 *
 *   • A circular crop frame with the area OUTSIDE the circle dimmed (scrim) and
 *     a guideline ring + rule-of-thirds grid inside it.
 *   • Drag to pan, zoom via slider + scroll-wheel (desktop) / pinch (mobile).
 *   • Cancel (discard) + Apply (commit). The circle shows exactly what will be
 *     kept, so Apply → the Settings avatar visibly updating IS the confirmation.
 *
 * Desktop renders a centered modal dialog; mobile a full-screen sheet (Tailwind
 * `sm:` breakpoint — no JS detection). Esc = Cancel, Enter = Apply; focus is
 * trapped and returned to the "Adjust" trigger by the caller on close.
 *
 * It NEVER re-crops or re-uploads the image. It only edits focalX/focalY (0–100%
 * background-position) and scale (1.0–2.0 zoom). Pan is clamped to 0–100 and zoom
 * to 1.0–2.0, so `background-size: cover` guarantees the frame can never expose
 * an empty edge.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 2;
const SCALE_STEP = 0.05;
const WHEEL_STEP = 0.0015; // per deltaY unit — a gentle scroll-to-zoom

const clampPct = (n: number) => Math.min(100, Math.max(0, n));
const clampScale = (n: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 100) / 100));

export interface HeadshotCropValue {
  focalX: number;
  focalY: number;
  scale: number;
}

/**
 * The crop FRAME shape. `circle` is the headshot default (byte-identical to the
 * original component). `rect` reuses the SAME drag-to-pan + scroll/pinch-zoom
 * interaction for a rectangular subject (e.g. a listing cover photo / a video
 * thumbnail), where the focal/scale math is identical and only the mask + the
 * workspace aspect differ.
 */
export type CropFrame =
  | { shape: "circle" }
  | { shape: "rect"; /** width / height, e.g. 4 / 3 */ aspect: number };

export function HeadshotCropEditor({
  photoUrl,
  focalX: initialFocalX,
  focalY: initialFocalY,
  scale: initialScale,
  onApply,
  onCancel,
  title = "Adjust headshot",
  helpText = "Drag to position your face. Scroll or pinch to zoom.",
  frame = { shape: "circle" },
  testIdPrefix = "headshot-crop",
}: {
  photoUrl: string;
  focalX: number;
  focalY: number;
  scale: number;
  onApply: (next: HeadshotCropValue) => void;
  onCancel: () => void;
  /** Dialog heading (default "Adjust headshot"). */
  title?: string;
  /** The instruction line under the zoom slider. */
  helpText?: string;
  /** Crop frame shape — circle (headshot) or a rectangular aspect. */
  frame?: CropFrame;
  /** Testid namespace (default "headshot-crop" keeps the headshot contract). */
  testIdPrefix?: string;
}) {
  const tid = (s: string) => `${testIdPrefix}-${s}`;
  const isCircle = frame.shape === "circle";
  // The workspace matches the frame aspect so the WYSIWYG crop is accurate: a
  // square for the circular headshot, the listing/thumbnail ratio for a rect.
  const workspaceAspect = isCircle ? 1 : frame.aspect;
  const [focalX, setFocalX] = useState(initialFocalX);
  const [focalY, setFocalY] = useState(initialFocalY);
  const [scale, setScale] = useState(initialScale);
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  // Active pointers for pan (1 pointer) + pinch (2 pointers).
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStart = useRef<{ px: number; py: number; fx: number; fy: number } | null>(
    null,
  );
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const bg = `url("${photoUrl.replace(/"/g, '\\"')}")`;
  const isAdjusted = focalX !== 50 || focalY !== 50 || scale > 1;

  const apply = useCallback(() => {
    onApply({
      focalX: Math.round(clampPct(focalX)),
      focalY: Math.round(clampPct(focalY)),
      scale: clampScale(scale),
    });
  }, [focalX, focalY, scale, onApply]);

  // Esc = Cancel, Enter = Apply, plus a minimal Tab focus-trap so keyboard
  // focus can't escape the dialog while it's open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        // Let Enter on the range slider behave normally; otherwise Apply.
        const target = e.target as HTMLElement | null;
        if (target?.tagName !== "INPUT") {
          e.preventDefault();
          apply();
        }
        return;
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [apply, onCancel]);

  // Move initial focus into the dialog on open.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      dragStart.current = { px: e.clientX, py: e.clientY, fx: focalX, fy: focalY };
      pinchStart.current = null;
      setDragging(true);
    } else if (pointers.current.size === 2) {
      // Second finger down → begin a pinch; suspend panning.
      dragStart.current = null;
      const pts = [...pointers.current.values()];
      pinchStart.current = { dist: distance(pts[0], pts[1]), scale };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    if (pointers.current.size >= 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = distance(pts[0], pts[1]);
      const ratio = dist / (pinchStart.current.dist || 1);
      setScale(clampScale(pinchStart.current.scale * ratio));
      return;
    }

    const start = dragStart.current;
    if (!start) return;
    // Direct manipulation: dragging the photo right/down reveals its top-left,
    // which DECREASES the focal percentage. Convert the pixel delta to a % of
    // the frame so a full-frame drag pans the whole image.
    const dxPct = ((e.clientX - start.px) / rect.width) * 100;
    const dyPct = ((e.clientY - start.py) / rect.height) * 100;
    setFocalX(Math.round(clampPct(start.fx - dxPct)));
    setFocalY(Math.round(clampPct(start.fy - dyPct)));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (pointers.current.size === 0) {
      dragStart.current = null;
      pinchStart.current = null;
      setDragging(false);
    } else if (pointers.current.size === 1) {
      // Lifted one finger of a pinch → resume panning from the remaining one.
      pinchStart.current = null;
      const [only] = [...pointers.current.values()];
      dragStart.current = { px: only.x, py: only.y, fx: focalX, fy: focalY };
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setScale((s) => clampScale(s - e.deltaY * WHEEL_STEP));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 sm:p-4"
      onPointerDown={(e) => {
        // Click on the backdrop (not the panel) cancels — standard modal.
        if (e.target === e.currentTarget) onCancel();
      }}
      data-testid={tid("backdrop")}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={tid("editor")}
        className="flex h-full w-full flex-col bg-neutral-950 outline-none sm:h-auto sm:max-w-[420px] sm:rounded-2xl sm:border sm:border-neutral-800 sm:shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-900 px-5 py-4">
          <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            data-testid={tid("close")}
            className="text-neutral-500 hover:text-neutral-200"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-6">
          {/* Workspace — a square area the photo fills (cover + focal + zoom).
              The circle is a crisp window; everything outside it is dimmed by a
              giant box-shadow scrim. Drag to pan, wheel/pinch to zoom. */}
          <div
            ref={workspaceRef}
            data-testid={tid("workspace")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={onWheel}
            className={`relative w-full max-w-[320px] touch-none select-none overflow-hidden rounded-2xl bg-neutral-900${
              isCircle ? " aspect-square" : ""
            }`}
            style={{
              cursor: dragging ? "grabbing" : "grab",
              ...(isCircle ? null : { aspectRatio: String(workspaceAspect) }),
            }}
          >
            <div
              data-testid={tid("img")}
              className="absolute inset-0 bg-no-repeat"
              style={{
                backgroundImage: bg,
                backgroundSize: "cover",
                backgroundPosition: `${focalX}% ${focalY}%`,
                transform: scale > 1 ? `scale(${scale})` : undefined,
                transformOrigin: `${focalX}% ${focalY}%`,
              }}
            />

            {isCircle ? (
              /* Circular window: a centered circle whose huge spread box-shadow
                 dims everything outside it. The ring + rule-of-thirds grid sit
                 inside the circle (clipped to it) as the familiar reassurance
                 affordance. pointer-events-none so drag passes through. */
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-white/70"
                style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
              >
                {/* rule-of-thirds */}
                <div className="absolute left-1/3 top-0 h-full w-px bg-white/25" />
                <div className="absolute left-2/3 top-0 h-full w-px bg-white/25" />
                <div className="absolute left-0 top-1/3 h-px w-full bg-white/25" />
                <div className="absolute left-0 top-2/3 h-px w-full bg-white/25" />
              </div>
            ) : (
              /* Rectangular window: the whole workspace IS the crop (the photo
                 fills the card frame), so only a thin guide border + the rule-of-
                 thirds grid sit on top — no scrim, since nothing is cropped away
                 beyond the card edges. */
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl border border-white/40"
              >
                <div className="absolute left-1/3 top-0 h-full w-px bg-white/20" />
                <div className="absolute left-2/3 top-0 h-full w-px bg-white/20" />
                <div className="absolute left-0 top-1/3 h-px w-full bg-white/20" />
                <div className="absolute left-0 top-2/3 h-px w-full bg-white/20" />
              </div>
            )}
          </div>

          <div className="w-full max-w-[320px]">
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
              data-testid={tid("zoom")}
              onChange={(e) => setScale(clampScale(Number(e.target.value)))}
              className="w-full accent-mint"
              aria-label="Zoom"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-neutral-500">{helpText}</p>
              {isAdjusted && (
                <button
                  type="button"
                  data-testid={tid("reset")}
                  onClick={() => {
                    setFocalX(50);
                    setFocalY(50);
                    setScale(1);
                  }}
                  className="flex-none text-[11px] text-neutral-500 hover:text-neutral-300"
                >
                  Reset to centered
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-900 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            data-testid={tid("cancel")}
            className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            data-testid={tid("apply")}
            className="rounded-md bg-mint px-4 py-2 text-sm font-medium text-black hover:bg-mint-hover"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
