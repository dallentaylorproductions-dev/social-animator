import { notFound } from "next/navigation";
import { BuyerTourPage } from "@/tools/buyer-tour-brief/output/BuyerTourPage";
import { clampBuyerTourPublicPayload } from "@/tools/buyer-tour-brief/output/public-payload";
import { FIXTURES } from "@/tools/buyer-tour-brief/output/__fixtures__/sample-payload";

/**
 * Dev preview route for the Buyer Tour Brief buyer-facing page (BUYER_TOUR_BRIEF).
 * Renders `BuyerTourPage` from a hand-populated fixture WITHOUT round-tripping
 * through a real publish + auth + KV — the same render path `/tour/[slug]` takes.
 *
 * URL: `/buyer-tour-preview?fixture=full|minimal`
 *
 * Mirrors `/seller-presentation-preview`: NOT in the middleware matcher, and
 * intentionally NOT gated by the BUYER_TOUR_BRIEF flag — it reads only compiled-in
 * fixtures, never user data, and is not linked from any surface. Safe in production
 * as a designer/QA + e2e render surface; the "nothing surfaced when flag off"
 * guarantee holds because no real navigation reaches it.
 *
 * The fixture is routed through the SAME `clampBuyerTourPublicPayload` a real KV
 * read uses, so the preview exercises the exact read-time projection.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ fixture?: string }>;
}

export default async function BuyerTourPreview({ searchParams }: PageProps) {
  const { fixture } = await searchParams;
  const raw = FIXTURES[fixture ?? "full"];
  if (!raw) notFound();
  const payload = clampBuyerTourPublicPayload(raw);
  return <BuyerTourPage payload={payload} />;
}
