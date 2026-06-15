"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Client-side delivery of the server-only SERVER_BRAND_SETTINGS_ENABLED flag.
 *
 * The draft store reads its flag server-side and threads it down as a prop from
 * a SINGLE server-component entry (the seller-presentation page). `useBrandSettings`
 * has no such single entry — it is consumed across ~11 components on many routes
 * — so the flag is delivered through a thin context instead: the ROOT layout (a
 * server component) reads `process.env.SERVER_BRAND_SETTINGS_ENABLED` and wraps
 * the app in this provider with the resolved boolean. No `auth()` runs in the
 * layout (only this constant boolean is read), so public/static pages are not
 * deopted to dynamic, and the flag stays server-only (no NEXT_PUBLIC).
 *
 * Default is `false`, so any consumer rendered outside the provider (or before
 * the flag flips) behaves exactly as today: pure localStorage, byte-identical.
 */

const Ctx = createContext<boolean>(false);

/** Is server-backed brand-settings persistence enabled for this request? */
export function useServerBrandSettingsEnabled(): boolean {
  return useContext(Ctx);
}

export function BrandSettingsFlagProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <Ctx.Provider value={enabled}>{children}</Ctx.Provider>;
}
