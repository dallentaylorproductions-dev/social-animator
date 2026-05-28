import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  dailyCompImportCap,
  DAILY_COMP_IMPORT_CAP_FALLBACK,
  videoUploadCap30d,
  VIDEO_UPLOAD_CAP_FALLBACK,
  VIDEO_UPLOAD_WINDOW_SECONDS,
} from '../src/lib/entitlements/usage-caps';

/**
 * v1.47 hotfix — cohort safety caps (2026-05-28).
 *
 * Two narrow server-side caps tightened before the 2026-06-01 ATHT
 * cohort goes live:
 *   1. Comp-import daily cap is now per access mode (was a flat 10/day).
 *   2. A NEW per-user rolling-30-day video upload cap bounds Blob storage
 *      runaway from a single uploader.
 *
 * Why this shape (and not a live-counting flow): there is no KV in the
 * local/CI test env (KV_REST_API_* unset), so the routes' kv.incr /
 * pipeline calls reject and BOTH caps are silently skipped (the try/catch
 * that mirrors the comp-import rate-limit). The comp-import suite has no
 * KV-mock — it asserts calm 429 copy via NODE_ENV-gated test-force
 * headers (x-comp-import-test-force-rate-limit, x-comp-import-test-disable).
 * These specs follow that same convention:
 *   - the per-mode cap VALUES are asserted as pure unit tests on the
 *     shared helpers in src/lib/entitlements/usage-caps.ts;
 *   - the 429 calm copy is asserted at the HTTP boundary via force headers
 *     (x-comp-import-test-force-daily-cap, x-e2e-force-video-cap).
 *
 * Boundary semantics: both routes compare the post-incr count with
 * `used > cap`, so at the team-invite comp cap of 50 the 50th import
 * (used=50) is allowed and the 51st (used=51) is blocked; at the video
 * cap of 30 the 30th upload is allowed and the 31st is blocked.
 */

const FIXTURE_PATH = path.resolve(
  __dirname,
  'fixtures/comp-import/nwmls-kirkland-sample.tsv',
);

test.describe('comp-import daily cap (Change 1)', () => {
  test('resolves the per-access-mode cap (team-invite 50) and falls back to 10', () => {
    expect(dailyCompImportCap('internal-test')).toBe(100);
    expect(dailyCompImportCap('team-invite')).toBe(50);
    expect(dailyCompImportCap('trial')).toBe(15);
    expect(dailyCompImportCap('paid')).toBe(25);
    // Unknown / undefined mode → conservative fallback (10).
    expect(dailyCompImportCap('something-unrecognized')).toBe(
      DAILY_COMP_IMPORT_CAP_FALLBACK,
    );
    expect(dailyCompImportCap(undefined)).toBe(10);
  });

  test('at the cap → 429 with calm daily-cap copy', async ({ request }) => {
    const bytes = await readFile(FIXTURE_PATH);
    const res = await request.post('/api/comp-import?testTier=pro', {
      headers: { 'X-Comp-Import-Test-Force-Daily-Cap': '1' },
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    expect(res.status()).toBe(429);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('daily-cap-hit');
    expect(data.message).toMatch(/import limit/i);
    // Never trapped — hand-entry fallback stays named in the copy.
    expect(data.message).toMatch(/add comps by hand|try again tomorrow/i);
  });
});

test.describe('video upload cap (Change 2)', () => {
  test('resolves the per-access-mode cap (team-invite 30), 30-day window, fallback 10', () => {
    expect(videoUploadCap30d('internal-test')).toBe(200);
    expect(videoUploadCap30d('team-invite')).toBe(30);
    expect(videoUploadCap30d('trial')).toBe(15);
    expect(videoUploadCap30d('paid')).toBe(25);
    expect(videoUploadCap30d('something-unrecognized')).toBe(
      VIDEO_UPLOAD_CAP_FALLBACK,
    );
    expect(videoUploadCap30d(undefined)).toBe(10);
    // TTL is exactly 30 days in seconds.
    expect(VIDEO_UPLOAD_WINDOW_SECONDS).toBe(2592000);
  });

  test('under cap → token issued; at the cap → 429 with the video-limit copy', async ({
    request,
  }) => {
    // Under cap (KV unavailable locally → cap skipped): the token
    // handshake still completes. Represents the "upload succeeds" path.
    const ok = await request.post('/api/upload-video', {
      headers: { 'x-e2e-bypass': '1', 'x-e2e-simulate': '1' },
      data: { type: 'blob.generate-client-token' },
    });
    expect(ok.status()).toBe(200);
    const okData = await ok.json();
    expect(okData.type).toBe('blob.generate-client-token');
    expect(okData.clientToken).toBeTruthy();

    // At the cap: the force header trips the rejection on the
    // token-generation event, BEFORE any bytes move.
    const capped = await request.post('/api/upload-video', {
      headers: { 'x-e2e-bypass': '1', 'x-e2e-force-video-cap': '1' },
      data: { type: 'blob.generate-client-token' },
    });
    expect(capped.status()).toBe(429);
    const cappedData = await capped.json();
    expect(cappedData.ok).toBe(false);
    expect(cappedData.error).toMatch(/video upload limit/i);
    expect(cappedData.error).toMatch(/reach out if you need more capacity/i);
  });
});
