import { ImageResponse } from 'next/og';
import { fetchHandout } from '@/lib/share-urls';
import { renderOpenHouseOg } from '@/tools/open-house-prep/output/og-image';

/**
 * Dynamic Open Graph image generation (OH Prep Commit 2 / Audit 1B §7).
 *
 * Renders a 1200×630 SEP-branded preview card via Next.js 16's built-in
 * `next/og` ImageResponse — no separate @vercel/og dependency. Cards
 * appear in iMessage / Slack / WhatsApp / social-app link previews when
 * an agent texts the `/h/[slug]` URL.
 *
 * For Commit 2: type-agnostic card. Commit 5 type-dispatches on
 * record.type to render the OH Prep variant with property photo +
 * address + price. Missing / revoked / expired slugs render the
 * generic SEP fallback so old preview unfurls don't 404 in chat apps.
 *
 * Cache-Control per D10: s-maxage=86400 + swr=604800 — preview cards
 * update at most daily, served from CDN otherwise. Edits to handout
 * content take up to a day to flow through to chat-app previews;
 * documented v1 limitation per Audit 1B §9.2.
 *
 * No external font registration — uses the runtime's default sans
 * stack. Geist TTF could be added once available (D5 follow-up).
 */

export const runtime = 'edge';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
};

const COLORS = {
  canvas: '#0a0a0a',
  surface: '#141414',
  mint: '#4ef2d9',
  textPrimary: '#ededed',
  textSecondary: '#a3a3a3',
} as const;

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { slug } = await params;
  const record = await fetchHandout(slug);

  if (!record) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            background: COLORS.canvas,
            color: COLORS.textPrimary,
            padding: '72px',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 56,
            fontWeight: 600,
          }}
        >
          <span style={{ color: COLORS.mint }}>Simply</span>
          <span>&nbsp;Edit Pro Studio</span>
        </div>
      ),
      { width: 1200, height: 630, headers: CACHE_HEADERS },
    );
  }

  // Commit 5 type dispatch — render the OH-specific OG card. Future
  // handout types add a new arm here; the generic fallback above keeps
  // serving null/unknown records.
  if (record.type === 'open-house-handout') {
    return new ImageResponse(renderOpenHouseOg(record), {
      width: 1200,
      height: 630,
      headers: CACHE_HEADERS,
    });
  }

  // Generic in-product card for any other published-but-not-yet-typed
  // handout. Falls through with the property address if any.
  const data = record.data as {
    propertyAddress?: string;
    propertyCity?: string;
    agentName?: string;
  };

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          background: COLORS.canvas,
          color: COLORS.textPrimary,
          padding: '72px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: COLORS.mint,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          Handout
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
            {data.propertyAddress ?? 'Handout'}
          </div>
          {data.propertyCity && (
            <div style={{ fontSize: 28, color: COLORS.textSecondary }}>
              {data.propertyCity}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: COLORS.textSecondary,
          }}
        >
          {data.agentName
            ? `Shared by ${data.agentName}`
            : 'Shared by your agent'}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: CACHE_HEADERS },
  );
}
