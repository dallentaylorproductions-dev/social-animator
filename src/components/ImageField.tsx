"use client";

import { useState, useRef } from "react";

interface ImageFieldProps {
  value: HTMLImageElement | null;
  onChange: (img: HTMLImageElement | null) => void;
}

export function ImageField({ value, onChange }: ImageFieldProps) {
  const [preview, setPreview] = useState<string | null>(value?.src ?? null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (preview) URL.revokeObjectURL(preview);
      onChange(img);
      setPreview(url);
    };
    img.onerror = () => {
      setError("Couldn't load that image.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleRemove = () => {
    onChange(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {preview ? (
        <div className="space-y-2">
          <div className="rounded-md overflow-hidden border border-neutral-800 bg-neutral-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Uploaded preview"
              className="block w-full h-32 object-cover"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-3 py-1.5 text-xs font-medium transition"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
        >
          Click or drop an image
        </button>
      )}

      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}
