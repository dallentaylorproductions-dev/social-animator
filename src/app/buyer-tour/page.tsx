import { notFound } from "next/navigation";
import { isBuyerTourBriefEnabled } from "@/lib/config/buyer-tour-brief";
import { BuyerTourBuilder } from "@/tools/buyer-tour-brief/components/BuyerTourBuilder";

/**
 * Buyer Tour Brief — agent-facing builder route `/buyer-tour` (BUYER_TOUR_BRIEF).
 *
 * Flag gate FIRST: when BUYER_TOUR_BRIEF is OFF, the route 404s — byte-identical to
 * "this route does not exist", nothing surfaced. The flag is read at REQUEST time
 * (force-dynamic) so it can differ between preview and prod without a rebuild.
 *
 * When ON, the manual-input builder renders. The cost-bearing API routes
 * (/api/buyer-tour/enrich, /api/buyer-tour/publish) enforce their own auth gate, so
 * a publish requires a signed-in agent regardless of how this page is reached.
 */

export const dynamic = "force-dynamic";

export default function BuyerTourBuilderPage() {
  if (!isBuyerTourBriefEnabled()) notFound();
  return <BuyerTourBuilder />;
}
