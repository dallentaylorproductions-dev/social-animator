import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStudioProfileSetupEnabled } from "@/lib/config/studio-profile";
import { appendStudioEvent } from "@/lib/studio-profile/funnel-store";
import {
  STUDIO_EVENT_NAMES,
  type StudioEventName,
  type StudioFunnelEvent,
} from "@/lib/studio-profile/events";

/**
 * POST /api/studio-profile/event (Studio Profile, Slice 1).
 *
 * The funnel-capture endpoint for the guided activation: /studio fires
 * fire-and-forget beacons (setup started, step entered/saved/skipped,
 * client-ready reached, full setup completed) and this appends them to the
 * agent's owner-scoped `studio:funnel:<email>` log.
 *
 * Mirrors the onboarding event route's posture:
 *   - returns 204 with no body in every case (a probe learns nothing),
 *   - never blocks the flow (the client ignores this response),
 *   - flag-off (STUDIO_PROFILE_SETUP !== 'true') no-ops without a KV touch,
 *   - owner-scoped: the email comes from the session, NEVER the body, so an
 *     agent can only write their own funnel.
 *
 * The body is `{ event, props? }`; `at` is stamped here so the client can't
 * backdate. An unknown event name is dropped (still 204).
 */
export const runtime = "nodejs";

/** One shared 204 — no body, never cached, identical for every outcome. */
function noContent(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

interface EventBody {
  event?: unknown;
  props?: unknown;
}

/** Coarse, non-PII props only: string | number | boolean values, capped. */
function sanitizeProps(
  raw: unknown,
): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 12) break;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else continue;
    count += 1;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Flag-off: dark. No KV touch, byte-identical to today.
  if (!isStudioProfileSetupEnabled()) return noContent();

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return noContent();

  let body: EventBody;
  try {
    body = (await req.json()) as EventBody;
  } catch {
    return noContent();
  }

  const name = typeof body.event === "string" ? body.event : "";
  if (!STUDIO_EVENT_NAMES.has(name)) return noContent();

  const event: StudioFunnelEvent = {
    event: name as StudioEventName,
    at: new Date().toISOString(),
    props: sanitizeProps(body.props),
  };

  try {
    await appendStudioEvent(email, event);
  } catch {
    // Best-effort: a capture failure never affects the flow.
  }
  return noContent();
}
