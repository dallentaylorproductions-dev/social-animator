/// <reference lib="webworker" />
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/turbopack's route handler.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Bump this to roll every runtime cache in one move (cache names are
 * versioned, and `activate` cleans up anything not in the current set). Also
 * the first lever to pull in a caching incident — see CACHE_VERSION below and
 * the kill-switch notes in the PWA handoff.
 */
const V = "v1";

/**
 * Conservative, auth-safe caching policy. The governing rule for this app:
 * never serve a stale AUTHENTICATED page, a stale PUBLISHED `/h/*` page, or a
 * cached auth/API response. When in doubt: prefer network, cache less. Rules
 * are first-match-wins, so the NetworkOnly exclusions come first.
 */
const runtimeCaching: RuntimeCaching[] = [
  // 1. NEVER cache. All API routes (this includes the magic-link callback at
  //    /api/auth/*) and the sign-in page. Caching any of these risks serving
  //    stale entitlement/subscription state or breaking sign-in.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      (url.pathname.startsWith("/api/") ||
        url.pathname === "/login" ||
        url.pathname.startsWith("/login/")),
    handler: new NetworkOnly(),
  },

  // 2. Content-hashed build output — immutable, safe to cache aggressively.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: `static-${V}`,
      plugins: [
        new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 3. Generated PWA icons — stable across a deploy.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      (url.pathname.startsWith("/icons/") ||
        url.pathname === "/icon" ||
        url.pathname === "/apple-icon"),
    handler: new CacheFirst({
      cacheName: `icons-${V}`,
      plugins: [
        new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 4. Same-origin static images + the Next image optimizer — StaleWhile
  //    Revalidate (margin + freshness). Deliberately NOT blanket-caching
  //    cross-origin Vercel Blob user/listing media — that falls through to
  //    rule 6 (NetworkOnly).
  {
    matcher: ({ url, sameOrigin, request }) =>
      sameOrigin &&
      (request.destination === "image" ||
        url.pathname.startsWith("/_next/image")),
    handler: new StaleWhileRevalidate({
      cacheName: `images-${V}`,
      plugins: [
        new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 5. Navigations + RSC payloads — NetworkFirst with a short timeout. Online
  //    always reflects fresh data (dashboard, wizard, published /h/*); the
  //    cached copy is only served when the network genuinely fails, and a hard
  //    offline navigation falls through to the /~offline page (see fallbacks).
  {
    matcher: ({ url, request, sameOrigin }) =>
      sameOrigin &&
      !url.pathname.startsWith("/api/") &&
      (request.mode === "navigate" || request.headers.get("RSC") === "1"),
    handler: new NetworkFirst({
      cacheName: `pages-${V}`,
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },

  // 6. Everything else (incl. cross-origin Blob media): never cache.
  {
    matcher: () => true,
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Take over promptly so a fixed SW (or the kill-switch) ships without
  // waiting for every tab to close.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
