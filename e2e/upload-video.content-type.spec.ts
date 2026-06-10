import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isAllowedVideoContentType,
  VIDEO_CONTENT_TYPES,
} from '../src/lib/media-storage/video-content-types';

/**
 * A7d.13 — walk-through video upload content-type allowlist + token-route
 * diagnostics (Dallen real-iPhone bug, 2026-06-10).
 *
 * Context: iPhone Safari uploads failed with "Failed to retrieve the
 * client token" while desktop succeeded on the SAME deployment. The
 * leading hypothesis was that iOS .MOV (video/quicktime) was missing
 * from the server allowlist. It was NOT — quicktime has been accepted
 * since the v1.47 cutover, AND (decisively) the SDK does not even send
 * the content type during token generation, so the allowlist cannot
 * produce that error. This suite locks in BOTH facts:
 *
 *   1. The shared allowlist accepts iOS .MOV + mp4 + webm and rejects
 *      junk (the content-type acceptance unit test the handoff asks
 *      for).
 *   2. The token route issues a token regardless of the content type
 *      carried in clientPayload — proving the threaded content type is
 *      observe-only diagnostics, not a new gate that could itself
 *      reject an iOS upload.
 *
 * Pure-function + route-contract pattern (no browser), matching
 * e2e/entitlement-resolver.spec.ts and the existing video-upload spec.
 */

test.describe('A7d.13 — video content-type allowlist', () => {
  test('accepts iOS .MOV (video/quicktime), mp4, and webm', () => {
    // The exact iOS camera-roll case the bug was blamed on.
    expect(isAllowedVideoContentType('video/quicktime')).toBe(true);
    expect(isAllowedVideoContentType('video/mp4')).toBe(true);
    expect(isAllowedVideoContentType('video/webm')).toBe(true);
  });

  test('rejects junk, non-video, and empty/odd MIME types', () => {
    expect(isAllowedVideoContentType('application/octet-stream')).toBe(false);
    expect(isAllowedVideoContentType('image/jpeg')).toBe(false);
    expect(isAllowedVideoContentType('image/heic')).toBe(false);
    expect(isAllowedVideoContentType('video/x-msvideo')).toBe(false);
    expect(isAllowedVideoContentType('')).toBe(false);
    expect(isAllowedVideoContentType('text/plain')).toBe(false);
  });

  test('the list is exactly the three promised formats (MP4, MOV, WebM)', () => {
    // The UI promises "MP4, MOV, or WebM"; the allowlist must match the
    // promise exactly — no silent narrowing, no silent widening.
    expect([...VIDEO_CONTENT_TYPES]).toEqual([
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]);
  });

  test('client field + token route both consume the shared list (drift guard)', () => {
    // If either side ever inlines its own list again, an accepted client
    // file could PUT-fail against a token that disallows it — exactly
    // the confusing class of bug this extraction prevents.
    const fieldSrc = readFileSync(
      resolve(process.cwd(), 'src/components/VideoUploadField.tsx'),
      'utf8',
    );
    const routeSrc = readFileSync(
      resolve(process.cwd(), 'src/app/api/upload-video/route.ts'),
      'utf8',
    );
    expect(fieldSrc).toMatch(/isAllowedVideoContentType/);
    expect(fieldSrc).toMatch(
      /from\s+["']@\/lib\/media-storage\/video-content-types["']/,
    );
    expect(routeSrc).toMatch(/VIDEO_CONTENT_TYPES/);
    expect(routeSrc).toMatch(
      /from\s+["']@\/lib\/media-storage\/video-content-types["']/,
    );
  });
});

test.describe('A7d.13 — token route is content-type-agnostic at token time', () => {
  const ROUTE = '/api/upload-video';

  function tokenRequestBody(clientPayload: string | null): string {
    return JSON.stringify({
      type: 'blob.generate-client-token',
      payload: {
        pathname: 'seller-presentation-video/test.mov',
        multipart: true,
        clientPayload,
      },
    });
  }

  test('issues a token even when clientPayload carries an unusual content type', async ({
    request,
  }) => {
    // Proves the diagnostics thread is observe-only: a content type the
    // allowlist would reject does NOT block token issuance (the SDK
    // never sends it as policy; the token's allowedContentTypes + Blob's
    // PUT-time check are the single enforcement point).
    const res = await request.post(ROUTE, {
      headers: {
        'content-type': 'application/json',
        'x-e2e-bypass': '1',
        'x-e2e-simulate': '1',
      },
      data: tokenRequestBody(
        JSON.stringify({ contentType: 'video/x-weird', size: 1234 }),
      ),
    });
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { type: string; clientToken: string };
    expect(json.type).toBe('blob.generate-client-token');
    expect(typeof json.clientToken).toBe('string');
  });

  test('401 (not authenticated) surfaces a clear, actionable error body', async ({
    request,
  }) => {
    // The route can't change the SDK's generic client string, but its
    // JSON body must name the real cause for anyone reading it directly
    // (and the field's session module rewrites the SDK string to match).
    const res = await request.post(ROUTE, {
      headers: { 'content-type': 'application/json' },
      data: tokenRequestBody(null),
    });
    expect(res.status()).toBe(401);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/sign|sign(ed)? in|session/i);
  });
});
