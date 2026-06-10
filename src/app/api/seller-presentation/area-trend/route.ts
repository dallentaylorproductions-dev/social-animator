import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAreaPriceTrend } from "@/lib/seller-presentation/get-area-price-trend";
import {
  isAreaChartRentcastEnabled,
  isValidZip,
} from "@/lib/seller-presentation/rentcast-area-trend";
import type { AreaStatsMonthly } from "@/tools/seller-presentation/engine/types";

/**
 * GET /api/seller-presentation/area-trend?zip=98406 (P2-CHART).
 *
 * Authoring-time resolver for the §05 area price-trend chart. The wizard's
 * AreaStatsEditor calls this when the agent sets/changes the property zip
 * (flag ON); the resolved series is written into the draft and BAKED into
 * the published payload, so the 1:many consumer page never calls RentCast.
 *
 * Server-only by construction: `process.env.Rent_Cast_API` is read inside
 * getAreaPriceTrend (this module), never shipped to the client.
 *
 * Discipline (mirrors /api/comp-import):
 *   - Feature-flag killable. AREA_CHART_RENTCAST_ENABLED !== "true" → 503
 *     feature-disabled, so the wizard hides the affordance and the path is
 *     dark by default. A non-prod `X-Area-Trend-Test-Disable: 1` header
 *     simulates flag-off for the flag-off spec without a server restart.
 *   - Auth required (with the same E2E bypass comp-import uses) so the
 *     cost-bearing RentCast call can't be driven by anonymous traffic. NO
 *     tier/paywall gate in this packet — flag only.
 *   - Never hard-fails: every fallback case returns ok:false + a machine
 *     code at HTTP 200 so the wizard quietly reverts to manual/comp entry.
 */

export const runtime = "nodejs";
// RentCast call has its own 8s timeout inside getAreaPriceTrend; give the
// lambda comfortable headroom so the call trips its own timeout first.
export const maxDuration = 20;

interface ApiOk {
  ok: true;
  series: AreaStatsMonthly[];
  source: "cache" | "live";
}
interface ApiErr {
  ok: false;
  code:
    | "feature-disabled"
    | "not-authenticated"
    | "invalid-zip"
    | "key-missing"
    | "no-data"
    | "error";
  message: string;
}

/** Calm, agent-facing fallback copy per non-ok code. */
function fallbackMessage(code: string): string {
  switch (code) {
    case "no-data":
      return "No market trend available for this ZIP yet — enter the monthly prices by hand.";
    case "invalid-zip":
      return "Enter a valid 5-digit ZIP to load the market trend.";
    default:
      // key-missing / error — never expose the cause; just point to manual entry.
      return "Couldn't load the market trend — enter the monthly prices by hand.";
  }
}

export async function GET(req: Request): Promise<NextResponse<ApiOk | ApiErr>> {
  // 1) Feature flag — dark by default; killable in prod without a redeploy.
  const testForceDisabled =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-area-trend-test-disable") === "1";
  if (!isAreaChartRentcastEnabled() || testForceDisabled) {
    return NextResponse.json(
      {
        ok: false,
        code: "feature-disabled",
        message:
          "Market-trend auto-fill is not enabled. Enter the monthly prices by hand below.",
      } satisfies ApiErr,
      { status: 503 },
    );
  }

  // 2) Auth — must be signed in (E2E bypass mirrors comp-import; non-prod only).
  const e2eBypass =
    process.env.NODE_ENV !== "production" && process.env.E2E_TESTING === "1";
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email && !e2eBypass) {
    return NextResponse.json(
      {
        ok: false,
        code: "not-authenticated",
        message: "Please sign in to load the market trend.",
      } satisfies ApiErr,
      { status: 401 },
    );
  }

  // 3) Validate zip up front so an obviously-bad input never reaches the cache
  //    or RentCast.
  const url = new URL(req.url);
  const zip = url.searchParams.get("zip") ?? "";
  if (!isValidZip(zip)) {
    return NextResponse.json(
      { ok: false, code: "invalid-zip", message: fallbackMessage("invalid-zip") } satisfies ApiErr,
      { status: 200 },
    );
  }

  // 4) Resolve (cache → RentCast). getAreaPriceTrend never throws.
  const result = await getAreaPriceTrend(zip.trim());
  if (result.ok) {
    return NextResponse.json(
      { ok: true, series: result.series, source: result.source } satisfies ApiOk,
      {
        status: 200,
        // Diagnostic-only: lets the preview smoke confirm cache hit vs live
        // from response headers without digging through server logs.
        headers: { "X-Area-Trend-Source": result.source },
      },
    );
  }

  // Graceful fallback — HTTP 200 so the wizard treats it as "couldn't load,
  // enter manually" rather than a hard error.
  return NextResponse.json(
    { ok: false, code: result.code, message: fallbackMessage(result.code) } satisfies ApiErr,
    { status: 200 },
  );
}
