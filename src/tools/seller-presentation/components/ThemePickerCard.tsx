"use client";

import { useSPEntitlement } from "./SPEntitlementContext";
import {
  PRESENTATION_THEMES,
  DEFAULT_THEME_ID,
  type PresentationTheme,
} from "../content/themes";

/**
 * Phase E — Seller Presentation theme picker.
 *
 * Mounts at the top of Step 6 (Review) as the last cosmetic choice
 * before publish. Renders 3 tiles: Studio (live default) plus Editorial
 * and Warm, which are locked Pro tiles for Base/cohort agents per Phase 0
 * decision 7.
 *
 * Preview-but-lock (Substrate §8.6): locked tiles are still clickable —
 * clicking persists the themeId to the draft so the agent can scrub the
 * idea — but the wizard renderer falls back to Studio at render time for
 * non-Pro agents (resolveActiveTheme in ../content/themes). Themes do NOT
 * yet differentiate the public /h/<slug> page (that lands in v1.48 with
 * Pro-tier billing); this surface is wizard-side cosmetics for now.
 *
 * Locked-tile fidelity (Phase 0 decision 4): name + colorHint swatch +
 * small Lock icon + Pro badge. NO "Coming soon" copy — these themes exist;
 * the Pro badge signals the upgrade path. When suppressUpgradeUi is set
 * (cohort path, per A7f.2) the Pro badge hides but the dimmed .is-locked
 * treatment stays, so the cohort sees "this exists" without an upsell.
 */

interface ThemePickerCardProps {
  themeId: string | undefined;
  onChange: (next: string) => void;
}

export function ThemePickerCard({ themeId, onChange }: ThemePickerCardProps) {
  const { themeAccessState, suppressUpgradeUi } = useSPEntitlement();
  const activeId = themeId || DEFAULT_THEME_ID;
  const proLocked =
    themeAccessState !== null && themeAccessState !== "available";

  return (
    <section className="theme-picker" data-testid="theme-picker">
      <header className="theme-picker-head">
        <h3 className="theme-picker-title">Theme</h3>
        <p className="theme-picker-sub">
          The look your seller&rsquo;s page uses. Change anytime.
        </p>
      </header>
      <div className="theme-picker-row" role="radiogroup" aria-label="Theme">
        {PRESENTATION_THEMES.map((theme) => {
          const isLocked = theme.tier === "pro" && proLocked;
          const isActive = activeId === theme.id;
          return (
            <ThemeTile
              key={theme.id}
              theme={theme}
              isActive={isActive}
              isLocked={isLocked}
              hideProBadge={isLocked && suppressUpgradeUi}
              onClick={() => onChange(theme.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

function ThemeTile({
  theme,
  isActive,
  isLocked,
  hideProBadge,
  onClick,
}: {
  theme: PresentationTheme;
  isActive: boolean;
  isLocked: boolean;
  hideProBadge: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={isActive}
      className={`theme-tile ${isActive ? "is-active" : ""} ${isLocked ? "is-locked" : ""}`}
      data-testid={`theme-tile-${theme.id}`}
      data-locked={isLocked ? "true" : undefined}
      data-active={isActive ? "true" : undefined}
    >
      <span
        className="theme-tile-swatch"
        style={{
          backgroundColor: theme.colorHint.bg,
          color: theme.colorHint.accent,
        }}
        aria-hidden
      >
        <span className="theme-tile-glyph">
          {theme.typeHint.charAt(0).toUpperCase()}
        </span>
      </span>
      <span className="theme-tile-meta">
        <span className="theme-tile-name">{theme.name}</span>
        <span className="theme-tile-blurb">{theme.blurb}</span>
      </span>
      {isLocked && !hideProBadge && (
        <span
          className="theme-tile-badge"
          data-testid={`theme-tile-badge-${theme.id}`}
        >
          <LockIcon /> Pro
        </span>
      )}
    </button>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
