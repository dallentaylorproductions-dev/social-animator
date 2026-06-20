/**
 * DASHBOARD_TODAY_SEAM (Pass 3) — the Today-card seam.
 *
 * The third and final connective pass after Dashboard Home V2 (Pass 1) and
 * Onboarding First-Run V2. OFF by default; ships DARK so it can be verified
 * on preview before the prod flip.
 *
 * When OFF, the V2 Today card is byte-identical to the Pass-1 card: it knows
 * only `new` (0 pages) and `returning` (>=1 page). When ON, the card reflects
 * the full set of onboarding states an agent can now be in — `sample-only`
 * (walked the sample, made nothing yet) and `partial` (an in-progress draft,
 * never published) — so the dashboard becomes a true continuation of
 * onboarding instead of a cold "create a page".
 *
 * Read SERVER-SIDE in src/app/dashboard/page.tsx (mirroring DASHBOARD_HOME_V2)
 * and threaded down to the Today card as a prop, so the flag can be true on
 * preview and false on prod independently — no NEXT_PUBLIC inline, no
 * per-environment rebuild, and the flag-off path never derives a seam state.
 *
 * Only meaningful when DASHBOARD_HOME_V2 is also on (the Today card lives in
 * the V2 home); on the V1 dashboard this flag is inert.
 */
export function isDashboardTodaySeamEnabled(): boolean {
  return process.env.DASHBOARD_TODAY_SEAM === "true";
}

/**
 * True only in a preview or local-dev environment — NEVER in production. The
 * gate for the `?todaySeam=` QA display override (below).
 *
 * VERCEL_ENV is the discriminator because a Vercel PREVIEW build runs with
 * NODE_ENV='production' (so a bare NODE_ENV check would wrongly disable the
 * override on preview, which is exactly where Dallen verifies DARK flags):
 *   - Vercel production (VERCEL_ENV='production') -> false (hard off).
 *   - Vercel preview    (VERCEL_ENV='preview')    -> true.
 *   - Non-Vercel: dev only (NODE_ENV !== 'production'), so a self-hosted
 *     production build is still blocked.
 */
function isPreviewOrDevEnv(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return false;
  if (vercelEnv === "preview") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Whether the Today-card `?todaySeam=` QA display override may take effect.
 * Double-gated: the seam feature must be ON *and* the environment must be
 * preview/dev. So the override is inert in production both before the prod
 * flag flip (feature off) and after it (env is production). It is a pure
 * RENDER override — it forces which state the card displays and never reads
 * or writes real pages/drafts.
 */
export function isTodaySeamPreviewAllowed(): boolean {
  return isDashboardTodaySeamEnabled() && isPreviewOrDevEnv();
}
