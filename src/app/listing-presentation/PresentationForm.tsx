"use client";

import { useRef } from "react";
import {
  type PresentationDraft,
  type ComparableSale,
  MAX_MARKETING_STRATEGIES,
  MAX_STRATEGY_LENGTH,
  MAX_WHY_CHOOSE_ME_LENGTH,
  MAX_AGENT_BIO_LENGTH,
  MAX_COMPARABLE_SALES,
  HEADSHOT_MAX_EDGE,
  HEADSHOT_QUALITY,
} from "@/tools/listing-presentation/engine/types";
import { type BrandSettings } from "@/lib/brand";

interface PresentationFormProps {
  draft: PresentationDraft;
  onChange: (next: PresentationDraft) => void;
  /** Brand profile (from Settings) — used as the fallback color for the
   *  per-presentation pickers and as the "Reset to brand defaults" target. */
  brand: BrandSettings;
  /** Transient error from headshot upload (file too large, wrong type, etc). */
  uploadError?: string | null;
  onUploadError?: (message: string) => void;
}

/** Rotating placeholder examples for empty marketing-strategy slots so a
 *  realtor browsing the form sees a range of valid bullet shapes rather
 *  than the same nudge five times. */
const STRATEGY_PLACEHOLDERS = [
  'e.g., "Professional photography + 4K video tour"',
  'e.g., "Featured placement on Zillow + Realtor.com"',
  'e.g., "Targeted social ads to active local buyers"',
  'e.g., "Open house weekend + private agent preview"',
  'e.g., "Email blast to my 1,200-agent network"',
];

const COMP_ADDRESS_PLACEHOLDERS = [
  "1100 Cedar Ln, Olympia",
  "543 Oakwood Dr, Olympia",
  "920 Westbrook Ave, Olympia",
];

