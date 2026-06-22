import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { UpstashRedisAdapter } from "@auth/upstash-redis-adapter";
import { Redis } from "@upstash/redis";
import { kv } from "@vercel/kv";
import { consumeDevAccessPending, grantDevAccess } from "@/lib/dev-access";
import {
  ACCESS_CODE_RATE_LIMIT_MAX,
  ACCESS_CODE_RATE_LIMIT_WINDOW_SECONDS,
  accessCodeRateLimitKey,
} from "@/lib/auth-rate-limit";

const resendKey = process.env.AUTH_RESEND_KEY;
const fromAddress =
  process.env.AUTH_EMAIL_FROM ?? "login@send.simplyeditpro.com";

const DEV_ACCESS_CODE = process.env.DEV_ACCESS_CODE;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Constant-time string compare. Cheap mitigation against timing-oracle
// leaks on the access-code equality check.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

// Per-IP budget against `rate_limit_access:<ip>` (see auth-rate-limit.ts
// for the values + rationale). Raised 10 → 40/hr in v1.6x L1 so a cohort
// behind one shared office IP isn't throttled; the shared-secret code
// keeps the surface non-brute-forceable even at the higher cap.
async function checkAccessRateLimit(ip: string): Promise<boolean> {
  const key = accessCodeRateLimitKey(ip);
  const count = (await kv.incr(key)) as number;
  if (count === 1) {
    await kv.expire(key, ACCESS_CODE_RATE_LIMIT_WINDOW_SECONDS);
  }
  return count <= ACCESS_CODE_RATE_LIMIT_MAX;
}

// Custom CredentialsSignin subclass so the client `signIn(..., { redirect: false })`
// result surfaces `code: "rate_limit"` and the form can render the
// "Too many attempts" copy instead of the generic "Code not recognized."
class AccessCodeRateLimitError extends CredentialsSignin {
  code = "rate_limit";
}

