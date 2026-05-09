"use client";

import { useRef } from "react";
import {
  type PromoDraft,
  type PhotoEntry,
  makePhotoEntry,
  MAX_HIGHLIGHTS,
  MAX_PHOTOS,
  PHOTO_MAX_EDGE,
  PHOTO_QUALITY,
  normalizeUrl,
} from "@/tools/open-house-promo/engine/types";
import { type BrandSettings } from "@/lib/brand";

interface PromoFormProps {
  draft: PromoDraft;
  onChange: (next: PromoDraft) => void;
  brand: BrandSettings;
  uploadError?: string | null;
  onUploadError?: (message: string) => void;
}

const HIGHLIGHT_PLACEHOLDERS = [
  'e.g., "4BR / 3BA"',
  'e.g., "0.25 acres"',
  'e.g., "Renovated kitchen"',
  'e.g., "Open floor plan"',
  'e.g., "Mountain views"',
];

export function PromoForm({
  draft,
  onChange,
  brand,
  uploadError,
  onUploadError,
}: PromoFormProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof PromoDraft>(
    key: K,
    value: PromoDraft[K]
  ) => onChange({ ...draft, [key]: value });

  // ── Highlights ────────────────────────────────────────────
  const updateHighlight = (i: number, value: string) => {
    const next = [...draft.propertyHighlights];
    next[i] = value;
    update("propertyHighlights", next);
  };
  const addHighlight = () => {
    if (draft.propertyHighlights.length >= MAX_HIGHLIGHTS) return;
    update("propertyHighlights", [...draft.propertyHighlights, ""]);
  };
  const removeHighlight = (i: number) => {
    update(
      "propertyHighlights",
      draft.propertyHighlights.filter((_, idx) => idx !== i)
    );
  };

  // ── Photos ────────────────────────────────────────────────
  const handlePhotoSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files ?? []);
    if (photoInputRef.current) photoInputRef.current.value = "";
    const slots = MAX_PHOTOS - draft.photos.length;
    if (slots <= 0) {
      onUploadError?.(`Photo limit reached (${MAX_PHOTOS} max)`);
      return;
    }
    const accepted: File[] = [];
    const tooLarge: string[] = [];
    const wrongType: string[] = [];
    const MAX_BYTES = 12 * 1024 * 1024;
    for (const f of files.slice(0, slots)) {
      if (!f.type.startsWith("image/")) wrongType.push(f.name);
      else if (f.size > MAX_BYTES) tooLarge.push(f.name);
      else accepted.push(f);
    }
    if (accepted.length > 0) {
      try {
        const dataUrls = await Promise.all(
          accepted.map((f) =>
            fileToCompressedDataUrl(f, PHOTO_MAX_EDGE, PHOTO_QUALITY)
          )
        );
        const newEntries = dataUrls.map((src) => makePhotoEntry(src));
        update("photos", [...draft.photos, ...newEntries]);
      } catch (err) {
        onUploadError?.(
          err instanceof Error ? err.message : "Could not process photos"
        );
        return;
      }
    }
    const messages: string[] = [];
    if (wrongType.length > 0)
      messages.push(`Skipped non-image: ${wrongType.join(", ")}`);
    if (tooLarge.length > 0)
      messages.push(`Skipped >12MB: ${tooLarge.join(", ")}`);
    if (messages.length > 0) onUploadError?.(messages.join(" · "));
  };

  const removePhoto = (i: number) =>
    update("photos", draft.photos.filter((_, idx) => idx !== i));

  const movePhoto = (i: number, dir: "up" | "down") => {
    const target = dir === "up" ? i - 1 : i + 1;
    if (target < 0 || target >= draft.photos.length) return;
    const next = [...draft.photos];
    [next[i], next[target]] = [next[target], next[i]];
    update("photos", next);
  };

  /** Click handler for the photo thumbnail's focal-point overlay.
   *  Maps the click coordinates inside the thumbnail to a 0-100
   *  focal-point pair stored on the PhotoEntry. The thumbnail is
   *  pre-cropped at object-fit: cover with object-position driven
   *  by the focal point, so each click immediately re-frames the
   *  thumbnail. */
  const setFocalPoint = (
    i: number,
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    const fx = ((clientX - rect.left) / rect.width) * 100;
    const fy = ((clientY - rect.top) / rect.height) * 100;
    const focalX = Math.max(0, Math.min(100, fx));
    const focalY = Math.max(0, Math.min(100, fy));
    const next: PhotoEntry[] = draft.photos.map((p, idx) =>
      idx === i ? { ...p, focalX, focalY } : p
    );
    update("photos", next);
  };

  // ── Color overrides ───────────────────────────────────────
  const effectivePrimary = draft.primaryColor || brand.primaryColor;
  const effectiveAccent = draft.accentColor || brand.accentColor;
  const effectiveBackground =
    draft.backgroundColor || brand.backgroundColor || "#ffffff";
  const hasColorOverride =
    !!draft.primaryColor || !!draft.accentColor || !!draft.backgroundColor;
  const resetColors = () =>
    onChange({
      ...draft,
      primaryColor: "",
      accentColor: "",
      backgroundColor: "",
    });

  // QR URL normalization on blur — auto-prefix https:// for bare
  // domains so the "is this a valid target?" check downstream is
  // deterministic.
  const normalizeQrOnBlur = () => {
    const normalized = normalizeUrl(draft.qrTargetUrl);
    if (normalized !== draft.qrTargetUrl) update("qrTargetUrl", normalized);
  };

  return (
    <div className="space-y-8">
      {/* ── BRAND COLORS ─────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <SectionLabel>Brand colors (this promo)</SectionLabel>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          Override colors for this promo only — your brand profile in Settings
          is unchanged.
        </p>
      </div>

      {/* ── EVENT ────────────────────────────────────────── */}
      <FormSection title="Event">
        <Field
          label="Event date"
          required
          helper="Set the event window. Used in the flyer and animated promo."
        >
          <DateInput
            value={draft.eventDate}
            onChange={(v) => update("eventDate", v)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time" required>
            <TimeInput
              value={draft.eventStartTime}
              onChange={(v) => update("eventStartTime", v)}
            />
          </Field>
          <Field label="End time">
            <TimeInput
              value={draft.eventEndTime}
              onChange={(v) => update("eventEndTime", v)}
            />
          </Field>
        </div>
      </FormSection>

      {/* ── PROPERTY ─────────────────────────────────────── */}
      <FormSection title="Property">
        <Field
          label="Property address"
          required
          helper="Where is the open house?"
        >
          <TextInput
            value={draft.propertyAddress}
            onChange={(v) => update("propertyAddress", v)}
            placeholder="1247 Maple Heights Dr"
          />
        </Field>
        <Field label="City, state, zip">
          <TextInput
            value={draft.propertyCity}
            onChange={(v) => update("propertyCity", v)}
            placeholder="Olympia, WA 98501"
          />
        </Field>
        <Field label="Listing price">
          <TextInput
            value={draft.listingPrice}
            onChange={(v) => update("listingPrice", v)}
            placeholder="$685,000"
          />
        </Field>
        <Field label="Description">
          <TextArea
            value={draft.description}
            onChange={(v) => update("description", v)}
            placeholder="One-line pitch shown under the address — what makes this place special?"
            rows={2}
          />
        </Field>
      </FormSection>

      {/* ── HIGHLIGHTS ───────────────────────────────────── */}
      <FormSection title="Highlights">
        <Field
          label={`Property highlights (${draft.propertyHighlights.length} / ${MAX_HIGHLIGHTS})`}
        >
          <div className="space-y-2">
            {draft.propertyHighlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  value={h}
                  onChange={(v) => updateHighlight(i, v)}
                  placeholder={
                    HIGHLIGHT_PLACEHOLDERS[i % HIGHLIGHT_PLACEHOLDERS.length]
                  }
                />
                <button
                  type="button"
                  onClick={() => removeHighlight(i)}
                  className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                  aria-label="Remove highlight"
                >
                  ✕
                </button>
              </div>
            ))}
            {draft.propertyHighlights.length < MAX_HIGHLIGHTS && (
              <button
                type="button"
                onClick={addHighlight}
                className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
              >
                + Add highlight
              </button>
            )}
          </div>
        </Field>
      </FormSection>

      {/* ── PHOTOS ───────────────────────────────────────── */}
      <FormSection title="Photos">
        <Field
          label={`Photos (${draft.photos.length} / ${MAX_PHOTOS})`}
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handlePhotoSelect}
          />
          {draft.photos.length > 0 && (
            <>
              <ul className="space-y-2 mb-2">
                {draft.photos.map((photo, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-md p-2"
                  >
                    {/* Tappable focal-point thumbnail. The crosshair
                        marks the current focal point; click anywhere
                        moves it. object-position uses the live focal
                        values so the thumbnail re-frames instantly. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => setFocalPoint(i, e)}
                      onKeyDown={(e) => {
                        // Arrow keys nudge focal point 5% per press
                        // — useful for fine-tuning after a click.
                        const step = 5;
                        let dx = 0;
                        let dy = 0;
                        if (e.key === "ArrowLeft") dx = -step;
                        else if (e.key === "ArrowRight") dx = step;
                        else if (e.key === "ArrowUp") dy = -step;
                        else if (e.key === "ArrowDown") dy = step;
                        if (dx === 0 && dy === 0) return;
                        e.preventDefault();
                        const next: PhotoEntry[] = draft.photos.map(
                          (p, idx) =>
                            idx === i
                              ? {
                                  ...p,
                                  focalX: Math.max(
                                    0,
                                    Math.min(100, p.focalX + dx)
                                  ),
                                  focalY: Math.max(
                                    0,
                                    Math.min(100, p.focalY + dy)
                                  ),
                                }
                              : p
                        );
                        update("photos", next);
                      }}
                      className="relative w-20 h-14 rounded overflow-hidden flex-shrink-0 cursor-crosshair focus:outline-none focus:ring-2 focus:ring-[#4ef2d9]"
                      aria-label={`Set focal point on photo ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.src}
                        alt={`Photo ${i + 1}`}
                        className="w-full h-full object-cover pointer-events-none"
                        style={{
                          objectPosition: `${photo.focalX}% ${photo.focalY}%`,
                        }}
                      />
                      {/* Crosshair indicator — outer ring + inner dot,
                          mint-tinted, drop shadow so it stays visible
                          on light + dark photo regions. */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: `${photo.focalX}%`,
                          top: `${photo.focalY}%`,
                          transform: "translate(-50%, -50%)",
                          filter:
                            "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                          style={{ borderColor: "#4ef2d9" }}
                        >
                          <div
                            className="w-1 h-1 rounded-full"
                            style={{ backgroundColor: "#4ef2d9" }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="flex-1 text-xs text-neutral-400 truncate">
                      {i === 0 && (
                        <span className="text-[#4ef2d9] mr-2">HERO</span>
                      )}
                      Photo {i + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => movePhoto(i, "up")}
                        disabled={i === 0}
                        className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(i, "down")}
                        disabled={i === draft.photos.length - 1}
                        className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-neutral-600 leading-relaxed mb-2">
                Tap a photo to set its focal point — the crop will
                center on what you tap. Arrow keys nudge by 5%.
              </p>
            </>
          )}
          {draft.photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
            >
              {draft.photos.length === 0
                ? `Click to upload photos (up to ${MAX_PHOTOS})`
                : `+ Add another photo (${MAX_PHOTOS - draft.photos.length} left)`}
            </button>
          )}
          {uploadError && (
            <p className="mt-2 text-[11px] text-red-400 leading-snug">
              {uploadError}
            </p>
          )}
        </Field>
      </FormSection>

      {/* ── QR CODE TARGET ───────────────────────────────── */}
      <FormSection title="QR code target">
        <Field
          label="Target URL"
          helper="Where should the QR code link? Paste your Zillow listing, Google Maps location, or your website."
        >
          <TextInput
            value={draft.qrTargetUrl}
            onChange={(v) => update("qrTargetUrl", v)}
            onBlur={normalizeQrOnBlur}
            placeholder="https://zillow.com/homedetails/..."
            type="url"
          />
        </Field>
      </FormSection>

      {/* ── EVENT NOTES ──────────────────────────────────── */}
      <FormSection title="Event notes">
        <Field
          label="Notes (optional)"
          helper="Optional extras like refreshments, RSVP info, or special access details."
        >
          <TextArea
            value={draft.eventNotes}
            onChange={(v) => update("eventNotes", v)}
            placeholder="Light refreshments served · RSVP appreciated"
            rows={2}
          />
        </Field>
      </FormSection>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 pt-2 border-t border-neutral-900">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#4ef2d9] font-semibold">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
      {children}
    </label>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
        {required && <span className="text-[#4ef2d9] ml-1">*</span>}
      </label>
      {children}
      {helper && (
        <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9] resize-y leading-relaxed"
    />
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
    />
  );
}

function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
        <label
          className="relative block w-11 h-11 rounded border border-neutral-800 cursor-pointer overflow-hidden flex-shrink-0"
          style={{ backgroundColor: value || "#000000" }}
        >
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#4ef2d9]"
        />
      </div>
    </div>
  );
}

/**
 * Decode an image File, downsample to maxEdge on the longest side,
 * and re-encode as a compressed JPEG data URL. Same compression
 * pattern the listing-flyer's react-pdf input uses.
 */
function fileToCompressedDataUrl(
  file: File,
  maxEdge: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(blobUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`Could not load ${file.name}`));
    };
    img.src = blobUrl;
  });
}