export function PresentationForm({
  draft,
  onChange,
  brand,
  uploadError,
  onUploadError,
}: PresentationFormProps) {
  const headshotInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof PresentationDraft>(
    key: K,
    value: PresentationDraft[K]
  ) => onChange({ ...draft, [key]: value });

  // ── Marketing strategies ─────────────────────────────────────────────
  const updateStrategy = (i: number, value: string) => {
    const next = [...draft.marketingStrategies];
    next[i] = value;
    update("marketingStrategies", next);
  };
  const addStrategy = () => {
    if (draft.marketingStrategies.length >= MAX_MARKETING_STRATEGIES) return;
    update("marketingStrategies", [...draft.marketingStrategies, ""]);
  };
  const removeStrategy = (i: number) => {
    update(
      "marketingStrategies",
      draft.marketingStrategies.filter((_, idx) => idx !== i)
    );
  };

  // ── Comparable sales ────────────────────────────────────────────────
  const updateComp = (i: number, patch: Partial<ComparableSale>) => {
    const next = draft.comparableSales.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c
    );
    update("comparableSales", next);
  };
  const addComp = () => {
    if (draft.comparableSales.length >= MAX_COMPARABLE_SALES) return;
    update("comparableSales", [
      ...draft.comparableSales,
      { address: "", soldPrice: "", daysOnMarket: "", saleToListPercent: "" },
    ]);
  };
  const removeComp = (i: number) => {
    update(
      "comparableSales",
      draft.comparableSales.filter((_, idx) => idx !== i)
    );
  };

  // ── Headshot upload ─────────────────────────────────────────────────
  const handleHeadshotSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (headshotInputRef.current) headshotInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onUploadError?.("Headshot must be an image file");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      onUploadError?.("Headshot must be under 12 MB");
      return;
    }
    try {
      const dataUrl = await fileToSquareDataUrl(
        file,
        HEADSHOT_MAX_EDGE,
        HEADSHOT_QUALITY
      );
      update("agentHeadshot", dataUrl);
    } catch (err) {
      onUploadError?.(
        err instanceof Error ? err.message : "Could not process headshot"
      );
    }
  };
  const removeHeadshot = () => update("agentHeadshot", null);

  // ── Color overrides ─────────────────────────────────────────────────
  const effectivePrimary = draft.primaryColor || brand.primaryColor;
  const effectiveAccent = draft.accentColor || brand.accentColor;
  const effectiveBackground =
    draft.backgroundColor || brand.backgroundColor || "#ffffff";
  const hasColorOverride =
    !!draft.primaryColor || !!draft.accentColor || !!draft.backgroundColor;
  const resetColors = () =>
    onChange({
      ...draft,
      primaryColor: "",
      accentColor: "",
      backgroundColor: "",
    });

  return (
    <div className="space-y-8">
      {/* ── BRAND COLORS ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <SectionLabel>Brand colors (this presentation)</SectionLabel>
          {hasColorOverride && (
            <button
              type="button"
              onClick={resetColors}
              className="text-[10px] text-neutral-500 hover:text-[#4ef2d9] transition"
            >
              ↺ Reset to brand defaults
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ColorInput
            label="Primary"
            value={effectivePrimary}
            onChange={(v) => update("primaryColor", v)}
          />
          <ColorInput
            label="Accent"
            value={effectiveAccent}
            onChange={(v) => update("accentColor", v)}
          />
          <ColorInput
            label="Background"
            value={effectiveBackground}
            onChange={(v) => update("backgroundColor", v)}
          />
        </div>
        <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
          Override colors for this presentation only — your brand profile in
          Settings is unchanged.
        </p>
      </div>

      {/* ── PROPERTY ─────────────────────────────────────────────── */}
      <FormSection title="Property">
        <Field
          label="Property address"
          required
          helper="The homeowner's address being pitched."
        >
          <TextInput
            value={draft.propertyAddress}
            onChange={(v) => update("propertyAddress", v)}
            placeholder="1247 Maple Heights Dr"
          />
        </Field>
        <Field label="City, state, zip">
          <TextInput
            value={draft.propertyCity}
            onChange={(v) => update("propertyCity", v)}
            placeholder="Olympia, WA 98501"
          />
        </Field>
        <Field label="Owner name">
          <TextInput
            value={draft.ownerName}
            onChange={(v) => update("ownerName", v)}
            placeholder="John & Jane Smith"
          />
        </Field>
      </FormSection>

      {/* ── ABOUT YOU ────────────────────────────────────────────── */}
      <FormSection title="About you">
        <Field label="Headshot">
          <input
            ref={headshotInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleHeadshotSelect}
          />
          <div className="flex items-center gap-3">
            {draft.agentHeadshot ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.agentHeadshot}
                  alt="Agent headshot"
                  className="w-20 h-20 rounded-full object-cover ring-1 ring-neutral-700 flex-shrink-0"
                />
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => headshotInputRef.current?.click()}
                    className="text-xs text-[#4ef2d9] hover:underline self-start"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeHeadshot}
                    className="text-xs text-neutral-500 hover:text-red-400 self-start"
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => headshotInputRef.current?.click()}
                className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
              >
                Click to upload headshot · 1:1 crop, ~400×400 minimum
              </button>
            )}
          </div>
          {uploadError && (
            <p className="mt-2 text-[11px] text-red-400 leading-snug">
              {uploadError}
            </p>
          )}
        </Field>

        <Field
          label="Bio"
          helper={`3-4 sentences. Lead with your local expertise. Up to ${MAX_AGENT_BIO_LENGTH} characters.`}
        >
          <TextArea
            value={draft.agentBio}
            onChange={(v) => update("agentBio", v)}
            placeholder="Lifelong Olympia resident. Eight years selling Westside and Cooper Point. I take the photos, write the copy, and run the marketing myself — no handoffs."
            rows={4}
            maxLength={MAX_AGENT_BIO_LENGTH}
          />
          <CharCounter
            current={draft.agentBio.length}
            max={MAX_AGENT_BIO_LENGTH}
          />
        </Field>
      </FormSection>

      {/* ── TRACK RECORD ─────────────────────────────────────────── */}
      <FormSection title="Track record">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Homes sold this year">
            <TextInput
              value={draft.homesSold}
              onChange={(v) => update("homesSold", v)}
              placeholder="47"
            />
          </Field>
          <Field label="Avg days on market">
            <TextInput
              value={draft.averageDaysOnMarket}
              onChange={(v) => update("averageDaysOnMarket", v)}
              placeholder="12"
            />
          </Field>
          <Field label="Sale-to-list ratio">
            <TextInput
              value={draft.saleToListRatio}
              onChange={(v) => update("saleToListRatio", v)}
              placeholder="102%"
            />
          </Field>
          <Field label="Years experience">
            <TextInput
              value={draft.yearsExperience}
              onChange={(v) => update("yearsExperience", v)}
              placeholder="8 years"
            />
          </Field>
        </div>
      </FormSection>

      {/* ── MARKETING STRATEGY ───────────────────────────────────── */}
      <FormSection title="Marketing strategy">
        <Field
          label={`Strategies (${draft.marketingStrategies.length} / ${MAX_MARKETING_STRATEGIES})`}
          helper={`Up to ${MAX_MARKETING_STRATEGIES} strategies, ${MAX_STRATEGY_LENGTH} characters each.`}
        >
          <div className="space-y-2">
            {draft.marketingStrategies.map((s, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <TextInput
                    value={s}
                    onChange={(v) => updateStrategy(i, v)}
                    placeholder={
                      STRATEGY_PLACEHOLDERS[i % STRATEGY_PLACEHOLDERS.length]
                    }
                    maxLength={MAX_STRATEGY_LENGTH}
                  />
                  <button
                    type="button"
                    onClick={() => removeStrategy(i)}
                    className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                    aria-label="Remove strategy"
                  >
                    ✕
                  </button>
                </div>
                <CharCounter
                  current={s.length}
                  max={MAX_STRATEGY_LENGTH}
                />
              </div>
            ))}
            {draft.marketingStrategies.length < MAX_MARKETING_STRATEGIES && (
              <button
                type="button"
                onClick={addStrategy}
                className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
              >
                + Add strategy
              </button>
            )}
          </div>
        </Field>
      </FormSection>

      {/* ── COMPARABLE SALES ─────────────────────────────────────── */}
      <FormSection title="Comparable sales">
        <Field
          label={`Recent comps (${draft.comparableSales.length} / ${MAX_COMPARABLE_SALES})`}
        >
          <div className="space-y-3">
            {draft.comparableSales.map((c, i) => (
              <div
                key={i}
                className="bg-neutral-900 border border-neutral-800 rounded-md p-3 space-y-2"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                    Comp {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeComp(i)}
                    className="text-xs text-neutral-500 hover:text-red-400"
                    aria-label="Remove comp"
                  >
                    Remove
                  </button>
                </div>
                <TextInput
                  value={c.address}
                  onChange={(v) => updateComp(i, { address: v })}
                  placeholder={
                    COMP_ADDRESS_PLACEHOLDERS[
                      i % COMP_ADDRESS_PLACEHOLDERS.length
                    ]
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  <TextInput
                    value={c.soldPrice}
                    onChange={(v) => updateComp(i, { soldPrice: v })}
                    placeholder="$685,000"
                  />
                  <TextInput
                    value={c.daysOnMarket}
                    onChange={(v) => updateComp(i, { daysOnMarket: v })}
                    placeholder="8 DOM"
                  />
                  <TextInput
                    value={c.saleToListPercent}
                    onChange={(v) =>
                      updateComp(i, { saleToListPercent: v })
                    }
                    placeholder="104% S/L"
                  />
                </div>
              </div>
            ))}
            {draft.comparableSales.length < MAX_COMPARABLE_SALES && (
              <button
                type="button"
                onClick={addComp}
                className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
              >
                + Add comp
              </button>
            )}
          </div>
        </Field>
      </FormSection>

      {/* ── WHY CHOOSE ME ────────────────────────────────────────── */}
      <FormSection title="Why choose me">
        <Field
          label="Closing pitch"
          helper={`Up to ${MAX_WHY_CHOOSE_ME_LENGTH} characters — keep it focused.`}
        >
          <TextArea
            value={draft.whyChooseMe}
            onChange={(v) => update("whyChooseMe", v)}
            placeholder="When you hire me, you hire a marketer who happens to be a real estate agent — not the other way around. Every listing gets the full playbook."
            rows={4}
            maxLength={MAX_WHY_CHOOSE_ME_LENGTH}
          />
          <CharCounter
            current={draft.whyChooseMe.length}
            max={MAX_WHY_CHOOSE_ME_LENGTH}
          />
        </Field>
      </FormSection>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 pt-2 border-t border-neutral-900">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#4ef2d9] font-semibold">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
      {children}
    </label>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
        {required && <span className="text-[#4ef2d9] ml-1">*</span>}
      </label>
      {children}
      {helper && (
        <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9]"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9] resize-y leading-relaxed"
    />
  );
}

