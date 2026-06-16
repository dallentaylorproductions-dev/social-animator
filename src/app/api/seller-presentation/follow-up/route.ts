import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setHandoutFollowedUp } from "@/lib/share-urls";
import { isViewedSignalNudgeEnabled } from "@/lib/seller-presentation/viewed-signal";

/**
 * POST /api/seller-presentation/follow-up (Viewed signal Phase 3).
 *
 * The ONE bounded write the advisory follow-up nudge adds: mark a published
 * seller page "followed up" so it drops out of the library's nudge set, or
 * clear that mark (reversible-safe). Strictly advisory — this records that the
 * agent intends to follow up; it NEVER sends an email/SMS, pushes a CRM, or
 * automates any outreach. Owner-scoped: `setHandoutFollowedUp` enforces the
 * ownerEmail-must-match check, so an agent can only mark their own pages.
 *
 * Double-gated:
 *   - 503 when SELLER_PAGES_LIBRARY_ENABLED !== 'true' (the library shell), and
 *   - 503 when VIEWED_SIGNAL_NUDGE_ENABLED !== 'true', so flag-off stores
 *     NOTHING (byte-identical: the control never renders and the route no-ops).
 *
 * Body:     { slug: string, action?: 'mark' | 'clear' }  (default 'mark')
 * Response: { ok: true } | { ok: false, error }
 */
export const runtime = "nodejs";

interface FollowUpPayload {
  slug?: unknown;
  action?: unknown;
}

export async function POST(req: Request) {
  if (process.env.SELLER_PAGES_LIBRARY_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, code: "feature-disabled", error: "Library is not enabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isViewedSignalNudgeEnabled()) {
    return NextResponse.json(
      { ok: false, code: "feature-disabled", error: "Follow-up nudge is not enabled" },
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

  let payload: FollowUpPayload;
  try {
    payload = (await req.json()) as FollowUpPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (typeof payload.slug !== "string" || !payload.slug.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing slug" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    payload.action !== undefined &&
    payload.action !== "mark" &&
    payload.action !== "clear"
  ) {
    return NextResponse.json(
      { ok: false, error: "action must be 'mark' or 'clear'" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const followedUpAt =
      payload.action === "clear" ? null : new Date().toISOString();
    const ok = await setHandoutFollowedUp(payload.slug, email, followedUpAt);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Page not found or not owned by this agent" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Follow-up failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
