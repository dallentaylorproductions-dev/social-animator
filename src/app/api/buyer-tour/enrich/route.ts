import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isBuyerTourBriefEnabled } from "@/lib/config/buyer-tour-brief";
import {
  commuteChip,
  geocodeAddress,
  hasGoogleMapsServerKey,
  nearestPlaceChip,
  type DerivedChip,
} from "@/lib/buyer-tour-brief/google-maps";
import {
  isProximityCategory,
  type LatLng,
  type ProximityCategory,
} from "@/tools/buyer-tour-brief/engine/types";

/**
 * POST /api/buyer-tour/enrich (BUYER_TOUR_BRIEF).
 *
 * Auto-derives the FACTUAL proximity layer for a tour: geocodes each home address
 * (+ the commute anchor), pulls the nearest school/park/coffee/grocery for each
 * enabled non-commute layer, and a drive time from each home to the single anchor.
 *
 * Server-only by construction: the Google key is read inside the google-maps lib,
 * never shipped to the client. The returned chips are FACTS only (place name +
 * distance / drive time) — no ratings, no quality judgment (Fair Housing).
 *
 * Discipline (mirrors /api/seller-presentation/autofill):
 *   - Feature-flag killable → 503 when BUYER_TOUR_BRIEF is off.
 *   - Auth required (E2E bypass, non-prod only).
 *   - Never hard-fails: a missing server key returns ok:false code "key-missing"
 *     at HTTP 200 so the builder degrades to MANUAL chip entry; any per-home/
 *     per-layer failure just yields fewer chips.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

interface EnrichHomeInput {
  id: string;
  address: string;
}

interface EnrichResultHome {
  id: string;
  lat?: number;
  lng?: number;
  chips: DerivedChip[];
}

interface ApiOk {
  ok: true;
  homes: EnrichResultHome[];
  anchor?: { lat: number; lng: number };
}
interface ApiErr {
  ok: false;
  code:
    | "feature-disabled"
    | "not-authenticated"
    | "invalid-input"
    | "key-missing";
  message: string;
}

export async function POST(req: Request): Promise<NextResponse<ApiOk | ApiErr>> {
  if (!isBuyerTourBriefEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        code: "feature-disabled",
        message: "Buyer Tour proximity is not enabled.",
      } satisfies ApiErr,
      { status: 503 },
    );
  }

  const e2eBypass =
    process.env.NODE_ENV !== "production" && process.env.E2E_TESTING === "1";
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email && !e2eBypass) {
    return NextResponse.json(
      {
        ok: false,
        code: "not-authenticated",
        message: "Please sign in to pull proximity.",
      } satisfies ApiErr,
      { status: 401 },
    );
  }

  // The server key is not yet provisioned. Until GOOGLE_MAPS_SERVER_KEY exists,
  // tell the builder to fall back to manual chip entry — no Google call attempted.
  if (!hasGoogleMapsServerKey()) {
    return NextResponse.json(
      {
        ok: false,
        code: "key-missing",
        message:
          "Auto proximity isn't available yet. Add the layers you want by hand.",
      } satisfies ApiErr,
      { status: 200 },
    );
  }
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY as string;

  // Parse the body defensively.
  let homes: EnrichHomeInput[] = [];
  let anchorAddress = "";
  let anchorLabel = "";
  let categories: ProximityCategory[] = [];
  try {
    const body = (await req.json()) as unknown;
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.homes)) {
        homes = b.homes
          .map((h) => {
            const hr = (h && typeof h === "object" ? h : {}) as Record<
              string,
              unknown
            >;
            return {
              id: typeof hr.id === "string" ? hr.id : "",
              address: typeof hr.address === "string" ? hr.address : "",
            };
          })
          .filter((h) => h.id && h.address.trim())
          .slice(0, 6);
      }
      const anchor = b.commuteAnchor as Record<string, unknown> | undefined;
      if (anchor) {
        if (typeof anchor.address === "string") anchorAddress = anchor.address;
        if (typeof anchor.label === "string") anchorLabel = anchor.label;
      }
      if (Array.isArray(b.categories)) {
        categories = b.categories.filter(isProximityCategory);
      }
    }
  } catch {
    /* fall through to the invalid-input guard */
  }

  if (homes.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid-input",
        message: "Add at least one home address to pull proximity.",
      } satisfies ApiErr,
      { status: 200 },
    );
  }

  try {
    // Geocode the anchor once (commute layer needs it).
    const wantCommute = categories.includes("commute") && !!anchorAddress.trim();
    const placeCats = categories.filter(
      (c): c is Exclude<ProximityCategory, "commute"> => c !== "commute",
    );
    const anchorPoint: LatLng | null =
      wantCommute ? await geocodeAddress(anchorAddress, apiKey) : null;

    const results: EnrichResultHome[] = await Promise.all(
      homes.map(async (home) => {
        const point = await geocodeAddress(home.address, apiKey);
        const out: EnrichResultHome = { id: home.id, chips: [] };
        if (!point) return out;
        out.lat = point.lat;
        out.lng = point.lng;

        const chipPromises: Array<Promise<DerivedChip | null>> = placeCats.map(
          (cat) => nearestPlaceChip(point, cat, apiKey),
        );
        if (wantCommute && anchorPoint) {
          chipPromises.push(
            commuteChip(
              point,
              anchorPoint,
              anchorLabel || "Commute anchor",
              apiKey,
            ),
          );
        }
        const chips = await Promise.all(chipPromises);
        out.chips = chips.filter((c): c is DerivedChip => c !== null);
        return out;
      }),
    );

    const res: ApiOk = { ok: true, homes: results };
    if (anchorPoint) res.anchor = { lat: anchorPoint.lat, lng: anchorPoint.lng };
    return NextResponse.json(res, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.warn("[buyer-tour/enrich] unexpected failure", err);
    // Treat a surprise failure as "no auto data" rather than a 500 — the builder
    // falls back to manual entry.
    return NextResponse.json(
      {
        ok: false,
        code: "key-missing",
        message: "Couldn't pull proximity. Add the layers you want by hand.",
      } satisfies ApiErr,
      { status: 200 },
    );
  }
}
