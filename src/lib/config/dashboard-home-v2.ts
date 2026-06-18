/**
 * DASHBOARD_HOME_V2 — the progressive "operating home" dashboard (Pass 1:
 * IA reframe + tool registry). OFF by default; ships DARK so it can be
 * verified on preview before the prod flip.
 *
 * When OFF, /dashboard renders byte-identical to the v1.47 Lane A shell
 * (welcome → hero "Up next" → three stage grids → flagship → footer).
 * When ON, the dashboard renders the four-tier registry-driven home:
 * Today card → Seller Presentation flagship (live activity) → Quick
 * Outputs row → Social Studio "Stay visible" → quiet "Coming next".
 *
 * Read SERVER-SIDE in src/app/dashboard/page.tsx (mirroring how the
 * seller-presentation page reads SELLER_PAGES_LIBRARY_ENABLED et al.) and
 * threaded down to DashboardClient as a prop, so the flag can be true on
 * preview and false on prod independently — no NEXT_PUBLIC inline, no
 * per-environment rebuild, and the flag-off path never imports a line of
 * V2 code at render time.
 *
 * This is the single read of the env var; everything downstream takes the
 * resolved boolean.
 */
export function isDashboardHomeV2Enabled(): boolean {
  return process.env.DASHBOARD_HOME_V2 === "true";
}
