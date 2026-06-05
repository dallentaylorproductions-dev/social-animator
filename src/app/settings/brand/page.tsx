"use client";

import { useEffect, useState } from "react";
import {
  type BrandSettings,
  loadBrandSettings,
  saveBrandSettings,
  EDITORIAL_BRAND_DEFAULTS,
  DEFAULT_BRAND_THEME_ID,
} from "@/lib/brand";
import {
  BrandKitForm,
  type BrandKitFormValues,
} from "@/tools/seller-presentation/components/BrandKitForm";
import "@/tools/seller-presentation/components/brand-kit.css";

/**
 * /settings/brand — the Brand Kit home (Phase E.0).
 *
 * Mounts <BrandKitForm layout="page" showRepublishReminder> with the
 * production Editorial palette pre-populated. First-load framing is
 * "customize what you already have": the pickers show the production
 * values the agent is already publishing in, the preview renders in
 * those colors, and the Default-layout dropdown is pre-selected to
 * Editorial.
 *
 * Cohort safety: brand colors are read from localStorage via
 * loadBrandSettings(); unset fields fall back to EDITORIAL_BRAND_DEFAULTS
 * for the picker UI ONLY. BrandSettings is NOT written on mount — only an
 * explicit change persists. So an agent who opens this page and changes
 * nothing leaves storage untouched, and their published pages stay
 * byte-identical to today.
 */
export default function BrandSettingsPage() {
  const [settings, setSettings] = useState<BrandSettings | null>(null);

  useEffect(() => {
    setSettings(loadBrandSettings());
  }, []);

  if (!settings) {
    return (
      <main className="bk-scope" data-testid="settings-brand-page">
        <div className="page">
          <div style={{ color: "#a6a39d", padding: "48px 0", fontSize: 14 }}>
            Loading…
          </div>
        </div>
      </main>
    );
  }

  // Pre-populate the picker UI from the production defaults when a brand
  // color is unset (display only — not persisted until the agent acts).
  // `secondary` has NO default: unset ("") is a first-class state, shown as
  // the hatched empty swatch.
  const values: BrandKitFormValues = {
    background: settings.brandBackground ?? EDITORIAL_BRAND_DEFAULTS.background,
    text: settings.brandText ?? EDITORIAL_BRAND_DEFAULTS.text,
    accent: settings.brandAccent ?? EDITORIAL_BRAND_DEFAULTS.accent,
    secondary: settings.brandSecondary ?? "",
    defaultThemeId: settings.defaultThemeId ?? DEFAULT_BRAND_THEME_ID,
  };

  const handleChange = (next: BrandKitFormValues) => {
    const updated: BrandSettings = {
      ...settings,
      brandBackground: next.background,
      brandText: next.text,
      brandAccent: next.accent,
      // Persist secondary as ABSENT when unset (never the empty string) —
      // the E.0 optional-field contract. JSON.stringify drops `undefined`.
      brandSecondary: next.secondary ? next.secondary : undefined,
      defaultThemeId: next.defaultThemeId,
    };
    setSettings(updated);
    saveBrandSettings(updated);
  };

  return (
    <main className="bk-scope" data-testid="settings-brand-page">
      {/* fix-up #2: transparent main (the continuous glow surface lives on
          settings/layout.tsx). fix-up #4: top padding matched to the
          Profile route's reference gap via .sep-brand-head-gap so the page
          header sits at the same Y on both routes (no jump on tab switch). */}
      <div className="page sep-brand-head-gap">
        <div className="page-head" style={{ marginTop: 0 }}>
          <h1 className="page-title">Brand kit</h1>
          <p className="page-sub">
            Set one signature color. We derive the rest and check your pages stay
            readable.
          </p>
        </div>
        <BrandKitForm
          values={values}
          onChange={handleChange}
          defaults={EDITORIAL_BRAND_DEFAULTS}
          logoDataUrl={settings.logoDataUrl}
          agentName={settings.agentName}
        />
      </div>
    </main>
  );
}
