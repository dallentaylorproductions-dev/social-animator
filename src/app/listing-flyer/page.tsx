"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBrandSettings } from "@/lib/brand";
import {
  type FlyerDraft,
  type FlyerPhoto,
  EMPTY_DRAFT,
  MAX_PHOTOS,
} from "@/tools/listing-flyer/engine/types";
import {
  loadDraft,
  saveDraft,
} from "@/tools/listing-flyer/engine/draft-storage";
import { makePhoto, revokePhoto } from "@/tools/listing-flyer/engine/photos";
import { FlyerForm } from "./FlyerForm";
import { FlyerPreview } from "./FlyerPreview";
import { ExportButtons } from "./ExportButtons";

const SAVE_DEBOUNCE_MS = 1500;

export default function ListingFlyerPage() {
  const [draft, setDraft] = useState<FlyerDraft>(EMPTY_DRAFT);
  const [photos, setPhotos] = useState<FlyerPhoto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { settings: brand } = useBrandSettings();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore draft from localStorage on first mount. Photos start empty —
  // they aren't persistable.
  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

  // Debounced auto-save. Skip until hydrated so we don't clobber existing
  // saved draft with the EMPTY_DRAFT initial state.
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(draft);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draft, hydrated]);

  // Revoke object URLs on unmount so the browser can free the photo blobs.
  useEffect(() => {
    return () => {
      photos.forEach(revokePhoto);
    };
    // We intentionally leave deps empty: only run on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddPhotos = (files: File[]) => {
    const slots = MAX_PHOTOS - photos.length;
    if (slots <= 0) return;
    const accepted = files.slice(0, slots).filter((f) =>
      f.type.startsWith("image/")
    );
    setPhotos((prev) => [...prev, ...accepted.map(makePhoto)]);
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) revokePhoto(target);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleMovePhoto = (id: string, direction: "up" | "down") => {
    setPhotos((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  };

  const brandConfigured =
    !!brand.agentName || !!brand.logoDataUrl || !!brand.brokerage;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto p-6 lg:p-10">
        <header className="mb-8">
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] hover:underline"
          >
            ← Studio
          </Link>
          <h1 className="text-2xl font-semibold mt-1">
            Listing Flyer Generator
          </h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-md">
            Branded property flyers from a single form. Print-ready PDF +
            animated MP4 from the same input.
          </p>
        </header>

        <BrandBanner configured={brandConfigured} />

        <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-10 mt-6">
          <section>
            <FlyerForm
              draft={draft}
              onChange={setDraft}
              photos={photos}
              onAddPhotos={handleAddPhotos}
              onRemovePhoto={handleRemovePhoto}
              onMovePhoto={handleMovePhoto}
            />
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-3">
              Live preview
            </p>
            <FlyerPreview draft={draft} photos={photos} brand={brand} />
            <p className="text-[10px] text-neutral-600 mt-3 leading-relaxed">
              Approximation of the final PDF — colors, layout, and brand
              header round-trip to the export.
            </p>
            <div className="mt-5 pt-5 border-t border-neutral-800/60">
              <ExportButtons draft={draft} photos={photos} brand={brand} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function BrandBanner({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <p className="text-[11px] text-neutral-500 leading-relaxed">
        Header and footer use your brand profile.{" "}
        <Link
          href="/settings"
          className="text-[#4ef2d9] hover:underline"
        >
          Edit
        </Link>
      </p>
    );
  }
  return (
    <div className="bg-neutral-900 border border-[#4ef2d9]/30 rounded-md px-4 py-3 text-[12px] leading-relaxed">
      <span className="text-white font-medium">Set up your brand profile</span>
      <span className="text-neutral-400">
        {" "}
        so the flyer header and footer can be populated.{" "}
      </span>
      <Link
        href="/settings"
        className="text-[#4ef2d9] hover:underline whitespace-nowrap"
      >
        Open Settings →
      </Link>
    </div>
  );
}
