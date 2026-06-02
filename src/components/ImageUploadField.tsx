"use client";

import { useRef, useState } from "react";

/**
 * ImageUploadField — reusable phone-camera-roll → hosted-URL uploader
 * (v1.47 / A7c.2). Replaces the FileReader → data URL pattern that
 * StepProperty / BrandProfileForm had been using for hero photos +
 * agent headshots, because:
 *
 *   1. Agents work from their phones. A URL-only field is unusable —
 *      they need to pick a photo from their camera roll. `<input
 *      type="file" accept="image/*">` opens the iOS Photo Library /
 *      Take Photo / Choose File sheet natively, no extra wiring.
 *   2. The base64 data URL of a full-res phone photo is multi-MB.
 *      Stuffing that into localStorage and the published KV record
 *      bloats both stores and makes /h/[slug] slow on a buyer's
 *      phone. We downscale client-side (canvas: longest edge ~1600px,
 *      JPEG quality 0.82) and upload to Vercel Blob, then store ONLY
 *      the returned URL.
 *
 * The component is intentionally generic — `label`, `value`,
 * `onChange(url)` props mean A7d can drop it onto `editorialPhotoUrl`
 * + the video poster, and the other tools (OH Prep / SIR / Listing
 * Flyer / brand logo) can adopt it opportunistically.
 *
 * A secondary "paste URL" affordance is kept (some agents already have
 * Zillow / FMLS / Dropbox image links and prefer to paste). The PRIMARY
 * path is the photo picker.
 *
 * Why no Image-optimization deps: the downscale uses the plain
 * <canvas> API. Phone photos at longest-edge 1600 / quality 0.82
 * compress to ~150–400 KiB, well inside the route's 8 MiB cap.
 */

interface ImageUploadFieldProps {
  /** Label shown above the field. */
  label: string;
  /** Current hosted URL, or empty string. */
  value: string;
  /** Called with the hosted URL after a successful upload, or "" on remove. */
  onChange: (url: string) => void;
  /** Aspect-ratio class for the preview (e.g. "aspect-[4/3]" or "aspect-square"). */
  previewAspect?: string;
  /** Help text shown below the field. */
  helpText?: string;
  /** Optional subfolder for the Blob path. Defaults to "uploads". */
  folder?: string;
  /** test id prefix; the inner elements suffix this (preview, upload-button, etc). */
  testIdPrefix?: string;
  /** Optional placeholder for the "paste URL" fallback. */
  urlPlaceholder?: string;
  /**
   * Camera-roll-only mode (A7d.3). When true, the "…or paste an
   * image URL" input is removed entirely (not hidden) — the agent's
   * only path is the picker. Used for the video thumbnail field
   * where the upstream brief explicitly removes the paste-URL
   * affordance.
   */
  disablePasteUrl?: boolean;
  /**
   * Empty-state dropzone copy (Phase B1 — additive, backward
   * compatible). When `emptyTitle` is set, the empty-state button
   * renders it as the primary line (with `emptySubtext` beneath)
   * instead of the default "Choose photo from your camera roll".
   * Lets the Seller Presentation Step 1 surface a context-aware
   * headline ("Add a photo of {address}") without forking the
   * component or touching its Vercel-Blob upload pipeline. Callers
   * that omit these props keep the exact prior rendering.
   */
  emptyTitle?: string;
  emptySubtext?: string;
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export function ImageUploadField({
  label,
  value,
  onChange,
  previewAspect = "aspect-[4/3]",
  helpText,
  folder,
  testIdPrefix,
  urlPlaceholder = "…or paste an image URL",
  disablePasteUrl = false,
  emptyTitle,
  emptySubtext,
}: ImageUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tid = (suffix: string) =>
    testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined;

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setUploading(true);
    try {
      const downscaled = await downscaleImage(file);
      const fd = new FormData();
      fd.append("file", downscaled, downscaled.name);
      if (folder) fd.append("folder", folder);
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const inputCls =
    "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint";

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
      </label>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        data-testid={tid("file-input")}
      />

      {value ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded border border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className={`${previewAspect} w-full object-cover`}
              data-testid={tid("preview")}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800 disabled:opacity-60"
              data-testid={tid("replace")}
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => onChange("")}
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-red-400 disabled:opacity-60"
              data-testid={tid("remove")}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-mint rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center disabled:opacity-60"
          data-testid={tid("upload")}
        >
          {uploading ? (
            "Uploading…"
          ) : emptyTitle ? (
            <span className="block">
              <span className="block text-sm text-text-primary">
                {emptyTitle}
              </span>
              {emptySubtext && (
                <span className="mt-1 block text-[11px] text-neutral-500">
                  {emptySubtext}
                </span>
              )}
            </span>
          ) : (
            "Choose photo from your camera roll"
          )}
        </button>
      )}

      {/* Paste-URL fallback — only when no image is set, and only
          when this field allows it. Hidden once a photo is uploaded
          so the raw hosted URL is never surfaced to the agent (the
          URL stays in state via `value` and is used internally; only
          the visible readout is suppressed). Agents with a Zillow /
          FMLS / Dropbox link still see this affordance before
          uploading — UNLESS `disablePasteUrl` removes it entirely
          (A7d.3: thumbnail is camera-roll-only). */}
      {!value && !disablePasteUrl && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={urlPlaceholder}
          className={`${inputCls} mt-2`}
          data-testid={tid("url")}
        />
      )}

      {error && (
        <p
          className="mt-1 text-[11px] text-red-400"
          data-testid={tid("error")}
        >
          {error}
        </p>
      )}

      {helpText && (
        <span className="mt-1 block text-[11px] text-neutral-500">
          {helpText}
        </span>
      )}
    </div>
  );
}

/**
 * Downscale + transcode to JPEG via the canvas API. Returns a new File
 * with the JPEG bytes — the route writes that as-is to Blob.
 *
 * If the source is already smaller than MAX_EDGE on both sides AND is
 * already a JPEG / PNG / WebP that the route accepts, we still
 * re-encode through canvas so we strip EXIF (privacy: phone GPS
 * coordinates in the metadata don't end up on a public buyer page).
 */
async function downscaleImage(file: File): Promise<File> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Canvas unavailable — fall through with the original file. The
    // route's 8 MiB cap is still in force as the backstop.
    return file;
  }
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;
  const nameBase = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${nameBase}.jpg`, { type: "image/jpeg" });
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = w >= h ? max / w : max / h;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}
