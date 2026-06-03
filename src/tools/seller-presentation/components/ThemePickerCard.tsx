"use client";

import { useSPEntitlement } from "./SPEntitlementContext";
import {
  PRESENTATION_THEMES,
  DEFAULT_THEME_ID,
  type PresentationTheme,
} from "../content/themes";

/**
 * Phase E / E.1 — Seller Presentation theme picker.
 *
 * Mounts at the top of Step 6 (Review) as the last cosmetic choice
 * before publish. Renders 3 tiles: Editorial (the live default + only
 * built template, matching the production /h/<slug> look) plus Studio
 * and Warm, which are "coming soon" — not built yet.
 *
 * Availability is by EXISTENCE, not by billing tier: a theme with
 * tier:"soon" shows a neutral "Coming soon" badge regardless of the
 * agent's tier (it's a roadmap signal, not an upsell — the truthful-copy
 * rule governs; "Pro/unlock" would overpromise). The tier:"pro" path
 * (no theme uses it yet) is kept wired for v1.48: a Pro theme locks on
 * themeAccessState, and the gold .is-pro badge + suppressUpgradeUi
 * cohort-hide logic re-activate then.
 *
 * Preview-but-lock (Substrate §8.6): coming-soon tiles are still
 * clickable — clicking persists the themeId to the draft so the agent
 * can scrub the idea — but resolveActiveTheme falls the renderer back to
 * Editorial. Themes do NOT yet differentiate the public /h/<slug> page
 * (per-theme rendering + the live MiniPage preview land in v1.48 / E.2);
 * this surface is wizard-side cosmetics for now.
 */

interface ThemePickerCardProps {
  themeId: string | undefined;
  onChange: (next: string) => void;
}

export function ThemePickerCard({ themeId, onChange }: ThemePickerCardProps) {
  const { themeAccessState, suppressUpgradeUi } = useSPEntitlement();
  const activeId = themeId || DEFAULT_THEME_ID;

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
          const isComingSoon = theme.tier === "soon";
          // Forward-compat for v1.48: when a theme is "pro", lock it on
          // the agent's themeAccess gate (no theme uses this today).
          const proLocked =
            theme.tier === "pro" &&
            themeAccessState !== null &&
            themeAccessState !== "available";
          const isLocked = isComingSoon || proLocked;
          const isActive = activeId === theme.id;
          return (
            <ThemeTile
              key={theme.id}
              theme={theme}
              isActive={isActive}
              isLocked={isLocked}
              isComingSoon={isComingSoon}
              hideProBadge={proLocked && suppressUpgradeUi}
              onClick={() => onChange(theme.id)}
            />
          );
        })}
      </div>
      <p className="theme-picker-foot" data-testid="theme-picker-foot">
        Editorial is live. Studio and Warm are coming soon.
      </p>
    </section>
  );
}

function ThemeTile({
  theme,
  isActive,
  isLocked,
  isComingSoon,
  hideProBadge,
  onClick,
}: {
  theme: PresentationTheme;
  isActive: boolean;
  isLocked: boolean;
  isComingSoon: boolean;
  hideProBadge: boolean;
  onClick: () => void;
}) {
  // Coming-soon badges always show (roadmap signal for every tier). Pro
  // badges respect suppressUpgradeUi (cohort path) — the future v1.48 case.
  const showBadge = isLocked && (isComingSoon || !hideProBadge);
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
      {showBadge && (
        <span
          className={`theme-tile-badge ${isComingSoon ? "is-soon" : "is-pro"}`}
          data-testid={`theme-tile-badge-${theme.id}`}
          data-tier={isComingSoon ? "soon" : "pro"}
        >
          {isComingSoon ? <ClockIcon /> : <LockIcon />}
          {isComingSoon ? "Coming soon" : "Pro"}
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

function ClockIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}
