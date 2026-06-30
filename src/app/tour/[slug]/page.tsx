import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchHandout } from "@/lib/share-urls";
import { isBuyerTourBriefEnabled } from "@/lib/config/buyer-tour-brief";
import { BuyerTourPage } from "@/tools/buyer-tour-brief/output/BuyerTourPage";
import {
  BUYER_TOUR_HANDOUT_TYPE,
  clampBuyerTourPublicPayload,
} from "@/tools/buyer-tour-brief/output/public-payload";

/**
 * Buyer Tour Brief — public buyer-facing route `/tour/[slug]` (BUYER_TOUR_BRIEF).
 *
 * Parallel to `/h/[slug]` (the seller public page) but its OWN route, so a tour
 * link and a seller link never share a surface. Reads the same `handout:<slug>` KV
 * record (the tour is published with `type: 'buyer-tour'`), re-clamps the stored
 * payload through `clampBuyerTourPublicPayload` (the read-time privacy boundary),
 * and renders the buyer page.
 *
 * FLAG: when BUYER_TOUR_BRIEF is OFF, the route 404s (notFound) — byte-identical to
 * "this route does not exist". No KV peek happens before the gate, so flag-off is a
 * pure no-op.
 *
 * No CDN caching of the HTML (force-dynamic + revalidate 0), so an edit-republish
 * flows through on the next view — same posture as `/h/[slug]`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  if (!isBuyerTourBriefEnabled()) return { title: "Not found" };
  const { slug } = await params;
  const record = await fetchHandout(slug);
  if (!record || record.type !== BUYER_TOUR_HANDOUT_TYPE) {
    return { title: "Tour not available" };
  }
  const data = record.data as { buyerName?: string };
  const title = data.buyerName
    ? `${data.buyerName} · Your tour`
    : "Your tour";
  const description = "Your agent planned this tour around you.";
  return {
    title,
    description,
    // Buyer Tour Brief is a 1:1 page sent to a known buyer, not a cold lander —
    // keep it out of search indexes.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
  };
}

export default async function TourPage({ params }: PageProps) {
  // Flag gate FIRST — no KV read when the feature is dark.
  if (!isBuyerTourBriefEnabled()) notFound();

  const { slug } = await params;
  const record = await fetchHandout(slug);
  if (!record || record.type !== BUYER_TOUR_HANDOUT_TYPE) notFound();

  const payload = clampBuyerTourPublicPayload(record.data);
  return <BuyerTourPage payload={payload} />;
}
