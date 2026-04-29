import Link from "next/link";

// Stub — replaced with manifest-driven tool grid in H-0d.
export default function DashboardStubPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 lg:py-20">
        <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
          Simply Edit Pro Studio
        </p>
        <h1 className="text-3xl font-bold mt-1">Welcome to your Studio</h1>
        <p className="text-sm text-neutral-400 mt-3 max-w-lg">
          Pick a tool to get started.
        </p>

        <div className="mt-10">
          <Link
            href="/social-animator"
            className="group block p-6 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition border border-neutral-800 hover:border-[#4ef2d9]/50 max-w-md"
          >
            <h2 className="text-lg font-semibold">Social Animator</h2>
            <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
              Animated Instagram posts for real estate.
            </p>
            <p className="text-xs uppercase tracking-wider text-[#4ef2d9] mt-5 group-hover:translate-x-0.5 transition-transform">
              Open tool →
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
