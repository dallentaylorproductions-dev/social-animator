import { notFound } from "next/navigation";
import { BuyerTourPage } from "@/tools/buyer-tour-brief/output/BuyerTourPage";
import { clampBuyerTourPublicPayload } from "@/tools/buyer-tour-brief/output/public-payload";
import { FIXTURES } from "@/tools/buyer-tour-brief/output/__fixtures__/sample-payload";
import { isBuyerTourBriefV1Enabled } from "@/lib/config/buyer-tour-brief-v1";

/**
 * Dev preview route for the Buyer Tour Brief buyer-facing page (BUYER_TOUR_BRIEF).
 * Renders `BuyerTourPage` from a hand-populated fixture WITHOUT round-tripping
 * through a real publish + auth + KV — the same render path `/tour/[slug]` takes.
 *
 * URL: `/buyer-tour-preview?fixture=full|minimal[&v1=1]`
 *
 * `v1` selects the render: default follows BUYER_TOUR_BRIEF_V1; `?v1=1` forces the V1
 * context hub and `?v1=0` forces v0 — so a designer / the e2e suite can exercise BOTH
 * arrangements in the browser regardless of the env flag (this is a fixtures-only QA
 * surface, never user data).
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
  searchParams: Promise<{ fixture?: string; v1?: string }>;
}

export default async function BuyerTourPreview({ searchParams }: PageProps) {
  const { fixture, v1 } = await searchParams;
  const raw = FIXTURES[fixture ?? "full"];
  if (!raw) notFound();
  const payload = clampBuyerTourPublicPayload(raw);
  const v1On = v1 === "1" ? true : v1 === "0" ? false : isBuyerTourBriefV1Enabled();
  return <BuyerTourPage payload={payload} v1={v1On} />;
}
