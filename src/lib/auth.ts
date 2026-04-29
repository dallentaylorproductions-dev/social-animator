import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { UpstashRedisAdapter } from "@auth/upstash-redis-adapter";
import { Redis } from "@upstash/redis";

const resendKey = process.env.AUTH_RESEND_KEY;
const fromAddress =
  process.env.AUTH_EMAIL_FROM ?? "login@send.simplyeditpro.com";

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
    error: "/login?error=true",
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
