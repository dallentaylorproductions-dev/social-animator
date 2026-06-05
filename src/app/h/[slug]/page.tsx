import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHandout } from '@/lib/share-urls';
import { Card, StatLabel } from '@/components/ui';
import { OpenHouseHandoutPage } from '@/tools/open-house-prep/output/handout-page';
import { SellerPresentationPage } from '@/tools/seller-presentation/output/presentation-page';

/**
 * Public visitor-facing handout route (OH Prep Commit 2 / Audit 1B).
 *
 * Cache-Control per D10: no CDN caching of the HTML response so
 * edit-after-publish flows through on next view. KV reads are <10ms,
 * making no-cache acceptable at v1 traffic volumes.
 *
 * Type-dispatch on `record.type` happens here: Commit 5 will render
 * the OH Prep visitor handout when type === 'open-house-handout'.
 * Listing Landing Page (H-9) will plug in via the same switch.
 *
 * For Commit 2: any type renders a generic "being prepared" placeholder.
 * Missing / revoked / expired records render the branded 404 surface
 * via the colocated not-found.tsx.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await fetchHandout(slug);
  if (!record) {
    return { title: 'Handout not available' };
  }
  const data = record.data as { propertyAddress?: string };
  // Type-specific titles. The metadata is the only place this page
  // peeks at record.type before the body's dispatch — keeps the title
  // honest about which surface is rendering.
  const titleSuffix =
    record.type === 'seller-presentation'
      ? 'Seller Presentation'
      : 'Open House';
  const title = data.propertyAddress
    ? `${data.propertyAddress} · ${titleSuffix}`
    : titleSuffix;
  const description = 'Your agent shared this with you.';
  const ogUrl = `/api/og/${slug}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function HandoutPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const record = await fetchHandout(slug);
  if (!record) notFound();

  // F2 reachability — read-time presentation override. `?template=flagship`
  // renders the SAME stored payload through the flagship (v2) template; it is
  // a PURE presentation switch (no data / storage / serialization change), so
  // it is safe on public pages. Nothing publishes templateVersion: 2 yet, so
  // this query is how the flagship is smoked against a live slug. Any other
  // value (or its absence) renders the stored version unchanged — for every
  // already-published payload that is v1, byte-identical to today. F3 decides
  // whether to keep or remove this override when it flips the publish version.
  const { template } = await searchParams;
  const templateOverride = template === 'flagship' ? 'flagship' : undefined;

  // Type dispatch — each handout type owns its own renderer. New
  // handout types add a new arm here; the typed dispatch is the
  // place to thread the per-type privacy posture (e.g. SP renders
  // from PublicPayload, not the raw draft).
  if (record.type === 'seller-presentation') {
    return (
      <SellerPresentationPage handout={record} templateOverride={templateOverride} />
    );
  }
  if (record.type === 'open-house-handout') {
    return <OpenHouseHandoutPage handout={record} />;
  }

  // Fallback for unknown / not-yet-wired types (e.g., future
  // 'listing-landing' before its renderer ships).
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas">
      <Card className="max-w-md text-center">
        <StatLabel accent="mint">Handout</StatLabel>
        <h1 className="text-xl font-semibold mt-3 text-text-primary">
          This handout is being prepared
        </h1>
        <p className="text-sm text-text-secondary mt-3 leading-relaxed">
          Your agent shared this link with you. The full content will be
          available shortly.
        </p>
      </Card>
    </main>
  );
}
