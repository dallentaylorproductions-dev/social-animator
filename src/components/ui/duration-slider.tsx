"use client";

/**
 * MP4 duration slider — shared between Listing Flyer Generator and
 * Open House Promo Generator. Both tools render canvas-2D timelines
 * that the user can stretch from 5-15s, so the picker UX is the
 * same in both places. Extract here so tweaks to copy / styling /
 * input behavior land in one file rather than drifting between
 * tools.
 *
 * Caller owns the value/onChange state and the min/max constants
 * (different tools may want different ranges; the component just
 * renders whatever range it's given).
 */

interface DurationSliderProps {
  /** Current value in seconds. */
  value: number;
  /** Called with the new clamped integer value. */
  onChange: (next: number) => void;
  /** Minimum allowed value, inclusive. Default 5. */
  min?: number;
  /** Maximum allowed value, inclusive. Default 15. */
  max?: number;
  /** Section label shown above the slider (e.g. "MP4 duration",
   *  "Video length"). */
  label?: string;
  /** Optional helper text rendered below the slider. */
  helper?: string;
}

export function DurationSlider({
  value,
  onChange,
  min = 5,
  max = 15,
  label = "Video length",
  helper,
}: DurationSliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          {label}
        </label>
        <span className="text-[11px] text-neutral-300 font-mono tabular-nums">
          {value} seconds
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          const next = Number.isFinite(raw)
            ? Math.max(min, Math.min(max, Math.round(raw)))
            : min;
          onChange(next);
        }}
        className="w-full accent-[#4ef2d9] cursor-pointer"
      />
      {helper ? (
        <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
