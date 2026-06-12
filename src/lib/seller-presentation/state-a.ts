/**
 * Seller State A — the SELLER_STATE_A_ENABLED kill switch.
 *
 * OFF by default. When false, the publish projector emits no valuationStatus /
 * appointmentAt keys (byte-identical publishes), the wizard never shows the
 * State A mode toggle / appointment input, and the live preview never resolves
 * to the prepared-invitation render. A server-resolved env flag, mirrored to the
 * client through /api/entitlements/me like every other SP flag.
 *
 * Reads the env var lazily (per call) so a test / route can flip it without a
 * module-load race — the same shape as `isCompPhotosEnabled` in street-view.ts.
 */
export function isSellerStateAEnabled(): boolean {
  return process.env.SELLER_STATE_A_ENABLED === "true";
}
