import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { revokeHandout } from '@/lib/share-urls';

/**
 * POST /api/oh-prep/revoke
 *
 * Auth-gated server-side soft-revoke for a previously-published OH
 * Prep visitor handout. The handout owner must match the authenticated
 * agent's email. Calls Commit 2's revokeHandout(); the record stays in
 * KV with revoked=true so fetchHandout returns null thereafter and
 * /h/[slug] surfaces the branded 404.
 *
 * Body: { slug: string }
 * Response: { ok: true } | { ok: false, error }
 */
export const runtime = 'nodejs';

interface RevokePayload {
  slug?: unknown;
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

  let payload: RevokePayload;
  try {
    payload = (await req.json()) as RevokePayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (typeof payload.slug !== 'string' || !payload.slug.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Missing slug' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const ok = await revokeHandout(payload.slug, email);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: 'Handout not found or not owned by this agent' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Revoke failed';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
