import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { TOOLS } from "@/tools";
import * as LucideIcons from "lucide-react";

/**
 * Dashboard — the user's home base after auth. Renders the tool registry
 * (TOOLS from src/tools/index.ts). Live tools click through to their route;
 * coming-soon tools render disabled with a badge.
 */
export default async function DashboardPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const greetingName = email ? email.split("@")[0] : "";

  return (
    <main className="min-h-screen bg-neutral-950 text-white overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-6 py-12 lg:py-20">
        {/* Mobile: stack the heading group above the nav (Settings + Sign
            out) so neither clips the viewport. md+: side-by-side as before. */}
        <header className="mb-12 flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              Simply Edit Pro Studio
            </p>
            <h1 className="text-3xl font-bold mt-1">
              {greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."}
            </h1>
            <p className="text-sm text-neutral-400 mt-3 max-w-lg">
              Pick a tool to get started.
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

        <div className="grid md:grid-cols-2 gap-4">
          {TOOLS.map((tool) => {
            const Icon =
              (LucideIcons as unknown as Record<
                string,
                React.ComponentType<{ size?: number; className?: string }>
              >)[tool.icon] ?? LucideIcons.Sparkles;
            const isLive = tool.status === "live";

            const inner = (
              <div className="flex items-start gap-4 p-5 rounded-xl bg-neutral-900 border border-neutral-800 transition group-hover:border-[#4ef2d9]/50 group-hover:bg-neutral-800">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center">
                  <Icon size={22} className="text-[#4ef2d9]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">{tool.name}</h2>
                    {!isLive && (
                      <span className="text-[9px] uppercase tracking-wider text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                    {tool.description}
                  </p>
                  {isLive && (
                    <p className="text-[11px] uppercase tracking-wider text-[#4ef2d9] mt-3 group-hover:translate-x-0.5 transition-transform">
                      Open tool →
                    </p>
                  )}
                </div>
              </div>
            );

            if (isLive) {
              return (
                <Link key={tool.id} href={tool.route} className="group block">
                  {inner}
                </Link>
              );
            }
            return (
              <div
                key={tool.id}
                className="block opacity-50 cursor-not-allowed"
                aria-disabled
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
