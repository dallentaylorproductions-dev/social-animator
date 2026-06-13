import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAddressAutofill } from "@/lib/seller-presentation/get-property-autofill";
import { isSellerStateAEnabled } from "@/lib/seller-presentation/state-a";
import { normalizeAddressKey } from "@/lib/seller-presentation/rentcast-autofill";
import type { AutofillPropertyDetails } from "@/lib/seller-presentation/rentcast-autofill";
import type { Comp } from "@/tools/seller-intelligence-report/engine/types";
import type { AutofillSource } from "@/lib/seller-presentation/get-property-autofill";

/**
 * POST /api/seller-presentation/autofill (SP-AUTOFILL, Phase 2).
 *
 * The "type the address once" build. The prepared-invitation wizard calls this
 * on address BLUR (flag ON, invitation mode); the response autofills the subject
 * property details AND seeds the nearby recent sales the brief reviews. The
 * agent then confirms / trims - no comp addresses to look up by hand.
 *
 * Server-only by construction: the RentCast API key is read inside
 * getAddressAutofill, never shipped to the client. Street View is NOT resolved
 * here - the browser key is referrer-restricted, so the client resolves comp
 * coverage exactly as the full comps step does (no server Google billing).
 *
 * Discipline (mirrors /api/seller-presentation/area-trend):
 *   - Feature-flag killable. SELLER_STATE_A_ENABLED !== "true" -> 503, so the
 *     wizard never calls it and the path is dark by default.
 *   - Auth required (E2E bypass mirrors comp-import; non-prod only) so the
 *     cost-bearing RentCast calls can't be driven by anonymous traffic.
 *   - Never hard-fails: a missing key / unusable address returns ok:false at
 *     HTTP 200; a no-record address returns ok:true with {} / [] so the wizard
 *     quietly falls back to manual entry.
 */

export const runtime = "nodejs";
// Two RentCast calls run concurrently, each with its own 8s timeout inside
// getAddressAutofill; give the lambda comfortable headroom so the calls trip
// their own timeouts first (per the maxDuration lesson - external-API routes
// get killed silently otherwise).
export const maxDuration = 20;

interface ApiOk {
  ok: true;
  property: AutofillPropertyDetails;
  comps: Comp[];
  source: { property: AutofillSource; comps: AutofillSource };
}
interface ApiErr {
  ok: false;
  code:
    | "feature-disabled"
    | "not-authenticated"
    | "invalid-address"
    | "key-missing"
    | "error";
  message: string;
}

/** Calm, agent-facing fallback copy per non-ok code. */
function fallbackMessage(code: string): string {
  switch (code) {
    case "invalid-address":
      return "Enter a street address to pull the property details and nearby sales.";
    default:
      // key-missing / error: never expose the cause; just point to manual entry.
      return "Couldn't pull the market for this address. You can fill in the details by hand.";
  }
}

export async function POST(req: Request): Promise<NextResponse<ApiOk | ApiErr>> {
  // 1) Feature flag - dark by default; killable in prod without a redeploy.
  if (!isSellerStateAEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        code: "feature-disabled",
        message: "Address autofill is not enabled. Fill in the details by hand.",
      } satisfies ApiErr,
      { status: 503 },
    );
  }

  // 2) Auth - must be signed in (E2E bypass mirrors comp-import; non-prod only).
  const e2eBypass =
    process.env.NODE_ENV !== "production" && process.env.E2E_TESTING === "1";
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email && !e2eBypass) {
    return NextResponse.json(
      {
        ok: false,
        code: "not-authenticated",
        message: "Please sign in to pull property details.",
      } satisfies ApiErr,
      { status: 401 },
    );
  }

  // 3) Parse + validate the address up front so an empty input never reaches the
  //    cache or RentCast.
  let address = "";
  try {
    const body = (await req.json()) as unknown;
    if (body && typeof body === "object") {
      const a = (body as Record<string, unknown>).address;
      if (typeof a === "string") address = a;
    }
  } catch {
    /* fall through to the invalid-address guard below */
  }
  if (!normalizeAddressKey(address)) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid-address",
        message: fallbackMessage("invalid-address"),
      } satisfies ApiErr,
      { status: 200 },
    );
  }

  // 4) Resolve (cache -> RentCast). getAddressAutofill never throws, but wrap it
  //    anyway per the maxDuration lesson so a surprise rejection still returns a
  //    clean fallback (and is logged) instead of a silent 500.
  try {
    const result = await getAddressAutofill(address);
    if (result.ok) {
      return NextResponse.json(
        {
          ok: true,
          property: result.property,
          comps: result.comps,
          source: result.source,
        } satisfies ApiOk,
        {
          status: 200,
          headers: {
            "X-Autofill-Source": `prop=${result.source.property};comps=${result.source.comps}`,
          },
        },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: fallbackMessage(result.code),
      } satisfies ApiErr,
      { status: 200 },
    );
  } catch (err) {
    console.error("[sp-autofill] unexpected failure", err);
    return NextResponse.json(
      { ok: false, code: "error", message: fallbackMessage("error") } satisfies ApiErr,
      { status: 200 },
    );
  }
}
