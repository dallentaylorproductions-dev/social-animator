"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./settings-tabs.css";

/**
 * Settings tab nav (Phase E.0). Profile is the default landing
 * (production behavior unchanged); Brand is the new addition. Active tab
 * resolves from the pathname so a deep link to either route highlights
 * correctly. Renders inside src/app/settings/layout.tsx, so it sits
 * above BOTH the existing Profile page and the new Brand page.
 */
export function SettingsTabs() {
  const pathname = usePathname();
  const isBrand = pathname?.startsWith("/settings/brand") ?? false;

  return (
    <nav className="sep-settings-tabbar">
      <div
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
      </div>
    </nav>
  );
}
