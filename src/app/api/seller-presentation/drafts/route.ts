import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isSellerDraftInstance,
  listOwnedDraftRecords,
  putDraft,
} from "@/lib/seller-presentation/draft-store";

/**
 * /api/seller-presentation/drafts (SP-KEYSTONE) — the draft collection.
 *
 *   GET  → list THIS agent's draft instances (server source of truth for the
 *          library + the migration's "what's already on the server" set).
 *   PUT  → idempotent upsert of one draft instance (create, autosave, and the
 *          migration push all funnel through here). Keyed by the client-minted
 *          instanceId, so a re-save / retry overwrites in place — never a dupe,
 *          never a lost draft.
 *
 * Both are AUTH-gated (401 anon) and OWNER-scoped server-side: the list reads
 * only this agent's owner index, and the upsert stamps the owner from the
 * SESSION (never the body) and refuses to overwrite a draft owned by anyone
 * else. A second account can never see or clobber another agent's draft.
 *
 * Flag-gated: 503 when SERVER_DRAFTS_ENABLED !== 'true', so the endpoint is
 * inert until the keystone ships and the flag-off product is unaffected.
 *
 * GET  response: { ok, drafts: WorkflowInstance[] } | { ok: false, ... }
 * PUT  body:     { instance: WorkflowInstance }
 * PUT  response: { ok, instance: WorkflowInstance } | { ok: false, ... }
 */
export const runtime = "nodejs";

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

export async function GET() {
  if (process.env.SERVER_DRAFTS_ENABLED !== "true") return disabled();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return unauthenticated();

  try {
    const records = await listOwnedDraftRecords(email);
    const drafts = records.map((r) => r.instance);
    return NextResponse.json(
      { ok: true, drafts },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load drafts";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

interface PutPayload {
  instance?: unknown;
}

export async function PUT(req: Request) {
  if (process.env.SERVER_DRAFTS_ENABLED !== "true") return disabled();

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

  if (!isSellerDraftInstance(payload.instance)) {
    return NextResponse.json(
      { ok: false, error: "Malformed draft instance" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await putDraft(email, payload.instance);
    if (!result.ok) {
      // Owned by another agent: 404 (never 403) so existence never leaks.
      return NextResponse.json(
        { ok: false, error: "Draft not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, instance: result.record.instance },
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
