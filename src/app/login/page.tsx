"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { reconcileAccountOwnership } from "@/lib/account-storage";

/**
 * Unified sign-in (v1.47).
 *
 * One URL for both cohorts:
 *   - Paid users: enter email, get a magic link, click through to sign in.
 *   - Beta cohort: click "Have a beta access code?", enter email + code,
 *     sign in DIRECTLY (no email step) via the beta-code Credentials
 *     provider. The provider writes dev_access:<email> in KV so the
 *     middleware + entitlement resolver classify them as team-invite/pro.
 *
 * The code field is collapsed by default so paid users see the same form
 * they did before. When the code field has a non-empty value, submit
 * goes through Auth.js's client-side `signIn('beta-code', …)` and the
 * form navigates to /dashboard on success. When empty, submit uses
 * `signIn('resend', …)` and shows the "Check your email" intermediate
 * (unchanged from before).
 *
 * /access still exists as a 308 redirect to /login (next.config.ts) so
 * any beta links already shared keep working.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const checkEmail = params.get("check") === "email";
  const errored = params.get("error") === "true";
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeFieldOpen, setCodeFieldOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(checkEmail);
  const [error, setError] = useState<string | null>(
    errored ? "Sign-in failed. Please try again." : null,
  );

  const trimmedCode = code.trim();
  const codeProvided = codeFieldOpen && trimmedCode.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (codeProvided) {
        // Direct cohort sign-in (v1.47 Lane A polish). The Credentials
        // provider validates code + writes the dev_access KV record +
        // returns a session in one POST. On success we navigate the
        // user straight to /dashboard — no "Check your email" detour.
        const result = await signIn("beta-code", {
          email,
          code: trimmedCode,
          redirect: false,
        });
        // Auth.js v5: the credentials callback returns HTTP 200 even
        // on failure (with `?error=CredentialsSignin&code=…` in the
        // returned URL). `result.ok` is therefore true in both cases —
        // `result.error` is the real discriminator.
        if (result && !result.error) {
          // Account-cache isolation: this browser may hold a PRIOR agent's
          // per-account blobs (the credentials provider replaces the JWT
          // session in-place, so a stale local cache would otherwise render
          // for the new email). Reconcile against the just-authenticated
          // email before navigating — a different email wipes the cache and
          // re-stamps; the same email keeps it. The dashboard load reconciles
          // again as a catch-all (and covers the magic-link path).
          reconcileAccountOwnership(email.trim().toLowerCase());
          router.push(callbackUrl);
          return; // keep submitting=true during navigation
        }
        if (result?.code === "rate_limit") {
          setError("Too many attempts — try again in a moment.");
        } else if (result?.code === "credentials") {
          setError("Code not recognized.");
        } else {
          setError("Something went wrong — please try again.");
        }
      } else {
        // Paid path — unchanged. redirect:false keeps the form's
        // success state in control; the magic-link callbackUrl still
        // travels server-side via redirectTo so click-through lands on
        // the intended destination.
        const result = await signIn("resend", {
          email,
          redirectTo: callbackUrl,
          redirect: false,
        });
        if (result?.ok) {
          setSubmitted(true);
        } else {
          setError("Couldn't send sign-in email. Please try again.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">📨</div>
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="text-sm text-neutral-400 mt-3 leading-relaxed">
          We sent a sign-in link to{" "}
          <span className="text-white">{email || "your email"}</span>. Click it
          to continue. The link expires in 24 hours.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-8 text-xs text-neutral-500 hover:text-neutral-300 transition underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-mint">
        Simply Edit Pro Studio
      </p>
      <h1 className="text-2xl font-semibold mt-1 mb-2">Sign in</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Enter your email and we&apos;ll send you a sign-in link. No password
        needed.
      </p>

      <label
        htmlFor="login-email"
        className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2"
      >
        Email
      </label>
      <input
        id="login-email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-base lg:text-sm focus:outline-none focus:border-mint"
      />
      <p className="mt-2 text-[12px] text-neutral-500 leading-relaxed">
        We&apos;ll save your work to this email.
      </p>

      {codeFieldOpen ? (
        <div className="mt-4">
          <label
            htmlFor="login-code"
            className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2"
          >
            Beta access code
          </label>
          <input
            id="login-code"
            type="text"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code from your invite email"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-base lg:text-sm font-mono tracking-wider focus:outline-none focus:border-mint"
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !email}
        className="w-full mt-4 bg-mint hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting
          ? "Sending…"
          : codeProvided
            ? "Get access"
            : "Send sign-in link"}
      </button>

      {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}

      {codeFieldOpen ? (
        <button
          type="button"
          onClick={() => {
            setCodeFieldOpen(false);
            setCode("");
            setError(null);
          }}
          className="mt-4 text-[11px] text-neutral-500 hover:text-neutral-300 underline"
        >
          Hide beta access code
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setCodeFieldOpen(true)}
          className="mt-4 text-[11px] text-neutral-500 hover:text-neutral-300 underline"
        >
          Have a beta access code?
        </button>
      )}

      <p className="mt-8 text-[11px] text-neutral-600 leading-relaxed">
        We&apos;ll only use your email to send sign-in links and important
        account notifications.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6 py-12">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
