"use client";

import { useRef } from "react";
import {
  type FlyerDraft,
  type FlyerPhoto,
  MAX_PHOTOS,
  MAX_FEATURES,
  MIN_DURATION,
  MAX_DURATION,
  clampDuration,
} from "@/tools/listing-flyer/engine/types";
import { type BrandSettings } from "@/lib/brand";

interface FlyerFormProps {
  draft: FlyerDraft;
  onChange: (next: FlyerDraft) => void;
  photos: FlyerPhoto[];
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (id: string) => void;
  onMovePhoto: (id: string, direction: "up" | "down") => void;
  /** Transient error from photo upload (file too large, wrong type, etc). */
  uploadError?: string | null;
  /** Brand profile (from Settings) — used as the fallback color and as the
   * "Reset to brand defaults" target. */
  brand: BrandSettings;
}

export function FlyerForm({
  draft,
  onChange,
  photos,
  onAddPhotos,
  onRemovePhoto,
  onMovePhoto,
  uploadError,
  brand,
}: FlyerFormProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof FlyerDraft>(
    key: K,
    value: FlyerDraft[K]
  ) => onChange({ ...draft, [key]: value });

  const updateFeature = (i: number, value: string) => {
    const next = [...draft.features];
    next[i] = value;
    update("features", next);
  };

  const addFeature = () => {
    if (draft.features.length >= MAX_FEATURES) return;
    update("features", [...draft.features, ""]);
  };

  const removeFeature = (i: number) => {
    update(
      "features",
      draft.features.filter((_, idx) => idx !== i)
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    onAddPhotos(files);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Per-flyer color overrides — empty draft value falls through to brand.
  // Background falls back to white (brand profile doesn't expose one yet).
  const effectivePrimary = draft.primaryColor || brand.primaryColor;
  const effectiveAccent = draft.accentColor || brand.accentColor;
  const effectiveBackground =
    draft.backgroundColor || brand.backgroundColor || "#ffffff";
  const hasColorOverride =
    !!draft.primaryColor ||
    !!draft.accentColor ||
    !!draft.backgroundColor;

  const resetColors = () =>
    onChange({
      ...draft,
      primaryColor: "",
      accentColor: "",
      backgroundColor: "",
    });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Brand colors (this flyer)
          </label>
          {hasColorOverride && (
            <button
              type="button"
              onClick={resetColors}
              className="text-[10px] text-neutral-500 hover:text-[#4ef2d9] transition"
            >
              ↺ Reset to brand defaults
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ColorInput
            label="Primary"
            value={effectivePrimary}
            onChange={(v) => update("primaryColor", v)}
          />
          <ColorInput
            label="Accent"
            value={effectiveAccent}
            onChange={(v) => update("accentColor", v)}
          />
          <ColorInput
            label="Background"
            value={effectiveBackground}
            onChange={(v) => update("backgroundColor", v)}
          />
        </div>
        <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
          Override colors for this flyer only — your brand profile in Settings
          is unchanged.
        </p>
      </div>

      <Field label="Status (optional)">
        <TextInput
          value={draft.status}
          onChange={(v) => update("status", v)}
          placeholder="Just Listed · Just Sold · Open House"
        />
      </Field>

      <Field label="Address line 1" required>
        <TextInput
          value={draft.addressLine1}
          onChange={(v) => update("addressLine1", v)}
          placeholder="1247 Maple Heights Dr"
        />
      </Field>

      <Field label="Address line 2 (optional)">
        <TextInput
          value={draft.addressLine2}
          onChange={(v) => update("addressLine2", v)}
          placeholder="Beaverton, OR 97005"
        />
      </Field>

      <Field label="List price" required>
        <TextInput
          value={draft.price}
          onChange={(v) => update("price", v)}
          placeholder="$685,000"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Beds">
          <TextInput
            type="number"
            value={draft.beds}
            onChange={(v) => update("beds", v)}
            placeholder="4"
          />
        </Field>
        <Field label="Baths">
          <TextInput
            type="number"
            value={draft.baths}
            onChange={(v) => update("baths", v)}
            placeholder="2.5"
          />
        </Field>
        <Field label="Sq ft">
          <TextInput
            value={draft.sqft}
            onChange={(v) => update("sqft", v)}
            placeholder="2,840"
          />
        </Field>
      </div>

      <Field
        label={`Feature bullets (${draft.features.length} / ${MAX_FEATURES})`}
      >
        <div className="space-y-2">
          {draft.features.map((feature, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput
                value={feature}
                onChange={(v) => updateFeature(i, v)}
                placeholder={`Feature ${i + 1} (e.g. "Chef's kitchen")`}
              />
              <button
                type="button"
                onClick={() => removeFeature(i)}
                className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                aria-label="Remove feature"
              >
                ✕
              </button>
            </div>
          ))}
          {draft.features.length < MAX_FEATURES && (
            <button
              type="button"
              onClick={addFeature}
              className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
            >
              + Add feature bullet
            </button>
          )}
        </div>
      </Field>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            MP4 duration
          </label>
          <span className="text-[11px] text-neutral-300 font-mono tabular-nums">
            {draft.duration} seconds
          </span>
        </div>
        <input
          type="range"
          min={MIN_DURATION}
          max={MAX_DURATION}
          step={1}
          value={draft.duration}
          onChange={(e) =>
            update("duration", clampDuration(Number(e.target.value)))
          }
          className="w-full accent-[#4ef2d9] cursor-pointer"
        />
        <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
          Longer videos give viewers more time to read. 8 seconds is
          recommended for Instagram Reels and Stories.
        </p>
      </div>

      <Field label={`Photos (${photos.length} / ${MAX_PHOTOS})`} required>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileSelect}
        />

        {photos.length > 0 && (
          <ul className="space-y-2 mb-3">
            {photos.map((photo, i) => (
              <li
                key={photo.id}
                className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-md p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Photo ${i + 1}`}
                  className="w-16 h-12 object-cover rounded"
                />
                <span className="flex-1 text-xs text-neutral-400 truncate">
                  {i === 0 && (
                    <span className="text-[#4ef2d9] mr-2">HERO</span>
                  )}
                  {photo.file.name}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMovePhoto(photo.id, "up")}
                    disabled={i === 0}
                    className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMovePhoto(photo.id, "down")}
                    disabled={i === photos.length - 1}
                    className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(photo.id)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
          >
            {photos.length === 0
              ? "Click to upload photos (up to 5)"
              : `+ Add another photo (${MAX_PHOTOS - photos.length} left)`}
          </button>
        )}

        {uploadError && (
          <p className="mt-2 text-[11px] text-red-400 leading-snug">
            {uploadError}
          </p>
        )}
      </Field>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
        {required && <span className="text-[#4ef2d9] ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
    />
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[9px] uppercase tracking-[0.12em] text-neutral-600 mb-1.5">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded cursor-pointer bg-transparent border border-neutral-800 p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#4ef2d9]"
        />
      </div>
    </div>
  );
}
