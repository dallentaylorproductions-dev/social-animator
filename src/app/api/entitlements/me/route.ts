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
    },
  });
}
