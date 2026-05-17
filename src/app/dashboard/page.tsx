import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { DashboardClient } from "./DashboardClient";

/**
 * Dashboard — the user's home base after auth.
 *
 * W-1 Half B replaced the tool-launcher grid with a state-aware "next best
 * action" surface. The page shell stays a server component (auth + greeting +
 * Settings/Sign Out chrome); state detection lives in DashboardClient since
 * it needs window.localStorage.
 */
export default async function DashboardPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const greetingName = email ? email.split("@")[0] : "";

  return (
    <main className="min-h-screen bg-neutral-950 text-white overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-6 py-12 lg:py-20">
        <header className="mb-12 flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              Simply Edit Pro Studio
            </p>
            <h1 className="text-3xl font-bold mt-1">
              {greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."}
            </h1>
            <p className="text-sm text-neutral-400 mt-3 max-w-lg">
              What's happening in your business right now.
            </p>
          </div>
          <nav className="flex items-center gap-5 text-xs uppercase tracking-[0.15em]">
            <Link
              href="/settings"
              className="text-neutral-400 hover:text-[#4ef2d9] transition"
            >
              Settings →
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-neutral-400 hover:text-[#4ef2d9] transition"
              >
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <DashboardClient />
      </div>
    </main>
  );
}
