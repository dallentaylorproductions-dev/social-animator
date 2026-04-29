"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginForm() {
  const params = useSearchParams();
  const checkEmail = params.get("check") === "email";
  const errored = params.get("error") === "true";
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(checkEmail);
  const [error, setError] = useState<string | null>(
    errored ? "Sign-in failed. Please try again." : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn("resend", { email, redirectTo: callbackUrl });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Couldn't send sign-in email. Please try again.");
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
          We sent a sign-in link to <span className="text-white">{email || "your email"}</span>.
          Click it to continue. The link expires in 24 hours.
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
      <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
        Simply Edit Pro Studio
      </p>
      <h1 className="text-2xl font-semibold mt-1 mb-2">Sign in</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Enter your email and we&apos;ll send you a sign-in link. No password needed.
      </p>

      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        Email
      </label>
      <input
        type="email"
        required
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-[#4ef2d9]"
      />

      <button
        type="submit"
        disabled={submitting || !email}
        className="w-full mt-4 bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Sending…" : "Send sign-in link"}
      </button>

      {error && (
        <p className="mt-3 text-[12px] text-red-400">{error}</p>
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
