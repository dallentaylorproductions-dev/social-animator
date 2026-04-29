import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUser } from "@/lib/db";
import { BrandProfileForm } from "./BrandProfileForm";
import { AccountPanel } from "./AccountPanel";

export default async function SettingsPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";

  // KV read can fail in dev without KV configured — degrade gracefully.
  let subscriptionStatus = "none";
  let hasStripeCustomer = false;
  let currentPeriodEnd: number | undefined;
  if (email) {
    try {
      const user = await getUser(email);
      if (user) {
        subscriptionStatus = user.subscriptionStatus ?? "none";
        hasStripeCustomer = !!user.stripeCustomerId;
        currentPeriodEnd = user.currentPeriodEnd;
      }
    } catch (err) {
      console.warn("[settings] failed to read user record:", err);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-12 lg:py-20">
        <header className="mb-10">
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] hover:underline"
          >
            ← Studio
          </Link>
          <h1 className="text-3xl font-bold mt-2">Settings</h1>
        </header>

        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-1">Brand profile</h2>
          <p className="text-xs text-neutral-500 mb-6">
            Used across every Studio tool — logo watermark on Social Animator
            exports, header on flyers and presentations as those tools ship.
          </p>
          <BrandProfileForm />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-1">Account</h2>
          <p className="text-xs text-neutral-500 mb-6">
            Subscription and billing.
          </p>
          <AccountPanel
            email={email}
            subscriptionStatus={subscriptionStatus}
            hasStripeCustomer={hasStripeCustomer}
            currentPeriodEnd={currentPeriodEnd}
          />
        </section>
      </div>
    </main>
  );
}
