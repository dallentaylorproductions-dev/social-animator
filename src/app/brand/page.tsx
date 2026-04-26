"use client";

import { useRef } from "react";
import { useBrandSettings } from "@/lib/brand";

export default function BrandPage() {
  const { settings, update } = useBrandSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      update({ ...settings, logoDataUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    update({ ...settings, logoDataUrl: null });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-12 lg:py-20">
        <a
          href="/"
          className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] hover:underline"
        >
          ← Social Animator
        </a>
        <h1 className="text-3xl font-bold mt-1 mb-2">Brand</h1>
        <p className="text-sm text-neutral-400 mb-10 max-w-md">
          Logo and name appear as a subtle watermark in the bottom-right of
          every template export. Set once — saved to your browser, applied
          everywhere automatically.
        </p>

        <div className="space-y-8">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-3">
              Agent or team name
            </label>
            <input
              type="text"
              value={settings.agentName}
              onChange={(e) =>
                update({ ...settings, agentName: e.target.value })
              }
              placeholder="Aaron Thomas Home Team"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-3">
              Logo
            </label>
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
            {settings.logoDataUrl ? (
              <div className="space-y-3">
                <div className="rounded-md overflow-hidden border border-neutral-800 bg-neutral-900 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.logoDataUrl}
                    alt="Brand logo"
                    className="block w-32 h-32 object-contain bg-black"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-3 py-1.5 text-xs font-medium transition"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
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
                className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-8 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
              >
                Click to upload a logo (PNG with transparency works best)
              </button>
            )}
          </div>

          <p className="text-[11px] text-neutral-600 leading-relaxed pt-4 border-t border-neutral-900">
            Saved automatically. Stored in your browser only — nothing is
            uploaded to any server.
          </p>
        </div>
      </div>
    </main>
  );
}
