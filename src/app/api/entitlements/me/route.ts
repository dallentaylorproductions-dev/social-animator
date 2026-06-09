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
    },
  });
}
