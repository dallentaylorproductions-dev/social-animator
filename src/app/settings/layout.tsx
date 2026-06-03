import { SettingsTabs } from "./SettingsTabs";

/**
 * Settings layout (Phase E.0). Adds the Profile | Brand tab nav above
 * every /settings route. Production default landing is /settings
 * (Profile) — unchanged. The Brand tab (/settings/brand) is the new
 * addition. Each child page owns its own background + width; this layout
 * only contributes the shared tab strip on a neutral backdrop so the bar
 * reads consistently above both the Profile page (neutral) and the Brand
 * page (dark + mint Brand-Kit chrome).
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-950">
      <SettingsTabs />
      {children}
    </div>
  );
}
