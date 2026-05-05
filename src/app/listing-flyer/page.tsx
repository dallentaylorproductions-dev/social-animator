"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { getFFmpeg } from "@/engine/export";
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

  // Pre-warm ffmpeg.wasm on page mount so the first MP4 export doesn't
  // have to wait for the ~10MB core to load + initialize. The first export
  // before this preload landed was hitting an FS error: ffmpeg's virtual
  // filesystem wasn't ready when writeFile() was called. Same pattern the
  // Social Animator TemplateEditor uses (silent catch — the real export
  // path retries via the same getFFmpeg() singleton).
  useEffect(() => {
    getFFmpeg().catch(() => {
      // Silent — actual export will retry if this fails
    });
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

        {/* Mobile portrait flow (top to bottom):
              [order-1] sticky preview, top-pinned, ~30vh
              [order-2] scrollable form, bottom-padded so last field clears the export bar
              [order-3] sticky export action bar, bottom-pinned
            Desktop (lg:): 2-col grid; preview+exports in the right aside,
            form fills the left column. Mobile-only export bar is lg:hidden. */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-10 mt-6">
          <aside className="order-1 lg:order-2 sticky top-0 z-20 -mx-6 lg:mx-0 px-6 lg:px-0 pt-3 lg:pt-6 pb-3 lg:pb-0 bg-neutral-950 lg:bg-transparent border-b border-neutral-800/60 lg:border-0 shadow-md shadow-black/40 lg:shadow-none lg:self-start">
            <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-3">
              Live preview
            </p>
            {/* Mobile: ScaleToFit measures the FlyerPreview's natural rendered
                size and scales it down to fit a fixed 28vh pane, centered.
                Desktop: render natively inside the aside column. */}
            <div className="lg:hidden">
              <ScaleToFit className="h-[28vh] w-full">
                <FlyerPreview
                  draft={draft}
                  photos={photos}
                  brand={effectiveBrand}
                />
              </ScaleToFit>
            </div>
            <div className="hidden lg:block">
              <FlyerPreview
                draft={draft}
                photos={photos}
                brand={effectiveBrand}
              />
            </div>
            <p className="text-[10px] text-neutral-600 leading-relaxed mt-2">
              Preview is an approximation — exported PDF may differ slightly
              in layout.
            </p>
            <div className="hidden lg:block mt-5 pt-5 border-t border-neutral-800/60">
              <ExportButtons
                draft={draft}
                photos={photos}
                brand={effectiveBrand}
                brandLogoImg={brandLogoImg}
              />
            </div>
          </aside>

          <section className="order-2 lg:order-1 pb-32 lg:pb-0">
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

          <div className="order-3 sticky bottom-0 z-20 -mx-6 px-6 py-3 bg-neutral-950 border-t border-neutral-800/60 shadow-[0_-4px_12px_rgba(0,0,0,0.4)] lg:hidden">
            <ExportButtons
              draft={draft}
              photos={photos}
              brand={effectiveBrand}
              brandLogoImg={brandLogoImg}
            />
          </div>
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

/**
 * Centers a fixed-natural-size child and scales it (uniform, preserves aspect
 * ratio) to fit the wrapper's box. Caps scale at 1 so a small child doesn't
 * get blown up. Used on the mobile sticky preview pane to show the entire
 * FlyerPreview card inside ~28vh, no clipping, no upscale.
 *
 * Implementation: ResizeObserver on both the outer wrapper and the inner
 * (untransformed) measurement; recompute scale = min(outerW/innerW,
 * outerH/innerH, 1) any time either resizes. The child renders at its
 * natural intrinsic size and is then visually scaled with CSS transform.
 */
function ScaleToFit({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const compute = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      // scrollWidth/scrollHeight measure the inner's untransformed natural
      // size — the transform on innerRef doesn't affect these.
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (iw === 0 || ih === 0 || ow === 0 || oh === 0) return;
      setScale(Math.min(ow / iw, oh / ih, 1));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className={`flex items-center justify-center overflow-hidden ${className ?? ""}`}
    >
      <div
        ref={innerRef}
        style={{
          // Explicit width so the child's maxWidth:100% resolves to a
          // meaningful number (otherwise inner sizes to content and content
          // sizes to inner — circular). 380 ≈ the desktop aside-column
          // width the preview was originally tuned for.
          width: 380,
          transform: scale > 0 ? `scale(${scale})` : undefined,
          transformOrigin: "center",
          flexShrink: 0,
          // Hide until first measurement to avoid the natural-size flash.
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
