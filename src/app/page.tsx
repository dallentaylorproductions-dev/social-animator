import Link from "next/link";

export default function StudioLandingPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="absolute top-0 right-0 p-6">
        <Link
          href="/login"
          className="text-xs uppercase tracking-[0.15em] text-neutral-400 hover:text-[#4ef2d9] transition"
        >
          Sign in →
        </Link>
      </header>

      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
          Simply Edit Pro Studio
        </p>
        <h1 className="text-4xl md:text-5xl font-bold mt-3 max-w-3xl">
          Tools that help realtors produce client-ready content in minutes.
        </h1>
        <p className="text-base text-neutral-400 mt-5 max-w-xl">
          One subscription. Every tool. No design skills required.
        </p>
        <Link
          href="/login"
          className="mt-10 inline-flex items-center bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-6 py-3 text-sm font-semibold transition"
        >
          Get started
        </Link>
        <p className="mt-16 text-[11px] text-neutral-600">
          A real, polished landing page lands in H-0e.
        </p>
      </div>
    </main>
  );
}
