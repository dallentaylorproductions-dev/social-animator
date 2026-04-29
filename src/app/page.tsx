import Link from "next/link";
import { TOOLS } from "@/tools";
import { PRICING } from "@/lib/pricing";
import * as LucideIcons from "lucide-react";

export default function StudioLandingPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="absolute top-0 inset-x-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
            Simply Edit Pro Studio
          </p>
          <Link
            href="/login"
            className="text-xs uppercase tracking-[0.15em] text-neutral-400 hover:text-[#4ef2d9] transition"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20 lg:pt-40 lg:pb-28">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Tools that help realtors produce client-ready content in minutes,
            not hours.
          </h1>
          <p className="text-base md:text-lg text-neutral-400 mt-6 max-w-xl mx-auto leading-relaxed">
            One subscription. Every tool we ship. No design skills required, no
            uploads, no clutter.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center mt-10 bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-7 py-3.5 text-sm font-semibold transition"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Tool preview */}
      <section className="px-6 py-20 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] text-center">
            What&apos;s inside
          </p>
          <h2 className="text-2xl md:text-3xl font-bold mt-2 text-center">
            Every tool included.
          </h2>

          <div className="grid md:grid-cols-3 gap-4 mt-12">
            {TOOLS.map((tool) => {
              const Icon =
                (LucideIcons as unknown as Record<
                  string,
                  React.ComponentType<{ size?: number; className?: string }>
                >)[tool.icon] ?? LucideIcons.Sparkles;
              const isLive = tool.status === "live";
              return (
                <div
                  key={tool.id}
                  className={`p-5 rounded-xl bg-neutral-900 border border-neutral-800 ${
                    !isLive ? "opacity-60" : ""
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-[#4ef2d9]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{tool.name}</h3>
                    {!isLive && (
                      <span className="text-[9px] uppercase tracking-wider text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 border-t border-neutral-900">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
            Pricing
          </p>
          <h2 className="text-2xl md:text-3xl font-bold mt-2">
            One plan. Unlimited use.
          </h2>
          <div className="mt-8 flex items-baseline justify-center gap-2">
            <span className="text-6xl font-bold tracking-tight">
              ${PRICING.monthlyPriceUSD}
            </span>
            <span className="text-neutral-400">/month</span>
          </div>
          <p className="text-sm text-neutral-400 mt-4">
            All current and upcoming tools, unlimited use. Cancel anytime.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center mt-8 bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-7 py-3.5 text-sm font-semibold transition"
          >
            Get started
          </Link>
          <p className="mt-6 text-[11px] text-neutral-600">
            Billing handled securely by Stripe.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-neutral-600">
          <p>© Simply Edit Pro Studio</p>
          <a
            href="https://simplyeditpro.com"
            className="hover:text-[#4ef2d9] transition"
          >
            simplyeditpro.com →
          </a>
        </div>
      </footer>
    </main>
  );
}
