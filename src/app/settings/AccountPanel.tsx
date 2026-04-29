"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

interface AccountPanelProps {
  email: string;
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
  currentPeriodEnd?: number;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Incomplete (expired)",
  unpaid: "Unpaid",
  paused: "Paused",
  none: "No subscription",
};

export function AccountPanel({
  email,
  subscriptionStatus,
  hasStripeCustomer,
  currentPeriodEnd,
}: AccountPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManageBilling = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const statusLabel = STATUS_LABELS[subscriptionStatus] ?? subscriptionStatus;
  const renewalDate = currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
          Email
        </p>
        <p className="text-sm">{email}</p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
          Subscription
        </p>
        <p className="text-sm">{statusLabel}</p>
        {renewalDate && (
          <p className="text-xs text-neutral-500 mt-1">
            Renews {renewalDate}
          </p>
        )}
      </div>

      {hasStripeCustomer && (
        <button
          type="button"
          onClick={handleManageBilling}
          disabled={submitting}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60"
        >
          {submitting ? "Opening…" : "Manage billing"}
        </button>
      )}

      {error && <p className="text-[12px] text-red-400">{error}</p>}

      <div className="pt-3 border-t border-neutral-800/60">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-neutral-500 hover:text-neutral-300 underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
