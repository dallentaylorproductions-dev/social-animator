/**
 * PREPARED_NEXT (Anticipation Layer v0, Wedge 1) — the kill switch.
 *
 * OFF by default; ships DARK. With the flag off the "Worth a follow-up" cockpit
 * card is byte-identical to today's passive nudge: no "Prepare follow-up" button,
 * no review pane, no new network call, and the view beacon writes NO
 * `prepared:<slug>` record. Nothing in this layer is ever read back onto the
 * seller's page — it is agent-only, like the rest of the viewed-signal stack.
 *
 * Read SERVER-SIDE only (the env var is not NEXT_PUBLIC), mirroring
 * `isStudioProfileSetupEnabled` / `isViewedSignalNudgeEnabled`: the seller-
 * presentation page selects it from this resolved boolean and threads it down as
 * a prop, and the routes read it lazily per-call. This is the single idiom.
 */
export function isPreparedNextEnabled(): boolean {
  return process.env.PREPARED_NEXT === "true";
}
