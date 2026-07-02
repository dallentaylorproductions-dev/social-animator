import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isBuyerTourBriefEnabled } from "@/lib/config/buyer-tour-brief";
import { isBuyerTourBuilderV2Enabled } from "@/lib/config/buyer-tour-builder-v2";
import {
  fetchHandout,
  listOwnerHandoutRecords,
} from "@/lib/share-urls";
import {
  BUYER_TOUR_HANDOUT_TYPE,
  clampBuyerTourPublicPayload,
} from "@/tools/buyer-tour-brief/output/public-payload";

/**
 * GET /api/buyer-tour/tours (BUYER_TOUR_BUILDER_V2, Lever 2 — "your buyer tours").
 *
 * The owner-scoped list behind the builder's tour library. Two shapes:
 *
 *   • bare GET → the agent's PUBLISHED buyer tours as lightweight summaries
 *     ({ slug, buyerName, tourDate, homeCount, updatedAt, createdAt }). Scoped
 *     server-side via `listOwnerHandoutRecords` (reads only THIS agent's owner
 *     index and re-checks ownerEmail on each record), filtered to buyer-tour type
 *     and non-revoked. A second account can never see another's tours.
 *
 *   • `?slug=<slug>` → the single owned tour's clamped public payload, so the
 *     builder can reconstruct an editable draft (`draftFromPublicPayload`) when
 *     there is no local autosaved draft to reopen (published from another device,
 *     or after storage was cleared). Ownership + type re-checked; a foreign / wrong-
 *     type / missing slug returns 404 (never leaks existence of another's tour).
 *
 * Gated by BUYER_TOUR_BUILDER_V2 (503 when off) so the endpoint is inert until the
 * V2 builder ships, and by BUYER_TOUR_BRIEF (the tours can't exist otherwise).
 * Auth-required (401). In-progress DRAFTS are NOT here — they live in the agent's
 * localStorage (the builder merges them client-side), matching the packet's "robust
 * client persistence that survives reload."
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  if (!isBuyerTourBriefEnabled() || !isBuyerTourBuilderV2Enabled()) {
    return NextResponse.json(
      { ok: false, error: "feature-disabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();

  // Single-tour fetch → clamped payload for reopen/reconstruct.
  if (slug) {
    const record = await fetchHandout(slug);
    if (
      !record ||
      record.type !== BUYER_TOUR_HANDOUT_TYPE ||
      record.ownerEmail.toLowerCase() !== email.toLowerCase()
    ) {
      return NextResponse.json(
        { ok: false, error: "not-found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, slug, payload: clampBuyerTourPublicPayload(record.data) },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  // List → owner-scoped published buyer-tour summaries.
  const records = await listOwnerHandoutRecords(email);
  const tours = records
    .filter((r) => r.type === BUYER_TOUR_HANDOUT_TYPE && !r.revoked)
    .map((r) => {
      const data = (r.data ?? {}) as {
        buyerName?: unknown;
        tourDate?: unknown;
        homes?: unknown;
      };
      return {
        slug: r.slug,
        buyerName: typeof data.buyerName === "string" ? data.buyerName : "",
        tourDate: typeof data.tourDate === "string" ? data.tourDate : "",
        homeCount: Array.isArray(data.homes) ? data.homes.length : 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json(
    { ok: true, tours },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