/**
 * Small character counter shown under an input/textarea that has a
 * maxLength cap. Stays muted until the user is within 10% of the
 * cap, at which point it shifts to the warning shade so the
 * remaining headroom is visible without being noisy at low fill.
 */
function CharCounter({ current, max }: { current: number; max: number }) {
  const remaining = max - current;
  const isNearMax = remaining <= Math.max(8, Math.round(max * 0.1));
  const color = isNearMax ? "text-amber-400" : "text-neutral-600";
  return (
    <p className={`text-[10px] ${color} mt-1 text-right font-mono`}>
      {current}/{max}
    </p>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[9px] uppercase tracking-[0.12em] text-neutral-600 mb-1.5">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <label
          className="relative block w-11 h-11 rounded border border-neutral-800 cursor-pointer overflow-hidden flex-shrink-0"
          style={{ backgroundColor: value || "#000000" }}
        >
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-base lg:text-xs font-mono focus:outline-none focus:border-[#4ef2d9]"
        />
      </div>
    </div>
  );
}

/**
 * Decode an image File, center-crop to square, downsample to maxEdge,
 * and re-encode as a compressed JPEG data URL. Used for the headshot
 * upload — fits comfortably in localStorage at 400px q=0.85
 * (~30-50KB typical).
 */
function fileToSquareDataUrl(
  file: File,
  maxEdge: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const side = Math.min(w, h);
        const sx = Math.max(0, Math.floor((w - side) / 2));
        const sy = Math.max(0, Math.floor((h - side) / 2));
        const target = Math.min(maxEdge, side);
        const canvas = document.createElement("canvas");
        canvas.width = target;
        canvas.height = target;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(blobUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`Could not load ${file.name}`));
    };
    img.src = blobUrl;
  });
}
