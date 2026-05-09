"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useBrandSettings } from "@/lib/brand";
import {
  type PresentationDraft,
  EMPTY_DRAFT,
} from "@/tools/listing-presentation/engine/types";
import {
  loadDraft,
  saveDraft,
} from "@/tools/listing-presentation/engine/draft-storage";
import { PresentationForm } from "./PresentationForm";
import { PresentationPreview } from "./PresentationPreview";

const SAVE_DEBOUNCE_MS = 1500;

export default function ListingPresentationPage() {
  const [draft, setDraft] = useState<PresentationDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { settings: brand } = useBrandSettings();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore draft from localStorage on first mount.
  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

  // Debounced auto-save. Skip until hydrated so we don't clobber an
  // existing saved draft with the EMPTY_DRAFT initial state.
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

  const flashUploadError = (message: string) => {
    setUploadError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setUploadError(null), 5000);
  };

  const brandConfigured =
    !!brand.agentName || !!brand.logoDataUrl || !!brand.brokerage;

  // Effective brand: per-presentation color overrides merged into the
  // brand profile. Same pattern as the flyer page.
  const effectiveBrand = {
    ...brand,
    primaryColor: draft.primaryColor || brand.primaryColor,
    accentColor: draft.accentColor || brand.accentColor,
    backgroundColor:
      draft.backgroundColor || brand.backgroundColor || "#ffffff",
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
            Listing Presentation One-Pager
          </h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-md">
            Polished pre-listing pitch document — track record, marketing
            strategy, comparable sales, branded automatically.
          </p>
        </header>

        <BrandBanner configured={brandConfigured} />

        {/* Mobile: sticky preview on top, scrollable form below.
            Desktop: 2-col with preview pinned in the right aside. */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-10 mt-6">
          <aside className="order-1 lg:order-2 sticky top-0 z-20 -mx-6 lg:mx-0 px-6 lg:px-0 pt-3 lg:pt-6 pb-3 lg:pb-0 bg-neutral-950 lg:bg-transparent border-b border-neutral-800/60 lg:border-0 shadow-md shadow-black/40 lg:shadow-none lg:self-start">
            <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-3">
              Live preview
            </p>
            <div className="lg:hidden">
              <ScaleToFit className="h-[28vh] w-full">
                <PresentationPreview draft={draft} brand={effectiveBrand} />
              </ScaleToFit>
            </div>
            <div className="hidden lg:block">
              <PresentationPreview draft={draft} brand={effectiveBrand} />
            </div>
            <p className="text-[10px] text-neutral-600 leading-relaxed mt-2">
              Preview is an approximation — exported PDF may differ slightly
              in layout.
            </p>
          </aside>

          <section className="order-2 lg:order-1 pb-12 lg:pb-0">
            <PresentationForm
              draft={draft}
              onChange={setDraft}
              brand={brand}
              uploadError={uploadError}
              onUploadError={flashUploadError}
            />
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
        <Link href="/settings" className="text-[#4ef2d9] hover:underline">
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
        so the presentation header and footer can be populated.{" "}
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
 * get blown up. Mirrors the pattern in src/app/listing-flyer/page.tsx.
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
          width: 380,
          transform: scale > 0 ? `scale(${scale})` : undefined,
          transformOrigin: "center",
          flexShrink: 0,
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
