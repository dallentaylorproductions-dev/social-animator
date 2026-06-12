import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishHandout, updateHandout } from "@/lib/share-urls";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements } from "@/lib/entitlements/resolver";
import { isCompPhotosEnabled } from "@/lib/seller-presentation/street-view";
import { isSellerStateAEnabled } from "@/lib/seller-presentation/state-a";
import {
  clampDraft,
  describeMissingRequiredInputs,
} from "@/tools/seller-presentation/engine/types";
import {
  toPublicPayload,
  type AgentBranding,
  type BrandReviewsInput,
  type BrandColorsInput,
  type BrandWhyUsInput,
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
  /**
   * B0b — agent-constant "Why us" marketing layer (+ tagline + reviews
   * headline) sourced from BrandSettings. Permissive shape on the wire;
   * `toPublicPayload` clamps it field-by-field via `clampPublicWhyUs`, so
   * a tampered/legacy record never lands an unbounded list or private key
   * in KV.
   */
  brandWhyUs?: unknown;
  /**
   * SP-LIB — the existing handout slug to re-publish into, for the
   * library's "Update live page" action. When present (and the SP-LIB
   * flag is on, and the caller owns it), the route UPDATES that record
   * in place so the seller's existing /h/<slug> link stays stable.
   * Absent / flag-off / not-owned ⇒ a brand-new random slug is minted,
   * exactly as today.
   */
  slug?: string;
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
  // shape, then re-check the export-gating fields. We delegate to the
  // SAME `getMissingRequiredInputs` (via describeMissingRequiredInputs)
  // the wizard's StepReview gate uses, so the server can't disagree with
  // the client about what "complete" means. The old hand-rolled check
  // here required a single `recommendedPrice` and rejected a draft that
  // carried only a low-high RANGE (UX-2a / #43) — exactly Aaron's
  // "haven't seen the house, put your range down" case. That divergence
  // made a fully-filled range draft fail publish with no named field.
  const sellerStateA = isSellerStateAEnabled();
  const rawDraft = clampDraft(payload.draft as Parameters<typeof clampDraft>[0]);
  // SELLER_STATE_A kill switch closed by construction: when the flag is OFF we
  // strip any State A status/appointment off the draft BEFORE gating + projecting,
  // so an invitation-status draft can never publish a price-less "revealed" page
  // (it would fail the price/comp gate) and no State A keys reach KV. Flag-on:
  // the draft passes through and the invitation gate / projection apply.
  const draft = sellerStateA
    ? rawDraft
    : { ...rawDraft, valuationStatus: undefined, appointmentAt: undefined };
  const missing = describeMissingRequiredInputs(draft);
  if (missing.length > 0) {
    // Name the field(s) in the server log AND the client-visible error so
    // a publish failure is never opaque again.
    console.warn(
      `[sp/publish] rejected, required fields missing: ${missing.join(", ")}`,
    );
    return NextResponse.json(
      { ok: false, error: `Missing required: ${missing.join(", ")}` },
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

  // B0b — `brandWhyUs` is wire-permissive (`unknown`). Forward it as-is;
  // `toPublicPayload` runs the whyUs sub-record through `clampPublicWhyUs`
  // (re-validates types, re-applies the soft caps, drops un-renderable rows)
  // so nothing outside the allowlist reaches KV. Absent / unset → the
  // projector returns undefined and the v2 Why-us section hides cleanly.
  const brandWhyUs: BrandWhyUsInput =
    payload.brandWhyUs && typeof payload.brandWhyUs === "object"
      ? (payload.brandWhyUs as BrandWhyUsInput)
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
    brandWhyUs,
    // COMP_PHOTOS kill switch. OFF => no per-comp photo/Street-View keys reach
    // KV (exact current behavior). Only the pano id + coverage flag are ever
    // persisted; no Google image bytes touch the payload.
    isCompPhotosEnabled(),
    // SELLER_STATE_A kill switch. OFF => no valuationStatus/appointmentAt keys
    // reach KV (byte-identical). The draft was already status-stripped above
    // when the flag is off, so this only ever emits in a State A publish.
    sellerStateA,
  );

  const data = publicPayload as unknown as Record<string, unknown>;

  // SP-LIB — "Update live page": when the library hands back the slug a
  // page is already live at (and the flag is on), update that record in
  // place so the seller's existing link is preserved. updateHandout
  // enforces the owner check itself; a false return (missing record or
  // owner mismatch) falls through to a fresh publish so the agent is
  // never left unable to re-publish. Flag-off ⇒ this branch is skipped
  // entirely and behavior is byte-identical to today (always new slug).
  const libraryEnabled = process.env.SELLER_PAGES_LIBRARY_ENABLED === "true";
  const reuseSlug =
    libraryEnabled && typeof payload.slug === "string" && payload.slug
      ? payload.slug
      : null;

  try {
    if (reuseSlug) {
      const updated = await updateHandout(reuseSlug, email, { data });
      if (updated) {
        return NextResponse.json(
          { ok: true, slug: reuseSlug },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
      // Fall through to a fresh publish below if the slug was gone /
      // not owned by this agent.
    }

    const result = await publishHandout({
      type: "seller-presentation",
      ownerEmail: email,
      data,
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