// Auth.js v5's Email/Resend provider requires an adapter to persist
// verification tokens (and minimal user/account stubs) — even with JWT
// sessions. We reuse the same Upstash KV that backs the paywall ledger,
// so no new infrastructure is provisioned. Sessions remain JWT (stateless);
// only token-exchange records and account stubs live in Redis (TTL'd).
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/**
 * Auth.js v5 config.
 *
 * Strategy: stateless JWT sessions (no DB adapter). Subscription status is
 * looked up by email separately in src/lib/subscription.ts (which reads from
 * Vercel KV) — Auth.js handles identity, KV handles paywall ledger.
 *
 * Dev fallback: if AUTH_RESEND_KEY is unset, log the magic link to the server
 * console instead of sending email. Lets you test login without Resend
 * configured locally.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: UpstashRedisAdapter(redis),
  providers: [
    // v1.47 Lane A polish: direct cohort sign-in. Email + valid
    // DEV_ACCESS_CODE → permanent dev-access grant + JWT session in one
    // POST. No magic-link intermediate (the code knowledge IS the
    // verification for the closed beta cohort). Paid users still use
    // the Resend provider below.
    //
    // Mirrors the validation primitives the retired POST /api/access/grant
    // used: same EMAIL_RE shape, same timing-safe code compare, same
    // `rate_limit_access:<ip>` per-IP budget (raised to 40/hr in v1.6x L1
    // for shared-office cohorts), same `dev_access:<email>` KV key (via
    // grantDevAccess) so the entitlement resolver and middleware recognize
    // the agent identically.
    Credentials({
      id: "beta-code",
      name: "Beta access code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Beta access code", type: "text" },
      },
      async authorize(credentials, request) {
        if (!DEV_ACCESS_CODE) {
          // Fail closed if the env var is missing — same posture as the
          // retired endpoint.
          console.error("[beta-code] DEV_ACCESS_CODE is not configured");
          return null;
        }

        const rawEmail =
          typeof credentials?.email === "string" ? credentials.email : "";
        const rawCode =
          typeof credentials?.code === "string" ? credentials.code : "";
        const email = rawEmail.trim().toLowerCase();
        const code = rawCode.trim();

        if (!email || !EMAIL_RE.test(email)) return null;
        if (!code) return null;

        // Rate-limit BEFORE the compare so a noisy IP can't pivot the
        // budget by toggling between malformed payloads.
        const ip = getClientIp(request.headers);
        const withinBudget = await checkAccessRateLimit(ip);
        if (!withinBudget) {
          throw new AccessCodeRateLimitError();
        }

        if (!timingSafeEqual(code, DEV_ACCESS_CODE)) return null;

        // Code valid → write the permanent record directly. Skips the
        // markPendingDevAccess intermediate the magic-link path uses;
        // the user proving knowledge of the code IS the verification
        // for this cohort surface. Write happens BEFORE the session
        // cookie ships, so the next request to /dashboard sees the
        // dev_access:<email> record on its middleware KV read.
        await grantDevAccess(email);

        return { id: email, email };
      },
    }),
    Resend({
      from: fromAddress,
      apiKey: resendKey,
      sendVerificationRequest: !resendKey
        ? async ({ identifier, url }) => {
            // Dev path — no Resend key. Log link, skip email.
            console.log("\n────────────────────────────────────────");
            console.log("[AUTH dev] Magic link for:", identifier);
            console.log("[AUTH dev]", url);
            console.log("────────────────────────────────────────\n");
          }
        : async ({ identifier, url, provider }) => {
            // Production path — send via Resend with branded template.
            const { Resend } = await import("resend");
            const resend = new Resend(resendKey);
            const { error } = await resend.emails.send({
              from: provider.from!,
              to: identifier,
              subject: "Sign in to Simply Edit Pro Studio",
              html: renderMagicLinkHtml(url),
              text: renderMagicLinkText(url),
            });
            if (error) {
              throw new Error(`Resend send failed: ${error.message}`);
            }
          },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?check=email",
    // Bare path — Auth.js's top-level error handler appends
    // `?error=<Type>` via naive `?` concatenation
    // (@auth/core/src/index.ts:194), so any trailing query string here
    // produces `/login?error=true?error=Verification` on the wire.
    error: "/login",
  },
  callbacks: {
    // v1.45.3 dev-access bypass: promote a pending dev-access record
    // to a permanent grant when the user clicks the magic link.
    //
    // The Auth.js v5 Email provider invokes this callback twice:
    //   Phase 1 (link CREATION, sendToken): `email.verificationRequest`
    //     is true. The user hasn't clicked anything yet — only the
    //     server has decided to send a link. Do NOT consume the pending
    //     record here; that would defeat the email-control proof.
    //   Phase 2 (link CLICK, callback handler): `email` is absent. The
    //     token was just verified against the adapter, so we know the
    //     user controls the email. Promote pending → permanent here.
    //
    // Graceful degradation: KV failures must never break sign-in.
    // Throwing here is caught upstream and converted to AccessDenied,
    // which redirects the user to the error page. A missing pending
    // record is also fine — the user just signs in without bypass and
    // hits the normal paywall.
    async signIn({ user, email }) {
      const isVerificationRequest = email?.verificationRequest === true;
      if (isVerificationRequest) return true;
      if (user?.email) {
        try {
          const wasPending = await consumeDevAccessPending(user.email);
          if (wasPending) {
            await grantDevAccess(user.email);
          }
        } catch (err) {
          console.error("[dev-access] signIn callback KV failure:", err);
        }
      }
      return true;
    },
  },
});

function renderMagicLinkHtml(url: string): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:48px 24px;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background-color:#171717;border-radius:12px;padding:40px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#4ef2d9;">Simply Edit Pro Studio</p>
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#ffffff;">Sign in to your Studio</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a3a3a3;">Click the button below to sign in. This link expires in 24 hours.</p>
                <a href="${url}" style="display:inline-block;background-color:#4ef2d9;color:#000000;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Sign in →</a>
                <p style="margin:32px 0 0;font-size:12px;line-height:1.6;color:#737373;">If the button doesn't work, paste this URL into your browser:<br><span style="color:#a3a3a3;word-break:break-all;">${url}</span></p>
                <p style="margin:24px 0 0;font-size:11px;line-height:1.6;color:#525252;">Didn't request this? You can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

function renderMagicLinkText(url: string): string {
  return [
    "Simply Edit Pro Studio",
    "",
    "Sign in to your Studio:",
    url,
    "",
    "This link expires in 24 hours.",
    "Didn't request this? You can safely ignore this email.",
  ].join("\n");
}
