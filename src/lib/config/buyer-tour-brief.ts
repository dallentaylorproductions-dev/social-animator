/**
 * BUYER_TOUR_BRIEF — the buyer-side flagship (v0). OFF by default; ships DARK
 * so it can be verified on preview before the prod flip.
 *
 * When OFF:
 *   • /buyer-tour (the agent-facing manual-input builder) 404s.
 *   • /tour/[slug] (the buyer-facing public page) 404s.
 *   • /api/buyer-tour/publish and /api/buyer-tour/enrich return feature-disabled
 *     (no auth read, no KV touch, no Google call).
 *   • Nothing is surfaced anywhere — the dashboard, nav, and registry are
 *     byte-identical to today. The flag-off path imports no Buyer Tour code at
 *     render time on any real surface.
 *
 * When ON, the builder + public page + their two API routes come online behind
 * a normal auth gate.
 *
 * NOTE: the dev/QA preview harness (/buyer-tour-preview) is intentionally NOT
 * gated by this flag — it renders only compiled-in fixtures (never user data),
 * exactly like /seller-presentation-preview, so the e2e suite and a designer can
 * exercise the renderer without flipping the env. It is not linked from any
 * surface, so the "nothing surfaced" guarantee holds.
 *
 * Read SERVER-SIDE only (mirroring isDashboardHomeV2Enabled / isPreparedNextEnabled),
 * so the flag can be true on preview and false on prod independently — no
 * NEXT_PUBLIC inline, no per-environment rebuild. This is the single read of the
 * env var; everything downstream takes the resolved boolean.
 */
export function isBuyerTourBriefEnabled(): boolean {
  return process.env.BUYER_TOUR_BRIEF === "true";
}
