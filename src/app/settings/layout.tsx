import { SettingsTabs } from "./SettingsTabs";

/**
 * Settings layout (Phase E.0 + fix-up #2). Adds the Profile | Brand tab
 * nav above every /settings route. Production default landing is
 * /settings (Profile) — unchanged.
 *
 * The wrapper carries the shared settings surface (`sep-settings-shell`:
 * neutral-950 base + mint glow) so the tab strip + page content sit on
 * ONE continuous canvas — the strip no longer floats in a separate
 * black band, and there's no seam where a glow would begin. The Brand
 * page renders transparent on top of this surface; the byte-identical
 * Profile page keeps its own opaque `bg-neutral-950` main, which meets
 * the surface base seamlessly (same color).
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sep-settings-shell">
      <SettingsTabs />
      {children}
    </div>
  );
}
