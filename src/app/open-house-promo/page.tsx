"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBrandSettings } from "@/lib/brand";
import {
  type PromoDraft,
  EMPTY_DRAFT,
} from "@/tools/open-house-promo/engine/types";
import {
  loadDraft,
  saveDraft,
} from "@/tools/open-house-promo/engine/draft-storage";
import { PromoForm } from "./PromoForm";

const SAVE_DEBOUNCE_MS = 1500;

export default function OpenHousePromoPage() {
  const [draft, setDraft] = useState<PromoDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { settings: brand } = useBrandSettings();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

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
            Open House Promo Generator
          </h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-md">
            Complete promo bundle for any open house — vertical reel, square
            post, printable flyer, and QR code from a single form.
          </p>
        </header>

        <BrandBanner configured={brandConfigured} />

        <div className="mt-6">
          <PromoForm
            draft={draft}
            onChange={setDraft}
            brand={brand}
            uploadError={uploadError}
            onUploadError={flashUploadError}
          />
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
        so the promo header and footer can be populated.{" "}
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
