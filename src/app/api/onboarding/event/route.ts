import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOnboardingFirstRunEnabled } from "@/lib/config/onboarding-first-run";
import { isOnboardingFirstRunV2Enabled } from "@/lib/config/onboarding-first-run-v2";
import { appendOnboardingEvent } from "@/lib/onboarding/funnel-store";
import {
  ONBOARDING_EVENT_NAMES,
  type OnboardingEventName,
  type OnboardingFunnelEvent,
} from "@/lib/onboarding/events";

/**
 * POST /api/onboarding/event (Onboarding redesign, Pass 2).
 *
 * The funnel-capture endpoint for the first-run flow: the /welcome surface
 * fires fire-and-forget beacons (path chosen, preview reached, published,
 * sample converted, per-step drop-off) and this appends them to the agent's
 * owner-scoped `onboarding:funnel:<email>` log.
 *
 * Mirrors the viewed-signal beacon's posture:
 *   - returns 204 with no body in every case (a probe learns nothing),
 *   - never blocks the flow (the client ignores this response),
 *   - flag-off (ONBOARDING_FIRST_RUN !== 'true') no-ops without a KV touch,
 *   - owner-scoped: the email comes from the session, NEVER the body, so an
 *     agent can only write their own funnel.
 *
 * The body is `{ event, props? }`; `at` is stamped here, so the client can't
 * backdate. An unknown event name is dropped (still 204) - the vocabulary is
 * the single source of truth in events.ts.
 */
export const runtime = "nodejs";

/** One shared 204 - no body, never cached, identical for every outcome. */
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
  // Flag-off: dark. No KV touch, byte-identical to today. Honors EITHER flag so
  // a V2-only preview still captures the funnel.
  if (!isOnboardingFirstRunEnabled() && !isOnboardingFirstRunV2Enabled()) {
    return noContent();
  }

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
  if (!ONBOARDING_EVENT_NAMES.has(name)) return noContent();

  const event: OnboardingFunnelEvent = {
    event: name as OnboardingEventName,
    at: new Date().toISOString(),
    props: sanitizeProps(body.props),
  };

  try {
    await appendOnboardingEvent(email, event);
  } catch {
    // Best-effort: a capture failure never affects the flow.
  }
  return noContent();
}
