"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { PRICING, formatMonthlyPrice } from "@/lib/pricing";

function PaywallBody() {
  const params = useSearchParams();
  const canceled = params.get("canceled") === "true";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    canceled ? "Checkout was canceled. Try again whenever you're ready." : null
  );

  const handleSubscribe = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Checkout failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md w-full text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
        Simply Edit Pro Studio
      </p>
      <h1 className="text-3xl font-bold mt-2">Subscribe to access the Studio</h1>
      <p className="text-base text-neutral-400 mt-4 leading-relaxed">
        Unlimited use of every tool — current and upcoming. Cancel anytime.
      </p>

      <div className="mt-10 flex items-baseline justify-center gap-2">
        <span className="text-5xl font-bold tracking-tight">
          ${PRICING.monthlyPriceUSD}
        </span>
        <span className="text-neutral-400">/month</span>
      </div>

      <button
        onClick={handleSubscribe}
        disabled={submitting}
        className="mt-8 w-full bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-6 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Starting checkout…" : "Start subscription"}
      </button>

      {error && (
        <p className="mt-4 text-[12px] text-red-400 text-left">{error}</p>
      )}

      <p className="mt-10 text-[11px] text-neutral-600 leading-relaxed">
        Billing handled securely by Stripe. {formatMonthlyPrice()}, billed
        monthly. Cancel from Settings at any time.
      </p>

      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="mt-8 text-xs text-neutral-500 hover:text-neutral-300 underline"
      >
        Sign out
      </button>
    </div>
  );
}

export default function PaywallPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6 py-12">
      <Suspense fallback={null}>
        <PaywallBody />
      </Suspense>
    </main>
  );
}
