import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteOwnedDraft,
  getOwnedDraft,
} from "@/lib/seller-presentation/draft-store";

/**
 * /api/seller-presentation/drafts/[id] (SP-KEYSTONE) — one draft by id.
 *
 *   GET    → open a single draft (the editor's cross-device load). Owner-
 *            scoped: a missing record AND another agent's record both return
 *            404 — INDISTINGUISHABLE, so a cross-owner probe can never confirm
 *            a draft exists. This is the cross-device "Open" unlock: a page
 *            whose draft was created elsewhere now loads from the server.
 *   DELETE → permanently remove a draft (library Delete on a draft card).
 *            Owner-checked; not-found and not-owned both map to 404.
 *
 * Auth-gated (401 anon) and flag-gated (503 when SERVER_DRAFTS_ENABLED off).
 *
 * GET    response: { ok, instance } | { ok: false, ... }
 * DELETE response: { ok: true } | { ok: false, ... }
 */
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function disabled() {
  return NextResponse.json(
    { ok: false, code: "feature-disabled", error: "Server drafts are not enabled" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function unauthenticated() {
  return NextResponse.json(
    { ok: false, error: "Not authenticated" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function notFound() {
  return NextResponse.json(
    { ok: false, error: "Draft not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(_req: Request, ctx: RouteContext) {
  if (process.env.SERVER_DRAFTS_ENABLED !== "true") return disabled();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return unauthenticated();

  const { id } = await ctx.params;
  if (!id) return notFound();

  try {
    const record = await getOwnedDraft(email, id);
    if (!record) return notFound();
    return NextResponse.json(
      { ok: true, instance: record.instance },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load draft";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  if (process.env.SERVER_DRAFTS_ENABLED !== "true") return disabled();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return unauthenticated();

  const { id } = await ctx.params;
  if (!id) return notFound();

  try {
    const result = await deleteOwnedDraft(email, id);
    if (!result.ok) {
      // not-found AND forbidden both surface as 404 (never leak existence).
      return notFound();
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
