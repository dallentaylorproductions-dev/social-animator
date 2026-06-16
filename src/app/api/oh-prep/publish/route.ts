import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { publishHandout } from '@/lib/share-urls';
import { clampDraft } from '@/tools/open-house-prep/engine/types';
import { toPublicHandoutData } from '@/tools/open-house-prep/output/public-payload';

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
 * Data-minimization (memory `sep-ohprep-publish-data-minimization-gap`):
 * the route builds the PUBLIC payload via `toPublicHandoutData` and passes
 * ONLY that to `publishHandout`. The raw draft — with agent-only fields
 * like `preEventNotes`, talking points, and follow-up commitments — NEVER
 * enters the public KV record. Mirrors the seller-presentation publish
 * route's allowlist boundary.
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

  // Privacy boundary: build the PUBLIC-only payload (explicit allowlist
  // projection, no spread) and persist ONLY that. The raw draft's
  // agent-only fields (preEventNotes, talking points, common questions,
  // conversion prompts, follow-up commitments, dataSource, brand color
  // overrides) are dropped here and never reach the public KV record. The
  // visitor handout page reads data.agentContact for Section 6 ("Your
  // agent") and the contact CTAs.
  const data = toPublicHandoutData(
    draft,
    payload.agentContact ?? { email },
  ) as unknown as Record<string, unknown>;

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
