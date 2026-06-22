import { test, expect } from '@playwright/test';
import {
  ACCESS_CODE_RATE_LIMIT_MAX,
  ACCESS_CODE_RATE_LIMIT_WINDOW_SECONDS,
  accessCodeRateLimitKey,
} from '../src/lib/auth-rate-limit';

/**
 * v1.6x launch-gating fix L1 — sign-in rate-limit raise (2026-06-22).
 *
 * The beta-code sign-in path (src/lib/auth.ts, Credentials `authorize`)
 * caps attempts per IP against `rate_limit_access:<ip>` in Vercel KV.
 * Multiple cohort agents on one shared office network share a single IP,
 * so the prior 10/hr cap throttled legit sign-ins. Raised to 40/hr.
 *
 * Why a pure unit assertion (not a live-counting flow): there is no KV in
 * the local/CI test env (KV_REST_API_* unset), so kv.incr rejects and the
 * limiter is skipped — the same constraint the cohort-safety-cap suite
 * documents. The threshold is the contract worth pinning, so we assert the
 * exported constant + key shape directly. The calm rate-limit COPY at the
 * form boundary is already covered by login-unified.spec.ts
 * ("code-rate-limited submit surfaces the rate-limit copy").
 */

test.describe('beta-code sign-in rate limit (L1 raise)', () => {
  test('per-IP cap is raised to the cohort-friendly 40/hr', () => {
    // The agreed L1 threshold: 40 attempts per IP per hour. Comfortably
    // covers a shared office; the 8-char shared-secret code keeps the
    // surface non-brute-forceable even at this cap.
    expect(ACCESS_CODE_RATE_LIMIT_MAX).toBe(40);
    // Guard against an accidental downgrade back to the throttling value.
    expect(ACCESS_CODE_RATE_LIMIT_MAX).toBeGreaterThan(10);
  });

  test('window stays exactly 1 hour', () => {
    expect(ACCESS_CODE_RATE_LIMIT_WINDOW_SECONDS).toBe(3600);
  });

  test('key shape is per-IP only (the shared-office failure mode)', () => {
    expect(accessCodeRateLimitKey('203.0.113.7')).toBe(
      'rate_limit_access:203.0.113.7',
    );
    // Distinct IPs get distinct budgets; same IP shares one (the cohort case).
    expect(accessCodeRateLimitKey('a')).not.toBe(accessCodeRateLimitKey('b'));
  });
});
