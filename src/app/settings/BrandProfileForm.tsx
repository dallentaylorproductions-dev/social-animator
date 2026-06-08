"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BrandSettings,
  loadBrandSettings,
  saveBrandSettings,
  extractPhoneDigits,
} from "@/lib/brand";
import type { Review } from "@/tools/seller-presentation/engine/types";
import { PhoneInput } from "@/components/inputs";
import { ImageUploadField } from "@/components/ImageUploadField";
import { defaultWhyUs } from "@/lib/whyus";
import { WhyUsSection, DraftFromReviews } from "./WhyUsSection";

/**
 * Soft cap on the curated reviews list. Six rows is enough to cover the
 * "From families like yours" block on every published Seller Presentation
 * without inviting agents to dump every Zillow testimonial into Settings.
 */
const MAX_REVIEWS = 6;

/**
 * Brand profile form. All values persist to localStorage on every change —
 * no save button. The Studio's stateless philosophy: user content stays in
 * the browser, never the server.
 */
export function BrandProfileForm() {
  const [s, setS] = useState<BrandSettings | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load settings client-side on mount. SSR-safe.
  useEffect(() => {
    setS(loadBrandSettings());
  }, []);

  if (!s) {
    return <div className="text-sm text-neutral-500">Loading…</div>;
  }

  const update = <K extends keyof BrandSettings>(
    key: K,
    value: BrandSettings[K]
  ) => {
    const next = { ...s, [key]: value };
    setS(next);
    saveBrandSettings(next);
  };

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => update("logoDataUrl", reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <Field label="Agent / team name">
        <TextInput
          value={s.agentName}
          onChange={(v) => update("agentName", v)}
          placeholder="Aaron Thomas Home Team"
        />
      </Field>

      <Field label="Logo">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLogoFile(file);
          }}
        />
        {s.logoDataUrl ? (
          <div className="space-y-3">
            <div className="rounded-md overflow-hidden border border-neutral-800 bg-black inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.logoDataUrl}
                alt="Brand logo"
                className="block w-32 h-32 object-contain"
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
                onClick={() => update("logoDataUrl", null)}
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
            className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-mint rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
          >
            Click to upload a logo (PNG with transparency works best)
          </button>
        )}
      </Field>

      {/* v3 smoke fix: group heading clarifies these colors are for Social
          Animator / export artifacts, NOT the seller page (Brand tab) — new
          users read the two as redundant otherwise. */}
      <h3 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        Social &amp; export colors
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Primary color">
          <ColorInput
            value={s.primaryColor}
            onChange={(v) => update("primaryColor", v)}
          />
        </Field>
        <Field label="Accent color">
          <ColorInput
            value={s.accentColor}
            onChange={(v) => update("accentColor", v)}
          />
        </Field>
      </div>
      {/* Item 4 (post-E.0): truthful color-destination label — verified
          against real consumers (Listing Flyer, Listing Presentation,
          Open House Promo, SIR PDF). These Profile colors do NOT style the
          published seller page; those colors live in the Brand tab. */}
      <p className="-mt-3 text-[11px] text-neutral-600 leading-relaxed">
        These style your Social Animator templates, flyers, and promos. Your
        seller page colors live in the Brand tab.
      </p>

      <Field label="Brokerage">
        <TextInput
          value={s.brokerage}
          onChange={(v) => update("brokerage", v)}
          placeholder="Acme Realty"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact email">
          <TextInput
            type="email"
            value={s.contactEmail}
            onChange={(v) => update("contactEmail", v)}
            placeholder="agent@example.com"
          />
        </Field>
        <Field label="Contact phone">
          {/* H-7.10: PhoneInput handles live "(xxx) xxx-xxxx" formatting
           * + caret preservation. Storage stays raw 10 digits — the
           * onChange wrapper strips back to digits before persisting
           * (PhoneInput is idempotent on already-formatted input, so
           * re-passing the raw value triggers a clean re-format). */}
          <PhoneInput
            value={s.contactPhone}
            onChange={(v) => update("contactPhone", extractPhoneDigits(v))}
            placeholder="(555) 123-4567"
          />
        </Field>
      </div>

      <Field label="License number">
        <TextInput
          value={s.licenseNumber}
          onChange={(v) => update("licenseNumber", v)}
          placeholder="OR #..."
        />
      </Field>

      {/* A7c — Seller Presentation agent-profile extensions. Set-once,
          flows through StepReview's `agentContact` to the SP page
          renderer's `agent.{areasServed, photoUrl, bioShort,
          yearsInArea, ctaReassurance}` block. All optional. */}
      <div className="space-y-6 border-t border-neutral-900 pt-6">
        <h3 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Seller Presentation: agent profile
        </h3>
        <p className="-mt-3 text-[11px] text-neutral-600 leading-relaxed">
          These appear on the published seller page&apos;s &ldquo;Your
          agent&rdquo; section. Set once; reused across every
          presentation.
        </p>

        <Field label="Areas served">
          <TextInput
            value={s.agentAreasServed ?? ""}
            onChange={(v) => update("agentAreasServed", v || undefined)}
            placeholder="Tacoma · Gig Harbor · Federal Way"
          />
        </Field>

        {/* A7c.2 — replaces the URL-only headshot input with the
            shared <ImageUploadField>, so agents can pick a photo
            from their phone's camera roll. Uploads to Vercel Blob;
            we store the hosted URL in agentPhotoUrl (no data URLs
            in the brand settings or in the published agent block). */}
        <ImageUploadField
          label="Headshot"
          value={s.agentPhotoUrl ?? ""}
          onChange={(url) => update("agentPhotoUrl", url || undefined)}
          previewAspect="aspect-square"
          folder="agent-headshots"
          testIdPrefix="brand-headshot"
          helpText="Square crops read best. Leave blank for a monogram fallback."
          urlPlaceholder="https://… (or paste a URL)"
        />

        <Field label="Short bio (one sentence, italic)">
          <TextAreaInput
            value={s.agentBioShort ?? ""}
            onChange={(v) => update("agentBioShort", v || undefined)}
            placeholder="I work with eight families a year, on purpose. It means your sale gets the time and attention I'd want for my own."
          />
        </Field>

        <Field label="Tagline">
          <TextInput
            value={s.agentTagline ?? ""}
            onChange={(v) => update("agentTagline", v || undefined)}
            placeholder="Plain-English guidance, start to close."
          />
        </Field>

        {/* B0a — "Draft from your reviews" AI helper. Operates only on the
            reviews already entered below (plus any pasted); never fetches a
            URL. Suggestions are editable and applied by the agent into the
            bio / tagline / reviews-headline fields. */}
        <DraftFromReviews
          reviews={s.agentReviews ?? []}
          onApply={(field, value) => update(field, value || undefined)}
        />

        <Field label="Years in your area">
          <TextInput
            value={s.agentYearsInArea ?? ""}
            onChange={(v) => {
              // A7c.6 — numeric field. Strip to digits so the stored
              // value is a clean numeric string (consistent with the
              // downstream text render on /h/[slug] and the JSON shape
              // on the publish payload).
              const digits = v.replace(/\D/g, "");
              update("agentYearsInArea", digits || undefined);
            }}
            placeholder="11"
            inputMode="numeric"
          />
        </Field>

        <Field label="CTA reassurance line">
          <TextInput
            value={s.agentCtaReassurance ?? ""}
            onChange={(v) => update("agentCtaReassurance", v || undefined)}
            placeholder="No pressure. Reach out whenever you're ready."
          />
          {/* Item 3 (post-E.0): truthful destination label — verified
              against presentation-page.tsx AgentCtas (renders directly
              under the "Schedule a listing call" button). */}
          <p className="mt-1.5 text-[11px] text-neutral-600 leading-relaxed">
            Appears under the &ldquo;Schedule a listing call&rdquo; button on
            your published seller page.
          </p>
        </Field>
      </div>

      {/* A7d.2 — curated reviews. Entered ONCE here; the wizard's
          editorial step no longer captures per-presentation reviews.
          Flows through the publish route's `brandReviews` payload to
          the projector, which emits them as `payload.reviews` +
          `payload.reviewsOutlink` (top-level), so every Seller
          Presentation renders the "From families like yours" block
          from this source. */}
      <ReviewsSection
        reviews={s.agentReviews ?? []}
        outlinkUrl={s.reviewsOutlinkUrl ?? ""}
        headline={s.reviewsHeadline ?? ""}
        onReviewsChange={(next) =>
          update("agentReviews", next.length ? next : undefined)
        }
        onOutlinkChange={(v) => update("reviewsOutlinkUrl", v || undefined)}
        onHeadlineChange={(v) => update("reviewsHeadline", v || undefined)}
      />

      {/* B0a — "Why us" agent-constant pitch package. Seeded from defaults
          (arrives-done) when never configured; the first edit persists the
          full object through the same localStorage path. Data-IN only —
          B0b renders this on the seller page. */}
      <WhyUsSection
        whyUs={s.whyUs ?? defaultWhyUs()}
        onChange={(next) => update("whyUs", next)}
      />

      <p className="text-[11px] text-neutral-600 leading-relaxed pt-4 border-t border-neutral-900">
        Saved automatically. Stored in your browser only. The one exception:
        when you tap &ldquo;Draft from your reviews,&rdquo; the reviews you
        send are processed to suggest a draft and returned for you to edit —
        they&apos;re not stored on our servers.
      </p>
    </div>
  );
}

