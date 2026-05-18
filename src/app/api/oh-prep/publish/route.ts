import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { publishHandout } from '@/lib/share-urls';
import { clampDraft } from '@/tools/open-house-prep/engine/types';

/**
 * POST /api/oh-prep/publish
 *
 * Auth-gated server-side publish endpoint for the Open House Prep
 * visitor handout. Wraps Commit 2's publishHandout() with the agent's
 * email as ownerEmail, type='open-house-handout', and merges the
 * agent's BrandSettings contact fields into the data payload so the
 * visitor handout page can render the "Your agent" section server-side
 * without cross-device localStorage access.
 *
 * Body: { draft: OpenHousePrepDraft, agentContact: { name, brokerage,
 *         phone, email, licenseNumber } }
 * Response: { ok: true, slug } | { ok: false, error }
 */
export const runtime = 'nodejs';

interface PublishPayload {
  draft: unknown;
  agentContact?: {
    name?: string;
    brokerage?: string;
    phone?: string;
    email?: string;
    licenseNumber?: string;
  };
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { ok: false, error: 'Not authenticated' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let payload: PublishPayload;
  try {
    payload = (await req.json()) as PublishPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const draft = clampDraft(payload.draft as Parameters<typeof clampDraft>[0]);
  if (
    !draft.propertyAddress.trim() ||
    !draft.listPrice.trim() ||
    !draft.eventDate.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: 'Required fields missing on draft' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Persist a flat data payload: every clamped draft field + the agent
  // contact block. The visitor handout page reads from data.agentContact
  // for Section 6 ("Your agent") and Section 7 ("What to do next").
  const data: Record<string, unknown> = {
    ...draft,
    agentContact: payload.agentContact ?? { email },
  };

  try {
    const result = await publishHandout({
      type: 'open-house-handout',
      ownerEmail: email,
      data,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { ok: true, slug: result.slug },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
