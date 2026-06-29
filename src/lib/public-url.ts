/**
 * Canonical PRODUCTION base for public `/h/<slug>` links.
 *
 * Client- AND server-safe (no server-only imports), so the prepared-next recap
 * route, the cockpit "Copy link", and "View live page" all build the SAME link.
 *
 * We deliberately do NOT derive the base from the request origin
 * (`new URL(req.url).origin`) or `window.location.origin`: a page prepared /
 * copied while the agent is on a preview or branch deploy would then leak a
 * `*.vercel.app` URL into a seller-facing message. The link a seller receives
 * must always point at the production domain.
 *
 * Resolution order: `NEXT_PUBLIC_SITE_URL` (set in Vercel), else the pinned prod
 * domain, so a missing env var can never fall back to a preview URL.
 *
 * DEPLOY NOTE: `NEXT_PUBLIC_*` is inlined at BUILD time. Setting
 * `NEXT_PUBLIC_SITE_URL` in Vercel only takes effect on the NEXT build, so it
 * must be set before/at the build that ships this. Until then the pinned
 * fallback already yields the correct prod domain.
 */

/** Pinned production public base. Used when NEXT_PUBLIC_SITE_URL is unset. */
export const CANONICAL_PUBLIC_BASE = "https://studio.simplyeditpro.com";

/** The canonical public base, with any trailing slash(es) removed. */
export function publicBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : CANONICAL_PUBLIC_BASE;
  return base.replace(/\/+$/, "");
}

/** The canonical public URL for a published page: `<base>/h/<slug>`. */
export function publicPageUrl(slug: string): string {
  return `${publicBaseUrl()}/h/${slug}`;
}
