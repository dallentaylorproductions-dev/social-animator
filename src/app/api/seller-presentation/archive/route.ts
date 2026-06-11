import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setHandoutArchived } from "@/lib/share-urls";

/**
 * POST /api/seller-presentation/archive (SP-LIB).
 *
 * Archive / restore a published seller page from the "Your pages"
 * library. Archiving takes the page down publicly (the seller's link
 * 404s) and frees its cap slot; restoring brings it back. Reversible by
 * design — distinct from revoke, which is a harder take-down.
 *
 * Owner-scoped: `setHandoutArchived` enforces the ownerEmail-must-match
 * check (same guard as revoke), so an agent can only archive their own
 * pages.
 *
 * Flag-gated: 503 when SELLER_PAGES_LIBRARY_ENABLED !== 'true'.
 *
 * Body:     { slug: string, action: 'archive' | 'restore' }
 * Response: { ok: true } | { ok: false, error }
 */
export const runtime = "nodejs";

interface ArchivePayload {
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

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: ArchivePayload;
  try {
    payload = (await req.json()) as ArchivePayload;
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
  if (payload.action !== "archive" && payload.action !== "restore") {
    return NextResponse.json(
      { ok: false, error: "action must be 'archive' or 'restore'" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const ok = await setHandoutArchived(
      payload.slug,
      email,
      payload.action === "archive",
    );
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
    const message = err instanceof Error ? err.message : "Archive failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
