/**
 * Sign-in (beta-code) rate-limit constants.
 *
 * Extracted into a side-effect-free module so the threshold can be
 * asserted in a Playwright spec without importing src/lib/auth.ts (which
 * constructs an Upstash Redis client at module load). Mirrors the
 * usage-caps.ts convention used by the cohort safety-cap suite.
 *
 * Keying is purely per-IP against `rate_limit_access:<ip>` in Vercel KV.
 * The cap protects the beta-code Credentials path from brute-forcing the
 * shared DEV_ACCESS_CODE. Because that code is an 8-char shared secret
 * (not meaningfully brute-forceable at any realistic cap), the budget is
 * set generously so a whole cohort behind ONE shared office IP can all
 * sign in within the window — the prior 10/hr was throttling legit agents
 * who share a NAT'd IP.
 *
 * v1.6x launch-gating fix L1 (2026-06-22): raised 10 → 40 per IP per hour.
 *
 * The magic-link / Resend (email-send) path is intentionally NOT governed
 * here — it has no app-level limiter today, and email-bomb protection is a
 * separate (open) concern that this isolated change does not touch.
 */

/** Max beta-code sign-in attempts allowed per IP per window. */
export const ACCESS_CODE_RATE_LIMIT_MAX = 40;

/** Rate-limit window in seconds (1 hour). */
export const ACCESS_CODE_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/** KV key shape for the per-IP sign-in budget. */
export function accessCodeRateLimitKey(ip: string): string {
  return `rate_limit_access:${ip}`;
}
