import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isBuyerTourBriefEnabled } from "@/lib/config/buyer-tour-brief";
import { isBuyerTourBriefV1Enabled } from "@/lib/config/buyer-tour-brief-v1";
import { isBuyerTourBuilderV2Enabled } from "@/lib/config/buyer-tour-builder-v2";
import { isGreatSchoolsEnabled } from "@/lib/config/greatschools";
import { isBuyerTourAnalyticsEnabled } from "@/lib/config/buyer-tour-analytics";
import { BuyerTourBuilder } from "@/tools/buyer-tour-brief/components/BuyerTourBuilder";
import { BuyerTourWorkspace } from "@/tools/buyer-tour-brief/components/BuyerTourWorkspace";

/**
 * Buyer Tour Brief — agent-facing builder route `/buyer-tour` (BUYER_TOUR_BRIEF).
 *
 * Flag gate FIRST: when BUYER_TOUR_BRIEF is OFF, the route 404s — byte-identical to
 * "this route does not exist", nothing surfaced. The flag is read at REQUEST time
 * (force-dynamic) so it can differ between preview and prod without a rebuild.
 *
 * BUYER_TOUR_BUILDER_V2 then chooses the builder experience (mirroring the seller
 * `SELLER_PAGES_LIBRARY_ENABLED` landing gate):
 *
 *   • V2 OFF (today's builder, BYTE-IDENTICAL): renders the single-column
 *     `BuyerTourBuilder` with EXACTLY the same two props it has always received.
 *     No auth read, no searchParams, no workspace code path — the flag-off render is
 *     unchanged. (The middleware also early-returns for /buyer-tour when V2 is off,
 *     so the route is not auth-gated either — same as today.)
 *   • V2 ON: renders the `BuyerTourWorkspace` — live side-by-side preview, autosave/
 *     resume, the "your buyer tours" library, softened "why", and input formatters.
 *     The route is auth-gated by middleware when V2 is on, so the agent's session
 *     email is resolved here and threaded down for owner-scoped autosave. `?id=`
 *     resumes a specific local draft.
 *
 * GREATSCHOOLS_ENABLED (schoolLayerAvailable), BUYER_TOUR_ANALYTICS (analyticsAvailable),
 * and BUYER_TOUR_BRIEF_V1 (previewV1) are all read SERVER-SIDE here (same request-time
 * posture) and passed down; the client components never read the server-only flags
 * themselves. The live GreatSchools fetch stays at render on /tour/[slug], never here.
 */

export const dynamic = "force-dynamic";

export default async function BuyerTourBuilderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isBuyerTourBriefEnabled()) notFound();

  // V2 OFF — today's builder, byte-identical (same component, same inline flag props).
  if (!isBuyerTourBuilderV2Enabled()) {
    return (
      <BuyerTourBuilder
        schoolLayerAvailable={isGreatSchoolsEnabled()}
        analyticsAvailable={isBuyerTourAnalyticsEnabled()}
      />
    );
  }

  // V2 ON — the improved workspace. Auth-gated by middleware; resolve the agent's
  // email server-side for owner-scoped autosave, and `?id=` for resume/reopen.
  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;
  const sp = await searchParams;
  const idParam = sp?.id;
  const initialId =
    typeof idParam === "string" && idParam.length > 0 ? idParam : null;

  return (
    <BuyerTourWorkspace
      ownerEmail={ownerEmail}
      schoolLayerAvailable={isGreatSchoolsEnabled()}
      analyticsAvailable={isBuyerTourAnalyticsEnabled()}
      previewV1={isBuyerTourBriefV1Enabled()}
      initialId={initialId}
    />
  );
}
