"use client";

import { useEffect } from "react";
import { reconcileAccountOwnership } from "@/lib/account-storage";

/**
 * Account-cache reconcile gate for /welcome (v1.6x brand-contamination fix).
 *
 * THE HOLE THIS CLOSES: `reconcileAccountOwnership` previously ran only on the
 * dashboard load (DashboardEntry) and on beta-code sign-in success (login form).
 * A NEW agent routes to /welcome — neither of those fires there — so a foreign
 * brand left in this browser's localStorage (e.g. a prior agent's, or the
 * device owner's own real brand) was NEVER cleared before the Agent-Layer
 * preview read it. That foreign brand then (1) RENDERED on the preview (a
 * privacy/trust breach — the new agent saw someone else's name/contact/reviews),
 * (2) PRE-FILLED the capture name field (producing the concatenated
 * "Morgan LeeDallen Taylor"), and (3) on the first edit was re-stamped to the
 * new owner by `useBrandSettings().update` and autosaved UP to the new account's
 * server record — permanent contamination.
 *
 * The fix is to run reconcile on the /welcome entry too, BEFORE anything
 * hydrates the brand. This component renders nothing and runs reconcile once on
 * mount. It is the FIRST child the /welcome server shell renders (ahead of the
 * flow), and the flow only mounts the brand-reading Agent-Layer surface after a
 * user path-click — so the foreign blob is cleared well before any brand load,
 * migration, or render. A same-account round-trip is a no-op ("match"/"adopt"),
 * so a legitimate agent's own cache is never destroyed. Mirrors the reconcile
 * call DashboardEntry already makes.
 */
export function WelcomeAccountReconcile({
  email,
}: {
  email: string | null;
}) {
  useEffect(() => {
    reconcileAccountOwnership(email);
  }, [email]);
  return null;
}
