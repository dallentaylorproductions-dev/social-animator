import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteHandout } from "@/lib/share-urls";

/**
 * POST /api/seller-presentation/delete (SP-LIB-2).
 *
 * PERMANENTLY delete a published seller page from the "Your pages" library —
 * purges the KV record and drops it from the owner index. Distinct from
 * archive (reversible, takes the page offline) and revoke (reversible
 * soft-delete): this is the irreversible "clear space" action.
 *
 * Lifecycle gate: a page must be ARCHIVED (offline) before it can be deleted.
 * `deleteHandout` refuses a still-live record with `is-live` → 409, so it is
 * impossible to delete a page a seller is actively viewing even if a client
 * bypassed the library UI. Owner-scoped: an agent can only delete their own
 * pages (ownerEmail must match) — the privacy/safety hard gate.
 *
 * Flag-gated: 503 when SELLER_PAGES_LIBRARY_ENABLED !== 'true'.
 *
 * Body:     { slug: string }
 * Response: { ok: true } | { ok: false, error }
 */
export const runtime = "nodejs";

interface DeletePayload {
  slug?: unknown;
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

  let payload: DeletePayload;
  try {
    payload = (await req.json()) as DeletePayload;
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
    const result = await deleteHandout(payload.slug, email);
    if (!result.ok) {
      if (result.reason === "is-live") {
        return NextResponse.json(
          { ok: false, error: "Archive this page before deleting it" },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      // not-found and forbidden both surface as 404 — never confirm to a
      // caller that someone else's slug exists.
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
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
