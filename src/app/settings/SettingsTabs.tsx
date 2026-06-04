"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./settings-tabs.css";

/**
 * Settings header (Phase E.0 + fix-ups). Renders the shared settings
 * chrome — the "← Studio" breadcrumb then the Profile | Brand tab strip —
 * from settings/layout.tsx, so BOTH render identically on /settings and
 * /settings/brand (fix-up #4: the back link is no longer trapped on the
 * Profile route, and breadcrumb + strip never jump when switching tabs).
 * Order: breadcrumb → tab strip → page header.
 *
 * Profile is the default landing; the active tab resolves from the
 * pathname. Placement: the head is left-aligned WITH each route's content
 * column. Profile and Brand use different centered column widths
 * (max-w-2xl vs the Brand-kit .page at 1060px), so the wrapper picks the
 * matching width per route — the only way to sit flush with each page's
 * content left edge. The breadcrumb + tab chrome themselves are identical
 * on both routes; only the alignment-wrapper width differs.
 */
export function SettingsTabs() {
  const pathname = usePathname();
  const isBrand = pathname?.startsWith("/settings/brand") ?? false;

  return (
    <div
      className={
        "sep-settings-head " +
        (isBrand ? "sep-settings-head--brand" : "sep-settings-head--profile")
      }
    >
      <Link href="/dashboard" className="sep-settings-back">
        ← Studio
      </Link>
      <nav
        className="sep-settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        <Link
          href="/settings"
          role="tab"
          aria-selected={!isBrand}
          data-testid="settings-tab-profile"
          className={"sep-settings-tab" + (!isBrand ? " active" : "")}
        >
          Profile
        </Link>
        <Link
          href="/settings/brand"
          role="tab"
          aria-selected={isBrand}
          data-testid="settings-tab-brand"
          className={"sep-settings-tab" + (isBrand ? " active" : "")}
        >
          Brand
        </Link>
      </nav>
    </div>
  );
}
