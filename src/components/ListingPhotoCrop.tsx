"use client";

import { useRef, useState } from "react";
import {
  HeadshotCropEditor,
  type HeadshotCropValue,
} from "@/app/settings/HeadshotCropEditor";

/**
 * ListingPhotoCrop — the reposition control for a rectangular listing/cover
 * photo (and, by the same contract, a video thumbnail).
 *
 * This REPLACES the old `PhotoFitControl` (a click-to-place focal point + a
 * zoom slider, which read as janky). It REUSES the production headshot crop
 * modal (`HeadshotCropEditor`) — the familiar drag-to-pan + scroll/pinch-zoom
 * interaction agents already trust — in its rectangular `frame` mode, so the
 * listing photo gets the SAME control as the headshot instead of a lookalike.
 *
 * Output is identical to `PhotoFitControl`'s: it emits only `{focalX?, focalY?,
 * scale?}` as object-position % (0–100, default centered 50/50) + a 1.0–2.0
 * zoom; "Center"/centered crops emit undefined so the caller stores nothing
 * (byte-identical). The image bytes are never altered — pure display transform.
 */
export interface PhotoFit {
  focalX?: number;
  focalY?: number;
  scale?: number;
}

export function ListingPhotoCrop({
  photoUrl,
  focalX,
  focalY,
  scale,
  aspect = 4 / 3,
  testIdPrefix,
  onChange,
}: {
  photoUrl: string;
  focalX?: number;
  focalY?: number;
  scale?: number;
  /** Crop frame ratio (width / height) — match where the photo is displayed. */
  aspect?: number;
  testIdPrefix?: string;
  onChange: (patch: PhotoFit) => void;
}) {
  const [editing, setEditing] = useState(false);
  const adjustRef = useRef<HTMLButtonElement>(null);
  const fx = focalX ?? 50;
  const fy = focalY ?? 50;
  const sc = scale ?? 1;
  const adjusted = focalX !== undefined || focalY !== undefined || scale !== undefined;
  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : undefined);
  const bg = `url("${photoUrl.replace(/"/g, '\\"')}")`;

  const apply = (next: HeadshotCropValue) => {
    const centered = next.focalX === 50 && next.focalY === 50 && next.scale === 1;
    onChange({
      focalX: centered ? undefined : next.focalX,
      focalY: centered ? undefined : next.focalY,
      scale: next.scale > 1 ? next.scale : undefined,
    });
    setEditing(false);
    adjustRef.current?.focus();
  };

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        Photo position
      </label>
      <div className="flex items-center gap-3">
        {/* WYSIWYG thumbnail — exactly how the photo sits in the card frame. */}
        <div
          className="relative w-24 shrink-0 overflow-hidden rounded-md border border-neutral-800"
          style={{ aspectRatio: String(aspect) }}
        >
          <div
            data-testid={tid("preview")}
            className="absolute inset-0 bg-no-repeat"
            style={{
              backgroundImage: bg,
              backgroundSize: "cover",
              backgroundPosition: `${fx}% ${fy}%`,
              transform: sc > 1 ? `scale(${sc})` : undefined,
              transformOrigin: `${fx}% ${fy}%`,
            }}
          />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <button
            ref={adjustRef}
            type="button"
            onClick={() => setEditing(true)}
            data-testid={tid("adjust")}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            Adjust position
          </button>
          {adjusted && (
            <button
              type="button"
              onClick={() => onChange({ focalX: undefined, focalY: undefined, scale: undefined })}
              data-testid={tid("reset")}
              className="text-[11px] text-neutral-500 hover:text-neutral-200"
            >
              Center
            </button>
          )}
          <p className="text-[11px] text-neutral-600 leading-relaxed">
            Drag to position, scroll or pinch to zoom.
          </p>
        </div>
      </div>

      {editing && (
        <HeadshotCropEditor
          photoUrl={photoUrl}
          focalX={fx}
          focalY={fy}
          scale={sc}
          frame={{ shape: "rect", aspect }}
          title="Adjust photo"
          helpText="Drag to position the photo. Scroll or pinch to zoom."
          testIdPrefix={testIdPrefix ? `${testIdPrefix}-crop` : "listing-crop"}
          onApply={apply}
          onCancel={() => {
            setEditing(false);
            adjustRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