function ReviewsSection({
  reviews,
  outlinkUrl,
  headline,
  onReviewsChange,
  onOutlinkChange,
  onHeadlineChange,
}: {
  reviews: Review[];
  outlinkUrl: string;
  headline: string;
  onReviewsChange: (next: Review[]) => void;
  onOutlinkChange: (next: string) => void;
  onHeadlineChange: (next: string) => void;
}) {
  const addReview = () => {
    if (reviews.length >= MAX_REVIEWS) return;
    onReviewsChange([...reviews, { body: "", attributionName: "" }]);
  };
  const updateReview = (idx: number, patch: Partial<Review>) => {
    onReviewsChange(
      reviews.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  };
  const removeReview = (idx: number) => {
    onReviewsChange(reviews.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4 border-t border-neutral-900 pt-6">
      <h3 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        Seller Presentation: reviews
      </h3>
      <p className="-mt-2 text-[11px] text-neutral-600 leading-relaxed">
        Reviews you&apos;ve collected — entered once here, shown on every
        seller page.
      </p>

      <Field label="Reviews headline">
        <TextInput
          value={headline}
          onChange={onHeadlineChange}
          placeholder="What sellers say"
        />
      </Field>

      <div className="space-y-3">
        {reviews.length === 0 && (
          <p className="text-xs text-neutral-500">
            No reviews yet. Add one to start.
          </p>
        )}
        {reviews.map((rev, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded border border-neutral-800 bg-neutral-900/40 p-3"
            data-testid={`brand-review-${idx}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Review {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeReview(idx)}
                className="text-xs text-neutral-500 hover:text-red-400"
                data-testid={`brand-review-remove-${idx}`}
              >
                Remove
              </button>
            </div>
            <textarea
              value={rev.body}
              onChange={(e) => updateReview(idx, { body: e.target.value })}
              placeholder="She walked us through every offer in plain English and never made us feel rushed."
              rows={3}
              data-testid={`brand-review-body-${idx}`}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint resize-y"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={rev.attributionName}
                onChange={(e) =>
                  updateReview(idx, { attributionName: e.target.value })
                }
                placeholder="The Halloran family"
                data-testid={`brand-review-name-${idx}`}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
              />
              <input
                type="text"
                value={rev.attributionYear ?? ""}
                onChange={(e) =>
                  updateReview(idx, {
                    attributionYear: e.target.value || undefined,
                  })
                }
                placeholder="2025"
                data-testid={`brand-review-year-${idx}`}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
              />
              <input
                type="text"
                value={rev.attributionStreet ?? ""}
                onChange={(e) =>
                  updateReview(idx, {
                    attributionStreet: e.target.value || undefined,
                  })
                }
                placeholder="Tremont"
                data-testid={`brand-review-street-${idx}`}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
              />
            </div>
          </div>
        ))}
        {reviews.length < MAX_REVIEWS && (
          <button
            type="button"
            onClick={addReview}
            data-testid="brand-review-add"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            + Add a review
          </button>
        )}
      </div>

      <Field label="See all reviews on Zillow — link URL">
        <TextInput
          value={outlinkUrl}
          onChange={onOutlinkChange}
          placeholder="https://www.zillow.com/profile/your-handle"
        />
      </Field>
    </div>
  );
}

function TextAreaInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint resize-y"
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Wrapper claims explicit 44×44pt (Apple HIG min tap target) so the
       * swatch is visible in mobile Safari portrait. Native input is layered
       * on top at opacity-0 so taps still trigger the system color picker. */}
      <label
        className="relative block w-11 h-11 rounded border border-neutral-800 cursor-pointer overflow-hidden flex-shrink-0"
        style={{ backgroundColor: value || "#000000" }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // min-w-0 prevents the input's intrinsic content size from forcing
        // the inner flex row wider than its grid cell on narrow viewports.
        className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm font-mono focus:outline-none focus:border-mint"
      />
    </div>
  );
}
