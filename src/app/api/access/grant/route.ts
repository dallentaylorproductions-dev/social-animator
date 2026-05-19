import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { signIn } from "@/lib/auth";
import { markPendingDevAccess } from "@/lib/dev-access";

/**
 * POST /api/access/grant
 *
 * Beta cohort access flow (v1.45.3). Validates an access code, marks
 * the email as pending dev-access in KV, and triggers Auth.js to send
 * a Resend magic link. The pending KV record is promoted to a
 * permanent grant by the signIn callback when the user clicks the
 * link — proving email control before the bypass is granted.
 *
 * Body: { email: string, code: string }
 * Response: { ok: true } | { ok: false, error: string }
 *
 * Env: DEV_ACCESS_CODE must be set in Vercel (Production + Preview).
 * Without it, the endpoint returns 500. This is intentional — fail
 * closed if misconfigured.
 *
 * Rate limit: 10 attempts per IP per hour via KV. Keeps the access-code
 * surface non-brute-forceable in practice even though the code is
 * shared-secret-strong.
 */

export const runtime = "nodejs";

const DEV_ACCESS_CODE = process.env.DEV_ACCESS_CODE;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Constant-time string comparison. Overkill for friction-bypass code
 * but cheap. Mitigates any timing-oracle leak on the equality check.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getClientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; fall back to a stable fallback so
  // local dev still rate-limits consistently.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `rate_limit_access:${ip}`;
  const count = (await kv.incr(key)) as number;
  if (count === 1) {
    await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }
  return count <= RATE_LIMIT_MAX;
}

interface GrantPayload {
  email?: unknown;
  code?: unknown;
}

export async function POST(req: NextRequest) {
  if (!DEV_ACCESS_CODE) {
    return NextResponse.json(
      { ok: false, error: "Beta access is not configured." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Rate-limit before payload parsing so attackers can't bypass the
  // limit with malformed bodies.
  const ip = getClientIp(req);
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again in an hour." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: GrantPayload;
  try {
    payload = (await req.json()) as GrantPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!timingSafeEqual(code, DEV_ACCESS_CODE)) {
    return NextResponse.json(
      { ok: false, error: "Code not recognized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Code valid. Mark pending and trigger magic link.
  try {
    await markPendingDevAccess(email);
    await signIn("resend", {
      email,
      redirect: false,
    });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Auth.js's signIn() throws an internal NEXT_REDIRECT error when
    // redirect: false isn't honored cleanly in every environment.
    // Treat the redirect-style error as success — the magic link was
    // dispatched before the redirect attempt.
    if (
      err instanceof Error &&
      typeof err.message === "string" &&
      err.message.includes("NEXT_REDIRECT")
    ) {
      return NextResponse.json(
        { ok: true },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[dev-access] signIn failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not send sign-in email. Try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
