import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import {
  resolveEntitlements,
  resolveSkill,
} from "@/lib/entitlements/resolver";
import { SELLER_PRESENTATION_SKILL } from "@/tools/seller-presentation/skill";

/**
 * GET /api/entitlements/me (v1.47 Lane C).
 *
 * Returns the resolved entitlement state for the current session so
 * client components inside the Seller Presentation wizard can render
 * tier-aware affordances (e.g. the Import-comps button shows the
 * locked-state copy under aiAccess.state !== 'available').
 *
 * Server-resolved on every call so ?testTier= flows through, matching
 * the dashboard's pattern. Cheap — KV lookups + a few in-process map
 * lookups. No DB write.
 *
 * Privacy: returns only the gate states + access mode + tier, NOT the
 * underlying AgentProfile (which carries subscriptionStatus etc.).
 */

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email ?? null;

  const url = new URL(req.url);
  const testTier = url.searchParams.get("testTier");
  // `email || null` mirrors src/app/dashboard/page.tsx so empty
  // sessions short-circuit loadAgentProfile's KV reads (E2E path).
  const agentProfile = await loadAgentProfile(email || null, { testTier });
  const ent = resolveEntitlements(agentProfile);
  const resolved = resolveSkill(SELLER_PRESENTATION_SKILL, ent);

  return NextResponse.json({
    ok: true,
    accessMode: ent.accessMode,
    tier: ent.tier,
    suppressUpgradeUi: ent.suppressUpgradeUi,
    aiAccess: {
      state: resolved.aiAccess.state,
      reason: resolved.aiAccess.reason,
      label: resolved.aiAccess.label,
      fallbackAction: resolved.aiAccess.fallbackAction,
    },
    themeAccess: {
      state: resolved.themeAccess.state,
      reason: resolved.themeAccess.reason,
      label: resolved.themeAccess.label,
    },
    coreAccess: {
      state: resolved.coreAccess.state,
      reason: resolved.coreAccess.reason,
      label: resolved.coreAccess.label,
    },
    // Feature flags exposed so client-side affordances can hide
    // entirely when an end-to-end feature is off (the comp-import
    // button hides when COMP_IMPORT_ENABLED !== 'true', not just
    // locks). Server still enforces; the flag is the kill switch.
    features: {
      compImportEnabled: process.env.COMP_IMPORT_ENABLED === "true",
      // P2-CHART — the §05 RentCast market-trend auto-fill. OFF by default;
      // when false the wizard never attempts the fetch and the area-snapshot
      // step behaves exactly as pre-P2 (manual/comp-derived series).
      areaChartRentcastEnabled:
        process.env.AREA_CHART_RENTCAST_ENABLED === "true",
      // COMP_PHOTOS — per-comp Street View auto-photo + manual upload. OFF by
      // default; when false the wizard never resolves Street View coverage,
      // never shows the per-comp upload, and the serializer emits no photo
      // keys (exact current behavior).
      compPhotosEnabled: process.env.COMP_PHOTOS_ENABLED === "true",
      // SP-LIB — the "Your pages" library landing for the Seller Presentation
      // tool. OFF by default; when false the tool lands on today's wizard
      // (byte-identical), the /pages + /archive routes 503, and the landing
      // gate never renders the library. The server page reads the same env
      // var directly to pick the landing — this exposure is for any future
      // client affordance + parity with the other SP flags.
      sellerPagesLibraryEnabled:
        process.env.SELLER_PAGES_LIBRARY_ENABLED === "true",
      // REVIEW_SOURCE_LOGOS - the source brand-logo chip on the flagship review
      // card. OFF by default; when false the live preview's review card renders
      // today's text wordmark (byte-identical). Mirrors the publish-time env
      // flag SellerPresentationPage reads, so the preview matches the page.
      reviewSourceLogosEnabled:
        process.env.REVIEW_SOURCE_LOGOS_ENABLED === "true",
      // SELLER_STATE_A — the "prepared invitation" (pre-appointment) state of the
      // living seller page. OFF by default; when false the wizard never shows the
      // mode toggle / appointment input, publishes carry no valuationStatus, and
      // the consumer page + live preview render today's full presentation
      // (byte-identical).
      sellerStateAEnabled: process.env.SELLER_STATE_A_ENABLED === "true",
      // MARKETING_ZONE_REDESIGN (v1.7 Packet C) — the redesigned "How I'll get
      // your home seen" zone. OFF by default; when false the wizard live preview
      // renders today's capability-frames grid (byte-identical). Mirrors the
      // publish-time env flag the publish route reads, so the live/example
      // preview matches what a flag-on publish projects.
      marketingZoneRedesignEnabled:
        process.env.MARKETING_ZONE_REDESIGN_ENABLED === "true",
      // VALUATION_REDESIGN (v1.7 Packet B) — the redesigned State-A valuation
      // section. OFF by default; when false the wizard live/EXAMPLE preview
      // renders today's valuation block (byte-identical). Mirrors the publish-time
      // env flag so the preview matches what a flag-on publish projects.
      valuationRedesignEnabled:
        process.env.VALUATION_REDESIGN_ENABLED === "true",
    },
  });
}
