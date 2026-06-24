/**
 * Seller State A · v1.7 Packet B — the VALUATION_REDESIGN_ENABLED kill switch
 * for the valuation section ("Your valuation · Being prepared for {date}").
 *
 * OFF by default. When on, the State-A valuation block renders as the v3
 * open-editorial moment: a serif low–high RANGE as the hero, a thin meter whose
 * teal band stretches in on scroll-reveal with the nearby sales plotted as
 * minimal dots at their sold prices, a tie line back to the nearby-sales brief
 * above, and ONE italic honesty line (with a teal left rule) replacing the old
 * PREPARED ESTIMATE / PENDING WALKTHROUGH pills. When off, `ValuationPrepared`
 * renders exactly as today (body copy + chips + one-line range), so every
 * flag-off publish is byte-identical.
 *
 * UNLIKE the marketing-zone redesign (Packet C, render-only), this flag also
 * gates a small piece of NEW projected DATA: a comp-derived `valuationRange`
 * computed at `toPublicPayload` time from the agent's private draft comps. It
 * MUST be computed server-side because a real invitation publish strips every
 * comp `soldPrice` from the public payload (the honesty gate) — so without this
 * field the redesigned range would have nothing to show on a live page. The
 * field carries only the anonymized low/high endpoints + normalized dot
 * positions (never a per-comp dollar figure, never the subject home's number),
 * so the honesty gate holds: a range from comps, never a fabricated firm number.
 *
 * The boolean is threaded into the public payload at projection time
 * (`toPublicPayload`) and survives the read-time clamp (`clampPublicPayload`),
 * so the pure render can branch on it on both the server publish and the client
 * preview / onboarding surfaces.
 *
 * Reads the env var lazily (per call) so a test / route can flip it without a
 * module-load race — the same shape as `isMarketingZoneRedesignEnabled`.
 */
export function isValuationRedesignEnabled(): boolean {
  return process.env.VALUATION_REDESIGN_ENABLED === "true";
}
