import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeHandout } from "@/lib/share-urls";

/**
 * POST /api/seller-presentation/revoke (v1.47 / A6).
 *
 * Mirror of src/app/api/oh-prep/revoke/route.ts — the only divergence
 * is the route path. The handout-revoke logic itself (owner-must-match
 * check, soft-revoke flag, owner-list visibility) lives in
 * `revokeHandout` (src/lib/share-urls.ts) and is the same for every
 * handout type.
 *
 * Audit §5.7 flags a future refactor to a shared
 * `/api/handout/revoke?type=...` endpoint when a third handout type
 * lands. Two near-identical routes is not yet duplication worth
 * deduplicating.
 *
 * Body:     { slug: string }
 * Response: { ok: true } | { ok: false, error }
 */
export const runtime = "nodejs";

interface RevokePayload {
  slug?: unknown;
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

  let payload: RevokePayload;
  try {
    payload = (await req.json()) as RevokePayload;
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

  try {
    const ok = await revokeHandout(payload.slug, email);
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
    const message = err instanceof Error ? err.message : "Revoke failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
