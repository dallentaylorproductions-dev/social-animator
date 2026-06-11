import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getOwnedPageOrder,
  putOwnedPageOrder,
} from "@/lib/seller-presentation/pages-order-store";

/**
 * /api/seller-presentation/pages-order (SP-LIB-5) — the agent's manual order
 * for the "Your pages" Active tab.
 *
 *   GET → this agent's saved key order (the library applies it as the Active
 *         default, in Cards + List; [] when nothing is arranged yet).
 *   PUT → replace the order with the body's key list (one debounced write per
 *         reorder; idempotent overwrite, sanitized server-side).
 *
 * AUTH-gated (401 anon) and OWNER-scoped server-side: the store namespaces the
 * order by the SESSION email (never the body), so an agent can only ever read
 * or write their own arrangement — another agent's order is unreachable.
 *
 * Flag-gated: 503 when PAGES_REORDER_ENABLED !== 'true', so the endpoint is
 * inert until reorder ships and the flag-off product is byte-identical.
 *
 * GET response: { ok, order: string[] } | { ok: false, ... }
 * PUT body:     { order: string[] }
 * PUT response: { ok, order: string[] } | { ok: false, ... }
 */
export const runtime = "nodejs";

function disabled() {
  return NextResponse.json(
    { ok: false, code: "feature-disabled", error: "Reorder is not enabled" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function unauthenticated() {
  return NextResponse.json(
    { ok: false, error: "Not authenticated" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  if (process.env.PAGES_REORDER_ENABLED !== "true") return disabled();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return unauthenticated();

  try {
    const order = await getOwnedPageOrder(email);
    return NextResponse.json(
      { ok: true, order },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load order";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

interface PutPayload {
  order?: unknown;
}

export async function PUT(req: Request) {
  if (process.env.PAGES_REORDER_ENABLED !== "true") return disabled();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return unauthenticated();

  let payload: PutPayload;
  try {
    payload = (await req.json()) as PutPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // The store sanitizes (array of non-empty, de-duped strings); a malformed
    // body just collapses to a clean (possibly empty) list rather than erroring.
    const order = await putOwnedPageOrder(email, payload.order);
    return NextResponse.json(
      { ok: true, order },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
