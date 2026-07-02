import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isBuyerTourBriefEnabled } from "@/lib/config/buyer-tour-brief";
import { isBuyerTourBuilderV2Enabled } from "@/lib/config/buyer-tour-builder-v2";
import { publishHandout, updateHandout, getHandoutRecord } from "@/lib/share-urls";
import {
  clampBuyerTourDraft,
  describeMissingBuyerTourInputs,
  type BuyerTourAgent,
  type BuyerTourDraft,
} from "@/tools/buyer-tour-brief/engine/types";
import {
  BUYER_TOUR_HANDOUT_TYPE,
  toBuyerTourPublicPayload,
} from "@/tools/buyer-tour-brief/output/public-payload";

/**
 * POST /api/buyer-tour/publish (BUYER_TOUR_BRIEF).
 *
 * The privacy boundary made code, mirroring the seller publish route: the body is
 * clamped to the canonical draft, re-gated on required fields, then projected to
 * the public payload via `toBuyerTourPublicPayload` (an explicit allow-list, never
 * a spread). ONLY that public payload is handed to `publishHandout` — the raw draft
 * (agent-private notes, the commute anchor's raw address, per-chip editedByAgent
 * bookkeeping) is dropped here and never sees KV.
 *
 * Published under `type: 'buyer-tour'` into the SAME `handout:<slug>` namespace the
 * seller pages use; `/tour/[slug]` reads it back and re-clamps at read time.
 *
 * Optional `slug` → update-in-place (the seller "Update live page" pattern), so an
 * agent can edit + re-publish without minting a new buyer link.
 */

export const runtime = "nodejs";

interface PublishBody {
  draft?: Partial<BuyerTourDraft>;
  agentContact?: BuyerTourAgent;
  /** Agent-constant brand accent from Studio Profile; owns the page's tour thread. */
  brandAccent?: string;
  slug?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isBuyerTourBriefEnabled()) {
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

  let body: PublishBody;
  try {
    body = (await req.json()) as PublishBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Defense at boundary: clamp the incoming draft, then re-check the gating fields
  // with the SAME helper the builder uses, so the server can't disagree about what
  // "complete" means.
  const draft = clampBuyerTourDraft(body.draft);
  // Lever 3 (BUYER_TOUR_BUILDER_V2): when the V2 builder is on, a tour may publish
  // with addresses only — the per-home "why" is encouraged but no longer required.
  // Flag off = today's behavior (why required), so the gate stays byte-identical.
  const missing = describeMissingBuyerTourInputs(draft, {
    requireWhy: !isBuyerTourBuilderV2Enabled(),
  });
  if (missing.length > 0) {
    console.warn(
      `[buyer-tour/publish] rejected, required fields missing: ${missing.join(", ")}`,
    );
    return NextResponse.json(
      { ok: false, error: `Missing required: ${missing.join(", ")}` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const agentContact: BuyerTourAgent =
    body.agentContact && typeof body.agentContact === "object"
      ? body.agentContact
      : {};

  const brandAccent =
    typeof body.brandAccent === "string" ? body.brandAccent : undefined;

  // R-1 closed by construction: build the public-only payload and pass ONLY it on.
  // `toBuyerTourPublicPayload` validates the accent as a hex, so a tampered value
  // never reaches KV / the page's CSS.
  const publicPayload = toBuyerTourPublicPayload(draft, agentContact, brandAccent);
  const data = publicPayload as unknown as Record<string, unknown>;

  // Update-in-place when a slug is supplied and owned (the "Update live page"
  // path). A slug that doesn't exist / isn't a buyer-tour / isn't owned falls
  // through to a fresh publish.
  if (typeof body.slug === "string" && body.slug.trim()) {
    const slug = body.slug.trim();
    const existing = await getHandoutRecord(slug);
    if (
      existing &&
      existing.type === BUYER_TOUR_HANDOUT_TYPE &&
      existing.ownerEmail.toLowerCase() === email.toLowerCase()
    ) {
      const updated = await updateHandout(slug, email, { data });
      if (updated) {
        return NextResponse.json(
          { ok: true, slug },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
  }

  const result = await publishHandout({
    type: BUYER_TOUR_HANDOUT_TYPE,
    ownerEmail: email,
    data,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Could not publish. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, slug: result.slug },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
