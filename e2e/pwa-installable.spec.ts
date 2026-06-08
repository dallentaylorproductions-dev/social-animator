import { test, expect } from '@playwright/test';

/**
 * PWA-1 — installable PWA foundation.
 *
 * HTTP-contract coverage (no browser needed — uses the `request` fixture):
 *   - /manifest.webmanifest serves valid JSON with the right name/colors/icons
 *   - the generated icon routes resolve as real PNGs (192/512/maskable + the
 *     Apple touch icon + the favicon)
 *   - /serwist/sw.js serves the worker with `Service-Worker-Allowed: /` so it
 *     can claim scope "/"
 *   - the worker's caching policy NEVER caches /api or /login, precaches the
 *     offline page, and treats navigations as NetworkFirst
 *   - /~offline is a real, reachable fallback page
 *
 * Note: the SerwistProvider is disabled outside production (NODE_ENV check in
 * the root layout), so the worker does NOT register during the dev-server
 * e2e run — these tests assert the *artifacts the install relies on*, which
 * are served identically in dev and prod.
 */

test.describe('PWA install artifacts', () => {
  test('manifest serves valid JSON with brand identity + icons', async ({
    request,
  }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('manifest+json');

    const m = await res.json();
    expect(m.name).toBe('Studio SEP');
    expect(m.short_name).toBe('SEP');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/dashboard');
    expect(m.scope).toBe('/');
    // Brand-dark canvas (verified token), not an invented value.
    expect(m.theme_color).toBe('#0a0a0a');
    expect(m.background_color).toBe('#0a0a0a');

    // 192, 512, and a 512 maskable.
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes).sort();
    expect(sizes).toEqual(['192x192', '512x512', '512x512']);
    expect(
      m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable'),
    ).toBe(true);
  });

  for (const path of ['/icons/192', '/icons/512', '/icons/maskable', '/apple-icon', '/icon']) {
    test(`icon ${path} resolves as a real PNG`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
      const body = await res.body();
      // PNG magic bytes + non-trivial size (Satori actually rendered).
      expect(body.length).toBeGreaterThan(1000);
      expect(body.subarray(0, 4).toString('hex')).toBe('89504e47');
    });
  }

  test('service worker is served with root scope allowed', async ({
    request,
  }) => {
    const res = await request.get('/serwist/sw.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
    // Without this header a worker served from /serwist/ could only control
    // /serwist/* — it would never see navigations. This is the linchpin.
    expect(res.headers()['service-worker-allowed']).toBe('/');
  });

  test('worker caching policy excludes /api + /login and precaches offline', async ({
    request,
  }) => {
    const body = await (await request.get('/serwist/sw.js')).text();
    // The exclusion matchers must be compiled into the worker (minified, but
    // the route-string literals survive). If these ever disappear, the SW
    // could start caching auth/entitlement responses or the sign-in page.
    expect(body).toContain('/api/');
    expect(body).toContain('/login');
    // Navigations are NetworkFirst (short timeout) and the offline page is
    // precached for the truly-offline fallback.
    expect(body).toContain('networkTimeoutSeconds');
    expect(body).toContain('/~offline');
  });

  test('offline fallback page is reachable', async ({ request }) => {
    const res = await request.get('/~offline');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('offline');
  });
});
