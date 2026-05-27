import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { DashboardClient } from "./DashboardClient";
import "./sep-studio.css";

/**
 * Dashboard server shell (v1.47 Lane A — SEP-S Studio re-brand).
 *
 * Layer responsibilities:
 *   - Server: auth, AgentProfile resolution (entitlements + KV reads),
 *     the `?testTier=` URL knob, and the static topbar (brand + topnav
 *     + sign-out server action). Sign-out stays an inline server action
 *     because that's the cleanest Next.js App Router idiom for a single
 *     button — no need to extract to a 'use server' module.
 *   - Client (DashboardClient): welcome derived from localStorage (brand
 *     name, listing address, OH events), hero card driven by
 *     getActiveWorkflows + entitlement resolver, three stage sections,
 *     flagship Social Studio + modal, footer.
 *
 * Root: `.sep-studio` is the SINGLE scoping anchor for every CSS rule
 * in ./sep-studio.css. Other routes (/login, /h/[slug], wizard surfaces)
 * never receive this class, so the warm-dark palette / ambient orbs /
 * tile geometry can't leak. data-attrs (`data-bg`, `data-density`,
 * `data-stagedots`) carry static defaults; the TweaksPanel UI from the
 * reference is deliberately not ported (theme picker = A7f.3).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  const email = session?.user?.email ?? "";

  // ?testTier=base|pro|ai — Dallen's internal-test QA knob (§8.5).
  // Reading searchParams forces dynamic rendering on /dashboard, which
  // is fine — the route already depends on auth (also dynamic). The
  // resolver maps the override into AgentProfile.internalTestOverride,
  // which DashboardClient consumes via resolveEntitlements → resolveSkill.
  const sp = await searchParams;
  const agentProfile = await loadAgentProfile(email || null, {
    testTier: sp.testTier,
  });

  return (
    <main
      className="sep-studio"
      data-bg="warm"
      data-density="comfy"
      data-stagedots="on"
      data-testid="sep-studio-root"
    >
      <div className="ambient" aria-hidden>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div className="app">
        <header className="topbar" data-testid="sep-topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <span className="brand-dot" />
            </span>
            <span className="brand-name">
              SIMPLY EDIT <span className="brand-pro">PRO STUDIO</span>
            </span>
          </div>
          <nav className="topnav" aria-label="Primary">
            {/* Library route doesn't ship yet — link points to /library so
                the design lands intact; that route returns 404 today and
                will be wired in a follow-up (asset-library feature). */}
            <Link href="/library" className="topnav-link">
              Library
            </Link>
            <Link href="/settings" className="topnav-link">
              Brand kit
            </Link>
            <Link href="/settings" className="topnav-link">
              Settings
            </Link>
            <span className="topnav-sep" aria-hidden />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="topnav-link topnav-quiet"
                data-testid="sep-sign-out"
              >
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <DashboardClient agentProfile={agentProfile} />
      </div>
    </main>
  );
}
