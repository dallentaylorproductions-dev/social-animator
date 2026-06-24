import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStudioProfileSetupEnabled } from "@/lib/config/studio-profile";
import { WelcomeAccountReconcile } from "@/app/welcome/WelcomeAccountReconcile";
import { StudioProfileSetup } from "./StudioProfileSetup";

/**
 * /studio — Studio Profile guided activation (Slice 1).
 *
 * A thin SERVER shell mirroring the /welcome gate:
 *   - flag OFF (STUDIO_PROFILE_SETUP !== 'true') → redirect to /dashboard. The
 *     flow does not exist when dark, so a stray link or a stale tab can never
 *     land on it; entry stays byte-identical to today and /settings remains the
 *     untouched returning-user edit surface.
 *   - flag ON → resolve the session email once and thread it down, exactly as
 *     the /welcome shell does, so the guided steps write the owner-scoped brand
 *     record and the funnel is owner-scoped.
 *
 * Account-cache reconcile runs FIRST (ahead of the flow) so a foreign brand left
 * in this browser is cleared before any brand-reading surface hydrates — the same
 * contamination guard /welcome uses. A same-account round-trip is a no-op.
 *
 * force-dynamic: the route is flag-gated, so the flag must be read at REQUEST
 * time, never baked at build (the redirect would otherwise freeze the build-time
 * flag value and break the runtime flip on preview). It is auth-gated anyway.
 */
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  if (!isStudioProfileSetupEnabled()) {
    redirect("/dashboard");
  }

  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;

  return (
    <>
      <WelcomeAccountReconcile email={ownerEmail} />
      <StudioProfileSetup ownerEmail={ownerEmail} />
    </>
  );
}
