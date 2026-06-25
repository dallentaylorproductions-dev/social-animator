"use client";

/**
 * PhotoFitControl — a reusable focal-point + zoom "fit" control for cover photos.
 *
 * The same pattern used for the Recent-listings coverflow cards, extracted so the
 * sample listing photo (the marketing-zone "the work" showcase) gets the SAME
 * control. WYSIWYG: a 3:4 preview (matching the card/showcase crop) the agent
 * clicks to set the focal point, plus a zoom slider. Pure DISPLAY transform —
 * the image bytes are never altered; the values are stored as object-position %
 * (0–100, default centered 50/50) + a 1.0–2.0 zoom.
 *
 * onChange emits only the changed fields ({focalX?, focalY?, scale?}); "Center"
 * emits all three as undefined. The caller maps these to its own field names.
 */
export interface PhotoFit {
  focalX?: number;
  focalY?: number;
  scale?: number;
}

export function PhotoFitControl({
  photoUrl,
  focalX,
  focalY,
  scale,
  onChange,
  testIdPrefix,
}: {
  photoUrl: string;
  focalX?: number;
  focalY?: number;
  scale?: number;
  onChange: (patch: PhotoFit) => void;
  testIdPrefix?: string;
}) {
  const fx = focalX ?? 50;
  const fy = focalY ?? 50;
  const sc = scale ?? 1;
  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : undefined);

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        Photo position
      </label>
      <div className="flex gap-3 items-start">
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
            const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
            onChange({
              focalX: Math.min(100, Math.max(0, x)),
              focalY: Math.min(100, Math.max(0, y)),
            });
          }}
          aria-label="Click where the home is to position the photo"
          data-testid={tid("pos")}
          className="relative aspect-[3/4] w-20 shrink-0 cursor-crosshair overflow-hidden rounded-md border border-neutral-800"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: `${fx}% ${fy}%`,
              transform: sc > 1 ? `scale(${sc})` : undefined,
              transformOrigin: `${fx}% ${fy}%`,
            }}
          />
        </button>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">
            Zoom
          </label>
          <input
            type="range"
            min="1"
            max="2"
            step="0.05"
            value={sc}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChange({ scale: v > 1 ? v : undefined });
            }}
            data-testid={tid("zoom")}
            className="w-full"
          />
          <button
            type="button"
            onClick={() => onChange({ focalX: undefined, focalY: undefined, scale: undefined })}
            data-testid={tid("reset")}
            className="mt-1 text-[11px] text-neutral-500 hover:text-neutral-200"
          >
            Center
          </button>
          <p className="mt-1 text-[11px] text-neutral-600 leading-relaxed">
            Click the photo where the home is, and zoom to fill the card.
          </p>
        </div>
      </div>
    </div>
  );
}
