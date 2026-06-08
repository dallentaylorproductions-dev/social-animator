"use client";

import { useRef, useState } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { uploadImageFile } from "@/lib/imageUpload";
import { HeadshotCropEditor, type HeadshotCropValue } from "./HeadshotCropEditor";

/**
 * UX-2b-followup — the Settings headshot field.
 *
 * Two states, one goal (WYSIWYG + a clear "it worked"):
 *
 *   • EMPTY — defers entirely to the shared <ImageUploadField> (camera-roll
 *     picker → /api/upload-image → hosted URL, plus the paste-URL fallback).
 *     Reused verbatim so the upload pipeline + its `brand-headshot-{upload,url}`
 *     contract are unchanged.
 *
 *   • FILLED — shows the headshot as the CROPPED circular avatar exactly as the
 *     focal/scale will publish (not the raw rectangle), with three actions:
 *       – Adjust  → opens the modal crop editor (the reassuring confirm flow).
 *       – Replace → re-runs the SAME upload pipeline via uploadImageFile(); a new
 *                   image starts centered (caller clears focal/scale).
 *       – Remove  → clears the photo (and its focal/scale).
 *
 * The published agent-band avatar render (AgentBand `AgentAvatar`) is reused
 * untouched; this component only changes the INPUT surface in Settings. Apply
 * persists the crop and closes; the avatar here visibly updates → confirmation.
 */
export function HeadshotField({
  photoUrl,
  focalX,
  focalY,
  scale,
  monogramName,
  onPhotoChange,
  onCropChange,
}: {
  /** Hosted URL, or undefined when no headshot is set. */
  photoUrl?: string;
  focalX: number;
  focalY: number;
  scale: number;
  /** Name used to derive the monogram fallback (no photo). */
  monogramName: string;
  /** Photo replaced/removed. null = removed. Caller resets focal/scale. */
  onPhotoChange: (url: string | null) => void;
  /** Crop applied from the editor. */
  onCropChange: (next: HeadshotCropValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const adjustRef = useRef<HTMLButtonElement>(null);

  // EMPTY → the shared uploader (unchanged pipeline + paste-URL fallback).
  if (!photoUrl) {
    return (
      <ImageUploadField
        label="Headshot"
        value=""
        onChange={(url) => onPhotoChange(url || null)}
        previewAspect="aspect-square"
        folder="agent-headshots"
        testIdPrefix="brand-headshot"
        helpText="Square crops read best. Leave blank for a monogram fallback."
        urlPlaceholder="https://… (or paste a URL)"
      />
    );
  }

  const monogram = monogramName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const bg = `url("${photoUrl.replace(/"/g, '\\"')}")`;

  const handleReplace = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImageFile(file, "agent-headshots");
      onPhotoChange(url); // caller resets focal/scale for the new image
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        Headshot
      </label>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="brand-headshot-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleReplace(file);
        }}
      />

      <div className="flex items-center gap-4">
        {/* The cropped circular avatar — applies the saved focal/scale, so this
            is what publishes (the editor IS the preview). */}
        <div
          data-testid="brand-headshot-avatar"
          className="relative h-20 w-20 flex-none overflow-hidden rounded-full border border-neutral-700 bg-neutral-900"
        >
          <div
            data-testid="brand-headshot-avatar-img"
            className="absolute inset-0 bg-no-repeat"
            style={{
              backgroundImage: bg,
              backgroundSize: "cover",
              backgroundPosition: `${focalX}% ${focalY}%`,
              transform: scale > 1 ? `scale(${scale})` : undefined,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
        </div>

        <div className="flex flex-col items-start gap-2">
          <button
            ref={adjustRef}
            type="button"
            onClick={() => setEditing(true)}
            data-testid="brand-headshot-adjust"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            Adjust
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              data-testid="brand-headshot-replace"
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => onPhotoChange(null)}
              data-testid="brand-headshot-remove"
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-red-400 disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p
          className="mt-2 text-[11px] text-red-400"
          data-testid="brand-headshot-error"
        >
          {error}
        </p>
      )}

      <span className="mt-2 block text-[11px] text-neutral-500">
        This is exactly how your headshot appears on your seller page.{" "}
        <span className="text-neutral-600">
          Monogram fallback ({monogram}) shows if you remove it.
        </span>
      </span>

      {editing && (
        <HeadshotCropEditor
          photoUrl={photoUrl}
          focalX={focalX}
          focalY={focalY}
          scale={scale}
          onApply={(next) => {
            onCropChange(next);
            setEditing(false);
            adjustRef.current?.focus();
          }}
          onCancel={() => {
            setEditing(false);
            adjustRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
