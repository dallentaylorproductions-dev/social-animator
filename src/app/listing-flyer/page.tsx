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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const { settings: brand, logoImg: brandLogoImg } = useBrandSettings();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (slots <= 0) {
      flashError(`Photo limit reached (${MAX_PHOTOS} max)`);
      return;
    }
    const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per photo
    const tooLarge: string[] = [];
    const wrongType: string[] = [];
    const accepted: File[] = [];

    for (const f of files.slice(0, slots)) {
      if (!f.type.startsWith("image/")) {
        wrongType.push(f.name);
      } else if (f.size > MAX_BYTES) {
        tooLarge.push(f.name);
      } else {
        accepted.push(f);
      }
    }

    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted.map(makePhoto)]);
    }

    const messages: string[] = [];
    if (wrongType.length > 0)
      messages.push(`Skipped non-image: ${wrongType.join(", ")}`);
    if (tooLarge.length > 0)
      messages.push(`Skipped >12MB: ${tooLarge.join(", ")}`);
    if (messages.length > 0) flashError(messages.join(" · "));
  };

  const flashError = (message: string) => {
    setUploadError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setUploadError(null), 5000);
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

  // Effective brand: per-flyer color overrides merged into the brand profile.
  // Empty draft colors fall through to brand colors. Downstream code (form,
  // preview, exports) just reads brand.primaryColor / brand.accentColor /
  // brand.backgroundColor. backgroundColor's tool-default is white (brand
  // profile doesn't expose a background color yet).
  const effectiveBrand = {
    ...brand,
    primaryColor: draft.primaryColor || brand.primaryColor,
    accentColor: draft.accentColor || brand.accentColor,
    backgroundColor: draft.backgroundColor || brand.backgroundColor || "#ffffff",
  };

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
              uploadError={uploadError}
              brand={brand}
            />
          </section>

          <aside className="sticky top-0 z-20 -mx-6 lg:mx-0 px-6 lg:px-0 pt-3 lg:pt-6 pb-3 lg:pb-0 bg-neutral-950 lg:bg-transparent border-b border-neutral-800/60 lg:border-0 lg:self-start">
            <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-3">
              Live preview
            </p>
            <div className="mx-auto max-w-[150px] lg:max-w-none">
              <FlyerPreview
                draft={draft}
                photos={photos}
                brand={effectiveBrand}
              />
            </div>
            <div className="hidden lg:block mt-5 pt-5 border-t border-neutral-800/60">
              <ExportButtons
                draft={draft}
                photos={photos}
                brand={effectiveBrand}
                brandLogoImg={brandLogoImg}
              />
            </div>
          </aside>

          {/* On mobile, render export buttons inline at end of form so the
              sticky preview stays compact. */}
          <section className="lg:hidden">
            <div className="pt-5 border-t border-neutral-800/60">
              <ExportButtons
                draft={draft}
                photos={photos}
                brand={effectiveBrand}
                brandLogoImg={brandLogoImg}
              />
            </div>
          </section>
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
