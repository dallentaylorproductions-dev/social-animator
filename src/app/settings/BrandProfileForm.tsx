"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BrandSettings,
  loadBrandSettings,
  saveBrandSettings,
  formatPhone,
  extractPhoneDigits,
} from "@/lib/brand";

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
            className="block w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-6 text-xs text-neutral-400 hover:text-neutral-200 transition text-center"
          >
            Click to upload a logo (PNG with transparency works best)
          </button>
        )}
      </Field>

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
          {/* Storage is raw 10 digits; display is "(xxx) xxx-xxxx". Strips
           * non-digits on every change so iOS phone-keypad characters like
           * # * + never reach storage. */}
          <TextInput
            type="tel"
            value={formatPhone(s.contactPhone)}
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

      <p className="text-[11px] text-neutral-600 leading-relaxed pt-4 border-t border-neutral-900">
        Saved automatically. Stored in your browser only — never uploaded to
        any server.
      </p>
    </div>
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
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
        className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#4ef2d9]"
      />
    </div>
  );
}
