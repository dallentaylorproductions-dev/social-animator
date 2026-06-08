# PWA-1 — Installable PWA foundation (handoff)

Makes Studio SEP an **installable PWA**: web app manifest, branded generated
icons, iOS/Android install metadata, and a conservative, auth-safe service
worker. Native App Store wrapper, push, and offline *editing* remain out of
scope.

## Library + why it differs from the packet

The packet named `@serwist/next` as "the Turbopack-compatible successor." That
is actually the **webpack** path and needs `--webpack` on Next 16. The
genuinely Turbopack-native package is **`@serwist/turbopack` (9.5.11)** + its
peers `serwist@9.5.11` and `esbuild` (all `devDependencies`). It does NOT
switch the bundler — `next build` / `next dev` stay on Turbopack.

Mechanism: instead of emitting `public/sw.js`, `@serwist/turbopack` serves the
worker from a **route handler** that bundles `src/app/sw.ts` with esbuild at
build time and serves it at `/serwist/sw.js` with a `Service-Worker-Allowed: /`
header. `<SerwistProvider swUrl="/serwist/sw.js">` registers it at `scope: "/"`,
so a worker served from `/serwist/` controls navigations across the whole
origin (verified in the compiled output + a live curl).

## Caching policy (per route class)

First-match-wins in `src/app/sw.ts`. Governing rule: never serve a stale
authed page, a stale published `/h/*` page, or a cached auth/API response.

| Route class | Strategy | Notes |
|---|---|---|
| `/api/*` (incl. `/api/auth/*` magic-link callback), `/login` | **NetworkOnly** | Never cached. First rule, so it wins. |
| `/_next/static/*` (content-hashed JS/CSS) | **CacheFirst** | Immutable; `static-v1`. |
| `/icons/*`, `/icon`, `/apple-icon` | **CacheFirst** | `icons-v1`. |
| Same-origin images + `/_next/image` | **StaleWhileRevalidate** | `images-v1`. Cross-origin Vercel Blob media is NOT blanket-cached — it falls to NetworkOnly. |
| Navigations (`mode: navigate`) + RSC payloads | **NetworkFirst** (3s timeout) | `pages-v1`. Online → always fresh; cache only on network failure; hard-offline → `/~offline`. |
| Everything else (incl. cross-origin Blob) | **NetworkOnly** | — |

**Precache** = the content-hashed `/_next/static/*` build manifest + `public/`
assets + `/~offline` (revision-busted per deploy via `VERCEL_GIT_COMMIT_SHA`).
**No HTML pages are precached** — every authed/published route is `ƒ Dynamic`,
so there is no static HTML for the manifest to pick up. Verified by grepping the
compiled worker: the only non-static precached URLs are `public/` files + the
offline page.

Risky SerwistProvider defaults are turned **off**: `cacheOnNavigation`
(would proactively cache authed pathnames on client nav) and `reloadOnOnline`
(would auto-reload mid-edit).

## Disabling the SW in an incident (kill-switch)

Two levers, escalating:

1. **Stop new registrations (fast, env-only).** Set
   `NEXT_PUBLIC_DISABLE_SW=1` in the Vercel project env and redeploy. The
   `<SerwistProvider disable>` flag in `src/app/layout.tsx` then renders no
   registration. (The provider is also disabled automatically whenever
   `NODE_ENV !== "production"`, so dev + the Playwright e2e run never register.)
   This stops *new* clients but does not evict a worker already installed on a
   user's device.

2. **Evict already-installed workers (self-destruct SW).** Replace the body of
   `src/app/sw.ts` with the snippet below and redeploy. Because the worker uses
   `skipWaiting` + `clientsClaim`, clients pick up the no-op on next load, it
   unregisters itself, and clears all caches:

   ```ts
   /// <reference lib="webworker" />
   declare const self: ServiceWorkerGlobalScope;
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", async () => {
     await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
     await self.registration.unregister();
     const clients = await self.clients.matchAll();
     clients.forEach((c) => "navigate" in c && (c as WindowClient).navigate(c.url));
   });
   ```

   Bumping `const V` in `src/app/sw.ts` is the softer version — it rolls every
   runtime cache name so stale entries are abandoned on activate, without
   unregistering.

## Files

New:
- `src/app/manifest.ts` — `/manifest.webmanifest` (name "Studio SEP", short
  "SEP", `start_url: /dashboard`, `display: standalone`, `theme/background
  #0a0a0a`, 192/512/512-maskable icons).
- `src/lib/pwa-icon.tsx` — shared `SepMark` (brand-dark `#0a0a0a` + mint
  `#5BF5C9`, fully opaque). Feeds every icon surface.
- `src/app/icon.tsx`, `src/app/apple-icon.tsx` (180×180, opaque) — generated
  via `next/og` `ImageResponse`.
- `src/app/icons/{192,512,maskable}/route.tsx` — manifest icon routes
  (maskable has a 12% safe-zone inset).
- `src/app/sw.ts` — the service worker + caching policy above.
- `src/app/serwist/[path]/route.ts` — bundles + serves the worker.
- `src/app/~offline/page.tsx` — offline fallback (static, public, dependency-free).
- `e2e/pwa-installable.spec.ts` — 9 tests.

Touched:
- `next.config.ts` — `withSerwist(nextConfig)` (only appends esbuild to
  `serverExternalPackages`; redirects preserved).
- `src/app/layout.tsx` — merged `manifest` + `appleWebApp`
  (`black-translucent`) into metadata, `themeColor` + `viewport-fit: cover`
  into viewport, wrapped children in `<SerwistProvider>`.
- `src/app/dashboard/sep-studio.css` — `@media (display-mode: standalone)`
  safe-area inset on `.topbar` only (the standalone start_url surface).

## Gates

- `npm run build` — clean on Turbopack, no `--webpack`. `/serwist/sw.js` +
  `sw.js.map` prerendered (SSG); manifest + icons emitted.
- `/manifest.webmanifest` 200 `application/manifest+json`, valid JSON, icons
  resolve. `/serwist/sw.js` 200 `application/javascript`, `Service-Worker-
  Allowed: /`. All five icon routes 200 real PNGs.
- e2e: `pwa-installable.spec.ts` 9/9; regression set (truthful-copy incl.
  LS-1 em-dash gate, v1 flagship byte-identity, dashboard, login-unified)
  40/40.

## Deferred / fast-follow

- **Install hint (packet 1f)** — DEFERRED. `beforeinstallprompt` affordance +
  iOS "Add to Home Screen" hint would touch the dashboard UI; left out to keep
  this PR focused on the manifest/SW/icons priority. Low-risk fast-follow.
- **Per-route safe-area polish** — only the dashboard topbar gets the
  standalone safe-area inset. Other routes navigated from the installed app are
  a fast-follow if any chrome collides with the status bar.

## Handoff fields

- Branched from `origin/main` HEAD `f100df4`; branch
  `feat/pwa-1-installable-foundation`. PR + preview URL: ___ (fill at PR).
- SW library: `@serwist/turbopack` 9.5.11 (+ `serwist` 9.5.11, `esbuild`).
- Anything that hit STOP: none. Serwist IS Next-16-Turbopack-compatible via
  `@serwist/turbopack`; the only deviation is the package name vs the packet's
  `@serwist/next` guess, resolved in-spec.
