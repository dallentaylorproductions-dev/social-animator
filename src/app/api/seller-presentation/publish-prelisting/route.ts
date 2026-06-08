import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishPrelistingPage } from "@/lib/share-urls";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements } from "@/lib/entitlements/resolver";
import {
  toPrelistingPayload,
  withAccountEmailFallback,
  type AgentBranding,
  type BrandReviewsInput,
  type BrandColorsInput,
  type BrandWhyUsInput,
} from "@/tools/seller-presentation/output/public-payload";

/**
 * POST /api/seller-presentation/publish-prelisting (B0c).
 *
 * Auth-gated publish for the DURABLE, agent-constant pre-listing page. Models
 * the seller-presentation publish route, with two deliberate differences:
 *
 *   1. No draft. The standalone page carries ONLY agent-constant brand fields
 *      (the SAME `{agentContact, brandWhyUs, brandReviews, brandColors}` the
 *      shared `brandToPublishInputs` produces) — never any listing data.
 *      `toPrelistingPayload` projects them field-by-field; the raw Settings
 *      object never reaches KV.
 *
 *   2. Durable slug. `publishPrelistingPage` derives a STABLE per-agent slug
 *      and writes in place, so republishing returns the SAME slug/url — the
 *      agent texts the link once and keeps it current.
 *
 * The privacy boundary is proven independently by
 * e2e/prelisting.publish-allowlist.spec.ts (it exercises `toPrelistingPayload`
 * directly with sentinels) — privacy doesn't ride on this route deploying.
 *
 * Body:     { agentContact, brandWhyUs?, brandReviews?, brandColors? }
 * Response: { ok: true, slug } | { ok: false, error }
 */
export const runtime = "nodejs";

interface PublishPrelistingBody {
  agentContact?: AgentBranding;
  brandWhyUs?: unknown;
  brandReviews?: unknown;
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

  let body: PublishPrelistingBody;
  try {
    body = (await req.json()) as PublishPrelistingBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const agentContact: AgentBranding =
    body.agentContact && typeof body.agentContact === "object"
      ? body.agentContact
      : {};

  // The standalone page hides its "Your agent" block (and so reads near-empty)
  // when no agent name is set. Require a name so a publish always yields a page
  // worth texting — parity with the seller page's brand-incomplete guidance.
  if (!agentContact.name?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Set your agent / team name in Settings first." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Each input is wire-permissive (`unknown`). Forward as-is; `toPrelistingPayload`
  // projects/validates field-by-field (whyUs through `clampPublicWhyUs`, each
  // review + hex independently), so a tampered/legacy Settings record can't land
  // a private/listing key or an unbounded list in KV.
  const brandWhyUs: BrandWhyUsInput =
    body.brandWhyUs && typeof body.brandWhyUs === "object"
      ? (body.brandWhyUs as BrandWhyUsInput)
      : {};
  const brandReviews: BrandReviewsInput =
    body.brandReviews && typeof body.brandReviews === "object"
      ? (body.brandReviews as BrandReviewsInput)
      : {};
  const brandColors: BrandColorsInput =
    body.brandColors && typeof body.brandColors === "object"
      ? (body.brandColors as BrandColorsInput)
      : {};

  // F4 — resolve entitlements for the white-label capability (false for every
  // access mode today). Same posture as the seller page; no new paywall logic.
  const entitlements = resolveEntitlements(await loadAgentProfile(email));

  // The page's single CTA close needs a reachable contact. Brand contact
  // email/phone are both optional, so fall the authenticated account email in
  // as the floor — the close always renders. A brand-set email/phone wins.
  const contact = withAccountEmailFallback(agentContact, email);

  const payload = toPrelistingPayload(
    contact,
    brandWhyUs,
    brandReviews,
    brandColors,
    entitlements.whiteLabel,
  );

  try {
    const result = await publishPrelistingPage({
      ownerEmail: email,
      data: payload as unknown as Record<string, unknown>,
    });
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
