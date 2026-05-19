"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

/**
 * Beta access route (v1.45.3).
 *
 * Private — shared via direct URL by the team admin. robots: noindex
 * lives in the sibling layout.tsx (Next.js App Router requires
 * metadata on server components). Renders an email + access-code form
 * that POSTs to /api/access/grant; on success, the user receives a
 * magic link that, when clicked, grants the subscription-paywall
 * bypass via the signIn callback in src/lib/auth.ts.
 *
 * Existing /login flow is untouched — non-dev users continue through
 * the normal magic-link + Stripe-paywall path.
 */

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function AccessPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const handleSubmit: React.ComponentProps<"form">["onSubmit"] = async (e) => {
    e.preventDefault();
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setState({ kind: "success" });
        return;
      }
      setState({
        kind: "error",
        message: data?.error ?? "Could not send sign-in email.",
      });
    } catch {
      setState({
        kind: "error",
        message: "Network error. Try again.",
      });
    }
  };

  const submitting = state.kind === "submitting";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas text-text-primary">
      <div className="w-full max-w-md">
        <Card>
          <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
            Beta access
          </p>
          <h1 className="text-2xl font-semibold mt-2">Sign in with a beta code</h1>
          <p className="text-sm text-text-secondary mt-3 leading-relaxed">
            Your team admin shared an email and access code. Enter both
            below and we&apos;ll send you a sign-in link.
          </p>

          {state.kind === "success" ? (
            <div className="mt-6 p-4 rounded border border-mint/40 bg-mint/5">
              <p className="text-sm text-mint font-medium">
                Check your email for a sign-in link.
              </p>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                The link expires in 24 hours. Click it from the same browser
                where you started, and you&apos;ll land directly on your
                dashboard.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="access-email"
                  className="block text-sm font-medium mb-1"
                >
                  Email
                </label>
                <input
                  id="access-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-md text-sm focus:outline-none focus:border-mint"
                  placeholder="you@example.com"
                  disabled={submitting}
                />
              </div>
              <div>
                <label
                  htmlFor="access-code"
                  className="block text-sm font-medium mb-1"
                >
                  Beta access code
                </label>
                <input
                  id="access-code"
                  type="text"
                  required
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-md text-sm font-mono uppercase tracking-wider focus:outline-none focus:border-mint"
                  placeholder="Enter the code from your invite"
                  disabled={submitting}
                />
              </div>

              {state.kind === "error" && (
                <p className="text-sm text-red-400">{state.message}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-mint text-black font-medium py-2.5 rounded-md hover:bg-mint-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? "Sending sign-in link…" : "Get access"}
              </button>
            </form>
          )}

          <p className="text-xs text-text-muted mt-6 leading-relaxed">
            Not part of the beta cohort?{" "}
            <a
              href="/login"
              className="text-mint hover:underline"
            >
              Sign in normally
            </a>{" "}
            (paid subscription required).
          </p>
        </Card>
      </div>
    </main>
  );
}
