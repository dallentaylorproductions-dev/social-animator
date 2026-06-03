"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./settings-tabs.css";

/**
 * Settings tab nav (Phase E.0 + E.0 fix-up). Profile is the default
 * landing (production behavior unchanged); Brand is the new addition.
 * Active tab resolves from the pathname so a deep link to either route
 * highlights correctly.
 *
 * Placement: the strip is left-aligned WITH each route's content column.
 * Profile and Brand use different centered column widths (max-w-2xl vs
 * the Brand-kit .page at 1060px), so the outer wrapper picks the matching
 * width per route — the only way to sit flush with each page's content
 * left edge. The pill container chrome itself is identical on both routes
 * (dark panel token, subtle line border); only the alignment wrapper
 * differs. Renders from settings/layout.tsx, above each page's content.
 */
export function SettingsTabs() {
  const pathname = usePathname();
  const isBrand = pathname?.startsWith("/settings/brand") ?? false;

  return (
    <div
      className={
        "sep-settings-tabbar " +
        (isBrand
          ? "sep-settings-tabbar--brand"
          : "sep-settings-tabbar--profile")
      }
    >
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
