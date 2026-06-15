import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getOwnedBrandSettings,
  isBrandSettingsShape,
  putBrandSettings,
} from "@/lib/brand-settings-store";
import type { BrandSettings } from "@/lib/brand";

/**
 * /api/brand-settings — owner-scoped server persistence for an agent's brand
 * settings (mirrors /api/seller-presentation/drafts).
 *
 *   GET  → load THIS agent's brand settings (the server source of truth + the
 *          migration's "is anything already on the server" check).
 *   PUT  → idempotent upsert of this agent's brand settings (autosave +
 *          migration push both funnel through here). Keyed server-side by the
 *          owner email, last-write-wins by updatedAt.
 *
 * Both are AUTH-gated (401 anon) and OWNER-scoped server-side: the owner is
 * stamped from the SESSION (never the body) and the KV key embeds it, so a
 * second account can never see or clobber another agent's settings — the hard
 * privacy gate (a leak here would expose one agent's brand/proof to another).
 *
 * Flag-gated: 503 when SERVER_BRAND_SETTINGS_ENABLED !== 'true', so the endpoint
 * is inert until the feature flips and the flag-off product is byte-identical
 * (the client falls back to localStorage).
 *
 * GET  response: { ok, settings: BrandSettings | null, updatedAt?: string }
 * PUT  body:     { settings: BrandSettings, updatedAt: string }
 * PUT  response: { ok, settings: BrandSettings, updatedAt: string }
 */
export const runtime = "nodejs";

function disabled() {
  return NextResponse.json(
    {
      ok: false,
      code: "feature-disabled",
      error: "Server brand settings are not enabled",
    },
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
  if (process.env.SERVER_BRAND_SETTINGS_ENABLED !== "true") return disabled();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return unauthenticated();

  try {
    const record = await getOwnedBrandSettings(email);
    return NextResponse.json(
      {
        ok: true,
        // Echo the authenticated owner so the client can scope the one-time
        // localStorage→server migration to only-already-owned settings.
        email: email.toLowerCase(),
        settings: record?.settings ?? null,
        updatedAt: record?.updatedAt,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load brand settings";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

interface PutPayload {
  settings: BrandSettings;
  updatedAt: string;
}

export async function PUT(req: Request) {
  if (process.env.SERVER_BRAND_SETTINGS_ENABLED !== "true") return disabled();

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

  if (!isBrandSettingsShape(payload.settings)) {
    return NextResponse.json(
      { ok: false, error: "Malformed brand settings" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (typeof payload.updatedAt !== "string" || payload.updatedAt.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing updatedAt" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await putBrandSettings(
      email,
      payload.settings,
      payload.updatedAt,
    );
    return NextResponse.json(
      {
        ok: true,
        settings: result.record.settings,
        updatedAt: result.record.updatedAt,
      },
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
