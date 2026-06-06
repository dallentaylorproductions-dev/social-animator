import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishHandout } from "@/lib/share-urls";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements } from "@/lib/entitlements/resolver";
import { clampDraft } from "@/tools/seller-presentation/engine/types";
import {
  toPublicPayload,
  type AgentBranding,
  type BrandReviewsInput,
  type BrandColorsInput,
} from "@/tools/seller-presentation/output/public-payload";

/**
 * POST /api/seller-presentation/publish (v1.47 / A6).
 *
 * Auth-gated server-side publish for the Seller Presentation
 * consumer page. Models src/app/api/oh-prep/publish/route.ts with
 * ONE structural difference that closes Risk R-1 by construction:
 *
 *   const payload = toPublicPayload(draft, agentContact);
 *   publishHandout({ ..., data: payload });
 *
 * The raw `SellerPresentationDraft` NEVER enters the KV record —
 * only the public-payload allowlist does. (OH Prep's route spreads
 * the full draft, which leaves private fields like `preEventNotes`
 * in KV even though the renderer omits them; the substrate-v1.1
 * v1.46 cleanup uses THIS route as its template.)
 *
 * The privacy boundary is proven separately by
 * e2e/seller-presentation.publish-allowlist.spec.ts, which exercises
 * `toPublicPayload` directly with sentinel strings in every private
 * slot. That spec is independent of this route deploying — privacy
 * doesn't ride on routing.
 *
 * Body:     { draft: SellerPresentationDraft, agentContact: AgentBranding }
 * Response: { ok: true, slug } | { ok: false, error }
 *
 * Handout type discriminator: `'seller-presentation'`. The
 * `HandoutType` discriminant in src/lib/share-urls.ts is
 * `(string & {})`-open (audit §5.7), so adding a new value here
 * required no edit to that module — the dispatch arms at
 * src/app/h/[slug]/page.tsx and src/app/api/og/[slug]/route.tsx
 * type-discriminate on the string.
 */
export const runtime = "nodejs";

interface PublishPayload {
  draft: unknown;
  agentContact?: {
    name?: string;
    brokerage?: string;
    phone?: string;
    email?: string;
    licenseNumber?: string;
  };
  /**
   * A7d.2 — agent-constant reviews + outlink URL sourced from
   * BrandSettings. Permissive shape on the wire; the projector
   * re-validates field-by-field, so anything outside the allowlist
   * is dropped before reaching KV.
   */
  brandReviews?: unknown;
  /**
   * E.0 — agent-constant brand colors sourced from BrandSettings (Brand
   * kit). Permissive shape on the wire; the projector validates each hex
   * field-by-field, so a malformed / tampered value never reaches KV.
   */
  brandColors?: unknown;
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: PublishPayload;
  try {
    payload = (await req.json()) as PublishPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Defense at boundary: clamp the incoming draft to the canonical
  // shape, then re-check the export-gating fields explicitly. The
  // wizard's StepReview validateForExport already ran client-side,
  // but the server must not trust that.
  const draft = clampDraft(payload.draft as Parameters<typeof clampDraft>[0]);
  if (
    !draft.propertyAddress?.trim() ||
    !draft.recommendedPrice?.trim() ||
    draft.comps.length === 0 ||
    !draft.comps[0].address.trim() ||
    !draft.comps[0].soldPrice.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "Required fields missing on draft" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const agentContact: AgentBranding = payload.agentContact ?? {};

  // A7d.2 — `brandReviews` is wire-permissive (`unknown`). We forward
  // it as-is; `toPublicPayload` projects each review row + the outlink
  // URL field-by-field through its own clamping helpers, so any extra
  // keys / wrong types in a tampered settings record never reach KV.
  const brandReviews: BrandReviewsInput =
    payload.brandReviews && typeof payload.brandReviews === "object"
      ? (payload.brandReviews as BrandReviewsInput)
      : {};

  // E.0 — `brandColors` is wire-permissive (`unknown`). Forward it as-is;
  // `toPublicPayload` validates each hex field-by-field, so a malformed /
  // tampered value never reaches KV. Absent / unset → projector returns
  // undefined and the consumer page falls back to the Editorial palette.
  const brandColors: BrandColorsInput =
    payload.brandColors && typeof payload.brandColors === "object"
      ? (payload.brandColors as BrandColorsInput)
      : {};

  // F4 — resolve the agent's entitlements to read the `whiteLabel` capability
  // (false for every access mode today; H-8 billing maps a paid tier to true).
  // The flag projects onto the payload's `suppressWordmark` 1:1.
  const entitlements = resolveEntitlements(await loadAgentProfile(email));

  // R-1 closed by construction: build the public-only payload and
  // pass ONLY it onward. The raw draft (with pricingStrategyId,
  // confidence, comp notes, private pitch points, etc.) is dropped
  // here and never sees the persistence path.
  const publicPayload = toPublicPayload(
    draft,
    agentContact,
    brandReviews,
    brandColors,
    entitlements.whiteLabel,
  );

  try {
    const result = await publishHandout({
      type: "seller-presentation",
      ownerEmail: email,
      data: publicPayload as unknown as Record<string, unknown>,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, slug: result.slug },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
