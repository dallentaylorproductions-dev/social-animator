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
      <main className="bk-scope settings-shell" data-testid="settings-brand-page">
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
  const values: BrandKitFormValues = {
    background: settings.brandBackground ?? EDITORIAL_BRAND_DEFAULTS.background,
    text: settings.brandText ?? EDITORIAL_BRAND_DEFAULTS.text,
    accent: settings.brandAccent ?? EDITORIAL_BRAND_DEFAULTS.accent,
    defaultThemeId: settings.defaultThemeId ?? DEFAULT_BRAND_THEME_ID,
  };

  const handleChange = (next: BrandKitFormValues) => {
    const updated: BrandSettings = {
      ...settings,
      brandBackground: next.background,
      brandText: next.text,
      brandAccent: next.accent,
      defaultThemeId: next.defaultThemeId,
    };
    setSettings(updated);
    saveBrandSettings(updated);
  };

  return (
    <main className="bk-scope settings-shell" data-testid="settings-brand-page">
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Brand kit</h1>
          <p className="page-sub">
            Your brand colors flow into every seller page you publish. Set them
            once.
          </p>
        </div>
        <BrandKitForm
          values={values}
          onChange={handleChange}
          layout="page"
          showRepublishReminder={true}
          defaults={EDITORIAL_BRAND_DEFAULTS}
        />
      </div>
    </main>
  );
}
