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
 * URL: `/buyer-tour-preview?fixture=full|minimal[&v1=1][&analytics=1]`
 *
 * `v1` selects the render: default follows BUYER_TOUR_BRIEF_V1; `?v1=1` forces the V1
 * context hub and `?v1=0` forces v0 — so a designer / the e2e suite can exercise BOTH
 * arrangements in the browser regardless of the env flag (this is a fixtures-only QA
 * surface, never user data).
 *
 * `analytics=1` forces the BUYER_TOUR_ANALYTICS engagement tracker on with a fixed
 * fixture slug, so the e2e suite can assert the funnel beacons fire (and are deduped /
 * fire-and-forget) against this fixtures-only surface without flipping the env. Default
 * (no param) leaves analytics OFF, so the preview is byte-identical and fires nothing —
 * exactly like the live page with the flag off.
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
  searchParams: Promise<{ fixture?: string; v1?: string; analytics?: string }>;
}

/** A valid 8-char Crockford base32 slug (no i/l/o/u) for the fixtures-only preview. */
const PREVIEW_SLUG = "prev1234";

export default async function BuyerTourPreview({ searchParams }: PageProps) {
  const { fixture, v1, analytics } = await searchParams;
  const raw = FIXTURES[fixture ?? "full"];
  if (!raw) notFound();
  const payload = clampBuyerTourPublicPayload(raw);
  const v1On = v1 === "1" ? true : v1 === "0" ? false : isBuyerTourBriefV1Enabled();
  const analyticsOn = analytics === "1";
  return (
    <BuyerTourPage
      payload={payload}
      v1={v1On}
      analytics={analyticsOn}
      slug={analyticsOn ? PREVIEW_SLUG : undefined}
    />
  );
}
